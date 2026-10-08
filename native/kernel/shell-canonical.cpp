#include "shell-validation.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepLib.hxx>
#include <BRepTools_Modification.hxx>
#include <BRepTools_Modifier.hxx>
#include <BRep_Tool.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <GeomAdaptor_Curve.hxx>
#include <GeomConvert_CurveToAnaCurve.hxx>
#include <GeomConvert_SurfToAnaSurf.hxx>
#include <GeomProjLib.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
constexpr double conversionTolerance = 1e-7;
struct Cylinder {
    TopoDS_Face source;
    Handle(Geom_CylindricalSurface) surface;
    bool reversed;
};
struct Curve {
    TopoDS_Edge source;
    Handle(Geom_Curve) curve;
    double first, last;
};
std::vector<Cylinder> cylinders(const Operand& body) {
    std::vector<Cylinder> result;
    for (const auto& entity : body.entities) {
        if (entity.shape.ShapeType() != TopAbs_FACE) continue;
        const auto face = TopoDS::Face(entity.shape);
        BRepAdaptor_Surface original(face);
        if (original.GetType() != GeomAbs_BSplineSurface && original.GetType() != GeomAbs_BezierSurface) continue;
        GeomConvert_SurfToAnaSurf recognition(BRep_Tool::Surface(face));
        const auto converted = recognition.ConvertToAnalytical(conversionTolerance,
            original.FirstUParameter(), original.LastUParameter(),
            original.FirstVParameter(), original.LastVParameter());
        const auto cylinder = Handle(Geom_CylindricalSurface)::DownCast(converted);
        if (cylinder.IsNull() || !std::isfinite(recognition.Gap()) ||
            recognition.Gap() < 0 || recognition.Gap() > conversionTolerance) continue;
        gp_Pnt p; gp_Vec du, dv;
        original.D1((original.FirstUParameter() + original.LastUParameter()) / 2,
                    (original.FirstVParameter() + original.LastVParameter()) / 2, p, du, dv);
        auto axes = cylinder->Position();
        const gp_Vec axial(axes.Direction());
        const gp_Vec radial = gp_Vec(axes.Location(), p) - axial * gp_Vec(axes.Location(), p).Dot(axial);
        if (radial.Magnitude() < conversionTolerance) continue;
        if (!axes.Direct()) axes.YReverse();
        // Keep a direct analytic support, with the periodic seam opposite the patch center.
        axes.SetXDirection(gp_Dir(-radial));
        cylinder->SetPosition(axes);
        for (int i = 0; i <= 16; ++i) for (int j = 0; j <= 16; ++j) {
            const auto q = original.Value(original.FirstUParameter() +
                (original.LastUParameter() - original.FirstUParameter()) * i / 16,
                original.FirstVParameter() + (original.LastVParameter() - original.FirstVParameter()) * j / 16);
            GeomAPI_ProjectPointOnSurf projection(q, cylinder);
            if (!projection.IsDone() || !projection.NbPoints() || projection.LowerDistance() > conversionTolerance)
                throw std::runtime_error("Solid preparation could not verify a cylindrical spline support");
        }
        result.push_back({face, cylinder, du.Crossed(dv).Dot(radial) < 0});
    }
    return result;
}
std::vector<Curve> curves(const Operand& body) {
    std::vector<Curve> result;
    for (const auto& entity : body.entities) {
        if (entity.shape.ShapeType() != TopAbs_EDGE) continue;
        const auto edge = TopoDS::Edge(entity.shape);
        BRepAdaptor_Curve original(edge);
        if (original.GetType() != GeomAbs_BSplineCurve && original.GetType() != GeomAbs_BezierCurve) continue;
        // The two endpoint parameters must have distinct topological vertices.
        if (TopExp::FirstVertex(edge).IsSame(TopExp::LastVertex(edge))) continue;
        double first, last, newFirst, newLast;
        const auto spatial = BRep_Tool::Curve(edge, first, last);
        GeomConvert_CurveToAnaCurve recognition(spatial);
        Handle(Geom_Curve) analytic;
        if (!recognition.ConvertToAnalytical(conversionTolerance, analytic, first, last, newFirst, newLast) ||
            analytic.IsNull() || !std::isfinite(recognition.Gap()) || recognition.Gap() < 0 ||
            recognition.Gap() > conversionTolerance) continue;
        const auto type = GeomAdaptor_Curve(analytic).GetType();
        if (type != GeomAbs_Line && type != GeomAbs_Circle) continue;
        if (!std::isfinite(newFirst) || !std::isfinite(newLast) || newLast <= newFirst ||
            spatial->Value(first).Distance(analytic->Value(newFirst)) > conversionTolerance ||
            spatial->Value(last).Distance(analytic->Value(newLast)) > conversionTolerance)
            throw std::runtime_error("Solid preparation could not verify analytic boundary endpoints");
        result.push_back({edge, analytic, newFirst, newLast});
    }
    return result;
}
// Reparameterize verified cylindrical fillets and analytic boundaries together.
// Project every affected pcurve; copying the old UV coordinates is not equivalent.
class CylinderSupports : public BRepTools_Modification {
    std::vector<Cylinder> supports;
    std::vector<Curve> boundaries;
    const Curve* boundary(const TopoDS_Edge& edge) const {
        for (const auto& curve : boundaries) if (curve.source.IsSame(edge)) return &curve;
        return nullptr;
    }
    const Cylinder* support(const TopoDS_Face& face) const {
        for (const auto& cylinder : supports) if (cylinder.source.IsSame(face)) return &cylinder;
        return nullptr;
    }
public:
    explicit CylinderSupports(const Operand& body) : supports(cylinders(body)) {
        if (!supports.empty()) boundaries = curves(body);
    }
    bool empty() const { return supports.empty(); }
    Standard_Boolean NewSurface(const TopoDS_Face& face, Handle(Geom_Surface)& surface,
            TopLoc_Location& location, double& tolerance, Standard_Boolean& reverseWires,
            Standard_Boolean& reverseFace) override {
        const auto cylinder = support(face);
        if (!cylinder) return false;
        surface = cylinder->surface;
        location = TopLoc_Location();
        tolerance = BRep_Tool::Tolerance(face);
        reverseWires = reverseFace = cylinder->reversed;
        return true;
    }
    Standard_Boolean NewCurve2d(const TopoDS_Edge& edge, const TopoDS_Face& face,
            const TopoDS_Edge&, const TopoDS_Face&, Handle(Geom2d_Curve)& curve, double& tolerance) override {
        const auto cylinder = support(face);
        const auto converted = boundary(edge);
        if (!cylinder && !converted) return false;
        const Handle(Geom_Surface) surface = cylinder
            ? Handle(Geom_Surface)(cylinder->surface) : BRep_Tool::Surface(face);
        double first, last;
        auto spatial = BRep_Tool::Curve(edge, first, last);
        if (converted) {
            spatial = converted->curve;
            first = converted->first;
            last = converted->last;
        }
        if (spatial.IsNull()) throw std::runtime_error("Solid preparation cannot reparameterize a degenerate spline boundary");
        tolerance = conversionTolerance;
        curve = GeomProjLib::Curve2d(spatial, first, last, surface, tolerance);
        if (curve.IsNull() || !std::isfinite(tolerance) || tolerance > conversionTolerance)
            throw std::runtime_error("Solid preparation could not project a cylindrical boundary precisely");
        return true;
    }
    Standard_Boolean NewCurve(const TopoDS_Edge& edge, Handle(Geom_Curve)& curve,
            TopLoc_Location& location, double& tolerance) override {
        const auto converted = boundary(edge);
        if (!converted) return false;
        curve = converted->curve;
        location = TopLoc_Location();
        tolerance = BRep_Tool::Tolerance(edge);
        return true;
    }
    Standard_Boolean NewPoint(const TopoDS_Vertex&, gp_Pnt&, double&) override { return false; }
    Standard_Boolean NewParameter(const TopoDS_Vertex& vertex, const TopoDS_Edge& edge,
            double& parameter, double& tolerance) override {
        const auto converted = boundary(edge);
        if (!converted) return false;
        const auto start = TopExp::FirstVertex(TopoDS::Edge(edge.Oriented(TopAbs_FORWARD)));
        parameter = vertex.IsSame(start) ? converted->first : converted->last;
        tolerance = BRep_Tool::Tolerance(vertex);
        return true;
    }
    GeomAbs_Shape Continuity(const TopoDS_Edge& edge, const TopoDS_Face& a, const TopoDS_Face& b,
            const TopoDS_Edge&, const TopoDS_Face&, const TopoDS_Face&) override {
        return BRep_Tool::Continuity(edge, a, b);
    }
};
}
namespace shell_tool {
Operand canonical(const Operand& original, const char* context) {
    const auto source = offset_geometry::prepare(original, context, nullptr, true);
    Handle(CylinderSupports) modification = new CylinderSupports(source);
    if (modification->empty()) return source;
    // prepare validated this copy; recognition only reads it and creates new
    // supports. Revalidate below after modifier/SameParameter change geometry.
    BRepTools_Modifier modifier(false);
    modifier.Init(source.shape);
    modifier.Perform(modification);
    if (!modifier.IsDone()) throw std::runtime_error("Solid preparation could not prepare cylindrical spline surfaces");
    Operand result{source.id, modifier.ModifiedShape(source.shape), {}};
    // Geometric projection alone does not preserve the old spline parameterization.
    BRepLib::SameParameter(result.shape, conversionTolerance, true);
    offset_geometry::validSolid(result.shape, context);
    TopTools_IndexedMapOfShape mapped;
    TopExp::MapShapes(result.shape, mapped);
    for (const auto& entity : source.entities) {
        const auto shape = modifier.ModifiedShape(entity.shape);
        const auto index = mapped.FindIndex(shape);
        if (!index) throw std::runtime_error("Solid preparation lost a source entity");
        // Modifier history has local orientations; take oriented entities from the solid.
        result.entities.push_back({entity.id, mapped(index)});
    }
    const double allowed = std::max(1e-9, volume(source.shape) * 1e-10);
    if (volume(subtract(source.shape, result.shape)) > allowed || volume(subtract(result.shape, source.shape)) > allowed)
        throw std::runtime_error("Solid preparation changed the source solid");
    return result;
}
}
