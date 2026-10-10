#include "edge-finish-conditioning.h"
#include <BRep_Tool.hxx>
#include <BRepLib.hxx>
#include <TopExp_Explorer.hxx>
#include <BRepTools_Modification.hxx>
#include <BRepTools_Modifier.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_Plane.hxx>
#include <Geom_SurfaceOfLinearExtrusion.hxx>
#include <Geom2d_BezierCurve.hxx>
#include <TopoDS.hxx>
#include <TopTools_MapOfShape.hxx>
#include <gp_Vec2d.hxx>
#include <cmath>

namespace {
// For nonrational Beziers, displacing poles by at most this amount bounds
// every point of the curve (and its linear extrusion) by the same amount.
constexpr double displacement = 1e-6;

template<class Curve, class Vector>
bool regularize(const Curve& curve) {
    if (curve.IsNull() || curve->IsRational() || curve->Degree() != 3) return false;
    bool changed = false;
    for (const auto end : {1, 4}) {
        const int handle = end == 1 ? 2 : 3, other = end == 1 ? 3 : 2;
        const auto point = curve->Pole(end);
        if (point.Distance(curve->Pole(handle)) > 1e-12) continue;
        Vector direction(point, curve->Pole(other));
        if (direction.Magnitude() <= displacement) continue;
        direction.Normalize();
        curve->SetPole(handle, point.Translated(direction * displacement));
        changed = true;
    }
    return changed;
}

Handle(Geom_BezierCurve) conditionedCurve(const Handle(Geom_Curve)& source) {
    auto curve = Handle(Geom_BezierCurve)::DownCast(source);
    if (curve.IsNull()) return {};
    curve = Handle(Geom_BezierCurve)::DownCast(curve->Copy());
    return regularize<Handle(Geom_BezierCurve), gp_Vec>(curve) ? curve : Handle(Geom_BezierCurve){};
}

class Conditioning : public BRepTools_Modification {
    TopTools_MapOfShape faces, edges;
public:
    bool changed = false;
    explicit Conditioning(const TopoDS_Shape& shape) {
        for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) {
            const auto face = TopoDS::Face(it.Current());
            TopLoc_Location location;
            const auto surface = Handle(Geom_SurfaceOfLinearExtrusion)::DownCast(BRep_Tool::Surface(face, location));
            if (std::abs(std::abs(location.Transformation().ScaleFactor()) - 1) > 1e-12) continue;
            if (surface.IsNull() || conditionedCurve(surface->BasisCurve()).IsNull()) continue;
            faces.Add(face);
            for (TopExp_Explorer boundary(face, TopAbs_EDGE); boundary.More(); boundary.Next())
                edges.Add(boundary.Current());
        }
    }
    bool needed() const { return !faces.IsEmpty(); }
    Standard_Boolean NewSurface(const TopoDS_Face& face, Handle(Geom_Surface)& surface,
                               TopLoc_Location& location, double& tolerance,
                               Standard_Boolean& reverseWires, Standard_Boolean& reverseFace) override {
        if (!faces.Contains(face)) return false;
        const auto original = Handle(Geom_SurfaceOfLinearExtrusion)::DownCast(BRep_Tool::Surface(face, location));
        if (original.IsNull()) return false;
        const auto curve = conditionedCurve(original->BasisCurve());
        if (curve.IsNull()) return false;
        surface = new Geom_SurfaceOfLinearExtrusion(curve, original->Direction());
        tolerance = BRep_Tool::Tolerance(face);
        reverseWires = reverseFace = false;
        changed = true;
        return true;
    }
    Standard_Boolean NewCurve(const TopoDS_Edge& edge, Handle(Geom_Curve)& curve,
                             TopLoc_Location& location, double& tolerance) override {
        if (!edges.Contains(edge)) return false;
        double first, last;
        curve = conditionedCurve(BRep_Tool::Curve(edge, location, first, last));
        if (curve.IsNull()) return false;
        tolerance = BRep_Tool::Tolerance(edge);
        changed = true;
        return true;
    }
    Standard_Boolean NewCurve2d(const TopoDS_Edge& edge, const TopoDS_Face& face,
                               const TopoDS_Edge&, const TopoDS_Face&,
                               Handle(Geom2d_Curve)& curve, double& tolerance) override {
        // Extrusion pcurves keep their original parameters. Planar caps carry
        // the same cubic in an orthonormal plane frame, so condition it equally.
        double first, last;
        const auto surface = BRep_Tool::Surface(face);
        if (faces.Contains(face)) {
            curve = BRep_Tool::CurveOnSurface(edge, face, first, last);
            tolerance = BRep_Tool::Tolerance(edge);
            return !curve.IsNull();
        }
        if (!edges.Contains(edge) || Handle(Geom_Plane)::DownCast(surface).IsNull()) return false;
        const auto source = Handle(Geom2d_BezierCurve)::DownCast(BRep_Tool::CurveOnSurface(edge, face, first, last));
        if (source.IsNull()) return false;
        const auto next = Handle(Geom2d_BezierCurve)::DownCast(source->Copy());
        if (!regularize<Handle(Geom2d_BezierCurve), gp_Vec2d>(next)) return false;
        curve = next;
        tolerance = BRep_Tool::Tolerance(edge);
        return true;
    }
    Standard_Boolean NewPoint(const TopoDS_Vertex&, gp_Pnt&, double&) override { return false; }
    Standard_Boolean NewParameter(const TopoDS_Vertex&, const TopoDS_Edge&, double&, double&) override { return false; }
    GeomAbs_Shape Continuity(const TopoDS_Edge& edge, const TopoDS_Face& a, const TopoDS_Face& b,
                            const TopoDS_Edge&, const TopoDS_Face& newA, const TopoDS_Face& newB) override {
        if (a.IsSame(newA) && b.IsSame(newB)) return BRep_Tool::Continuity(edge, a, b);
        // Collapsed derivatives can leave spurious smooth-edge flags.
        return GeomAbs_C0;
    }
};
}

Operand conditionEdgeFinish(const Operand& body) {
    Handle(Conditioning) conditioning = new Conditioning(body.shape);
    if (!conditioning->needed()) return body;
    BRepTools_Modifier modifier(body.shape, conditioning);
    if (!conditioning->changed) return body;
    if (!modifier.IsDone()) throw std::runtime_error("Cannot condition singular Bezier supports");
    Operand result{body.id, modifier.ModifiedShape(body.shape), {}};
    BRepLib::EncodeRegularity(result.shape);
    try {
        validate(result.shape);
    } catch (const std::runtime_error&) {
        return body;
    }
    for (const auto& entity : body.entities)
        result.entities.push_back({entity.id, modifier.ModifiedShape(entity.shape)});
    return result;
}
