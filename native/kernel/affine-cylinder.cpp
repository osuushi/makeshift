#include "scale-transform.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepLib.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Geom2d_Curve.hxx>
#include <GeomProjLib.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <algorithm>

namespace {
constexpr double tolerance = 1e-7;

Handle(Geom2d_Curve) projected(const TopoDS_Edge& source, const TopoDS_Edge& mapped,
                             const TopoDS_Face& face, const Handle(Geom_Surface)& surface) {
    double first, last, precision = tolerance;
    const auto spatial = BRep_Tool::Curve(mapped, first, last);
    if (spatial.IsNull()) throw std::runtime_error("Missing scaled cylindrical boundary");
    auto curve = GeomProjLib::Curve2d(spatial, first, last, surface, precision);
    if (curve.IsNull() || !std::isfinite(precision) || precision > tolerance)
        throw std::runtime_error("Cannot project scaled cylindrical boundary precisely");
    double oldFirst, oldLast;
    // Match the forward result support. A reversed face swaps its seam branches.
    const auto old = BRep_Tool::CurveOnSurface(source,
        TopoDS::Face(face.Oriented(TopAbs_FORWARD)), oldFirst, oldLast);
    if (old.IsNull()) throw std::runtime_error("Missing cylindrical boundary parameters");
    const double period = 2 * std::acos(-1);
    // Preserve the original periodic branch, including both sides of a seam.
    const double shift = period * std::round((old->Value((oldFirst + oldLast) / 2).X()
        - curve->Value((first + last) / 2).X()) / period);
    curve->Translate(gp_Vec2d(shift, 0));
    return curve;
}

void verifyBoundary(const TopoDS_Edge& edge, const TopoDS_Face& face,
                    const Handle(Geom_Surface)& surface) {
    double first, last, uvFirst, uvLast;
    const auto spatial = BRep_Tool::Curve(edge, first, last);
    const auto curve = BRep_Tool::CurveOnSurface(edge, face, uvFirst, uvLast);
    if (curve.IsNull() || std::abs(first - uvFirst) > 1e-12 || std::abs(last - uvLast) > 1e-12)
        throw std::runtime_error("Scaled cylindrical boundary parameters are inconsistent");
    for (int i = 0; i <= 64; ++i) {
        const double t = first + (last - first) * i / 64;
        const auto uv = curve->Value(t);
        if (surface->Value(uv.X(), uv.Y()).Distance(spatial->Value(t)) > tolerance)
            throw std::runtime_error("Scaled cylindrical boundary exceeds tolerance");
    }
}
}

TopoDS_Face affineCylinder(const TopoDS_Face& source, const gp_GTrsf& transform,
                          BRepBuilderAPI_GTransform& operation) {
    const auto cylinder = BRepAdaptor_Surface(source).Cylinder();
    const auto axes = cylinder.Position();
    const auto matrix = transform.VectorialPart();
    const gp_Vec u(matrix * axes.XDirection().XYZ());
    const gp_Vec v(matrix * axes.YDirection().XYZ());
    const gp_Vec axial(matrix * axes.Direction().XYZ());
    const double radialScale = u.Magnitude();
    // Equal perpendicular radial directions and a perpendicular axis retain a
    // circular cylinder. An elliptical or sheared cylinder must remain a spline.
    constexpr double relative = 1e-12;
    if (std::abs(radialScale - v.Magnitude()) > relative * radialScale ||
        std::abs(u.Dot(v)) > relative * radialScale * v.Magnitude() ||
        std::abs(u.Dot(axial)) > relative * radialScale * axial.Magnitude() ||
        std::abs(v.Dot(axial)) > relative * v.Magnitude() * axial.Magnitude()) return {};
    auto origin = axes.Location().XYZ();
    transform.Transforms(origin);
    gp_Ax3 next{gp_Pnt(origin), gp_Dir(axial), gp_Dir(u)};
    if (!axes.Direct()) next.YReverse();
    const Handle(Geom_Surface) surface = new Geom_CylindricalSurface(next, cylinder.Radius() * radialScale);
    const auto mapped = TopoDS::Face(operation.ModifiedShape(source));
    BRep_Builder builder;
    TopoDS_Face result;
    builder.MakeFace(result, surface, BRep_Tool::Tolerance(mapped));
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(source, TopAbs_EDGE, edges);
    std::vector<std::pair<TopoDS_Edge, double>> boundaries;
    for (int i = 1; i <= edges.Extent(); ++i) {
        auto edge = TopoDS::Edge(edges(i).Oriented(TopAbs_FORWARD));
        const auto moved = TopoDS::Edge(operation.ModifiedShape(edge));
        boundaries.push_back({moved, std::max(tolerance * 2, BRep_Tool::Tolerance(moved))});
        const auto curve = projected(edge, moved, source, surface);
        if (BRep_Tool::IsClosed(edge, source)) {
            edge.Reverse();
            builder.UpdateEdge(moved, curve, projected(edge, moved, source, surface), result, tolerance);
        } else builder.UpdateEdge(moved, curve, result, tolerance);
    }
    auto forward = mapped;
    forward.Orientation(TopAbs_FORWARD);
    for (TopExp_Explorer wires(forward, TopAbs_WIRE); wires.More(); wires.Next())
        builder.Add(result, wires.Current());
    // GTransform's rational rims and projected angular curves have different
    // parameterizations. Establish correspondence before checking point distances.
    // Leave headroom for the approximation's measured error, checked below.
    BRepLib::SameParameter(result, tolerance / 10, true);
    for (const auto& [edge, allowed] : boundaries) {
        if (BRep_Tool::Tolerance(edge) > allowed)
            throw std::runtime_error("Scaled cylindrical edge exceeds tolerance");
        verifyBoundary(edge, result, surface);
        if (BRep_Tool::IsClosed(edge, result)) verifyBoundary(TopoDS::Edge(edge.Reversed()), result, surface);
    }
    result.Orientation(mapped.Orientation());
    return result;
}
