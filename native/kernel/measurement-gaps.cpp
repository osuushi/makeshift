#include "measurement.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <GeomAPI_ProjectPointOnCurve.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Circ.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>

namespace {
constexpr double tolerance = 1e-6;
// Project to the supporting geometry, then test its trimmed domain. Clamping to
// a remote boundary would turn lateral overhang into a misleading diagonal gap.
std::optional<gp_Pnt> foot(const gp_Pnt& p, const TopoDS_Shape& target) {
    if (target.ShapeType() == TopAbs_EDGE) {
        double first, last;
        const auto curve = BRep_Tool::Curve(TopoDS::Edge(target), first, last);
        if (curve.IsNull()) return {};
        GeomAPI_ProjectPointOnCurve projection(p, curve, first, last);
        if (!projection.NbPoints()) return {};
        const auto q = projection.NearestPoint();
        gp_Pnt ignored; gp_Vec tangent;
        curve->D1(projection.LowerDistanceParameter(), ignored, tangent);
        if (tangent.Magnitude() < tolerance) return {};
        if (std::abs(gp_Vec(q, p).Dot(tangent.Normalized())) > tolerance) return {};
        return q;
    }
    if (infiniteMeasurementPlane(target)) {
        const auto plane = BRepAdaptor_Surface(TopoDS::Face(target)).Plane();
        const gp_Vec n(plane.Axis().Direction());
        return p.Translated(n * -gp_Vec(plane.Location(), p).Dot(n));
    }
    const auto face = TopoDS::Face(target);
    const auto surface = BRep_Tool::Surface(face);
    GeomAPI_ProjectPointOnSurf projection(p, surface);
    if (!projection.NbPoints()) return {};
    double u, v; projection.LowerDistanceParameters(u, v);
    BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), tolerance);
    if (classifier.State() != TopAbs_IN && classifier.State() != TopAbs_ON) return {};
    return projection.NearestPoint();
}
void edgeSamples(const TopoDS_Edge& edge, std::vector<gp_Pnt>& result) {
    if (BRep_Tool::Degenerated(edge)) return;
    BRepAdaptor_Curve curve(edge);
    const double first = curve.FirstParameter(), last = curve.LastParameter();
    if (!std::isfinite(first) || !std::isfinite(last)) return;
    for (int i = 0; i <= 32; ++i) result.push_back(curve.Value(first + (last - first) * i / 32));
}
bool unobstructed(const TopoDS_Shape& source, const gp_Pnt& p, const gp_Pnt& q) {
    gp_Pnt center; gp_Dir axis; bool round = false, circle = false;
    if (source.ShapeType() == TopAbs_EDGE) {
        BRepAdaptor_Curve curve(TopoDS::Edge(source));
        if (curve.GetType() == GeomAbs_Circle) {
            center = curve.Circle().Location(); axis = curve.Circle().Axis().Direction();
            round = true; circle = true;
        }
    } else {
        BRepAdaptor_Surface surface(TopoDS::Face(source));
        if (surface.GetType() == GeomAbs_Cylinder) {
            center = surface.Cylinder().Location(); axis = surface.Cylinder().Axis().Direction(); round = true;
        }
    }
    if (!round) return true;
    const gp_Vec n(axis), direction(p, q);
    if (circle && std::abs(direction.Dot(n)) > tolerance) return true;
    const gp_Vec radial = gp_Vec(center,p) - n * gp_Vec(center,p).Dot(n);
    const gp_Vec travel = direction - n * direction.Dot(n);
    if (travel.SquareMagnitude() < tolerance*tolerance) return true;
    const double t = -2 * radial.Dot(travel) / travel.SquareMagnitude();
    if (t <= 1e-7 || t >= 1-1e-7) return true;
    const auto crossing = p.Translated(direction*t);
    const auto onSource = foot(crossing, source);
    // Ignore a far-side correspondence that crosses the selected curve/wall again.
    return !onSource || onSource->Distance(crossing) > tolerance;
}
std::vector<gp_Pnt> samples(const TopoDS_Shape& shape) {
    std::vector<gp_Pnt> result;
    if (infiniteMeasurementPlane(shape)) return result;
    if (shape.ShapeType() == TopAbs_EDGE) edgeSamples(TopoDS::Edge(shape), result);
    else {
        const auto face = TopoDS::Face(shape);
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) edgeSamples(TopoDS::Edge(e.Current()), result);
        double u0, u1, v0, v1; BRepTools::UVBounds(face, u0, u1, v0, v1);
        if (!std::isfinite(u0 + u1 + v0 + v1)) return result;
        BRepAdaptor_Surface surface(face);
        for (int i = 0; i <= 16; ++i) for (int j = 0; j <= 16; ++j) {
            const double u = u0 + (u1-u0)*i/16, v = v0 + (v1-v0)*j/16;
            BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), tolerance);
            if (classifier.State() == TopAbs_IN || classifier.State() == TopAbs_ON) result.push_back(surface.Value(u, v));
        }
    }
    return result;
}
bool constantGap(const TopoDS_Shape& a, const TopoDS_Shape& b) {
    if (a.ShapeType() == TopAbs_FACE && b.ShapeType() == TopAbs_FACE) {
        BRepAdaptor_Surface x(TopoDS::Face(a)), y(TopoDS::Face(b));
        if (x.GetType() == GeomAbs_Plane && y.GetType() == GeomAbs_Plane)
            return x.Plane().Axis().Direction().IsParallel(y.Plane().Axis().Direction(), 1e-10);
        if (x.GetType() == GeomAbs_Cylinder && y.GetType() == GeomAbs_Cylinder)
            return x.Cylinder().Axis().Direction().IsParallel(y.Cylinder().Axis().Direction(), 1e-10)
                && gp_Lin(x.Cylinder().Axis()).Distance(y.Cylinder().Location()) < 1e-8;
    } else if (a.ShapeType() == TopAbs_EDGE && b.ShapeType() == TopAbs_EDGE) {
        BRepAdaptor_Curve x(TopoDS::Edge(a)), y(TopoDS::Edge(b));
        if (x.GetType() == GeomAbs_Line && y.GetType() == GeomAbs_Line)
            return x.Line().Direction().IsParallel(y.Line().Direction(), 1e-10);
        if (x.GetType() == GeomAbs_Circle && y.GetType() == GeomAbs_Circle)
            return x.Circle().Axis().Direction().IsParallel(y.Circle().Axis().Direction(), 1e-10)
                && x.Circle().Location().Distance(y.Circle().Location()) < 1e-8;
    } else {
        const auto edge = a.ShapeType() == TopAbs_EDGE ? a : b;
        const auto face = a.ShapeType() == TopAbs_FACE ? a : b;
        BRepAdaptor_Curve curve(TopoDS::Edge(edge)); BRepAdaptor_Surface surface(TopoDS::Face(face));
        if (curve.GetType() == GeomAbs_Line && surface.GetType() == GeomAbs_Plane)
            return curve.Line().Direction().IsNormal(surface.Plane().Axis().Direction(), 1e-10);
    }
    return false;
}
void include(GapRange& range, const gp_Pnt& a, const gp_Pnt& b) {
    GapWitness candidate{a.Distance(b), a, b};
    if (!range.minimum || candidate.value < range.minimum->value) range.minimum = candidate;
    if (!range.maximum || candidate.value > range.maximum->value) range.maximum = candidate;
}
}
bool infiniteMeasurementPlane(const TopoDS_Shape& shape) {
    if (shape.ShapeType() != TopAbs_FACE || BRepAdaptor_Surface(TopoDS::Face(shape)).GetType() != GeomAbs_Plane) return false;
    return !TopExp_Explorer(shape, TopAbs_WIRE).More();
}
GapRange facingGaps(const TopoDS_Shape& a, const TopoDS_Shape& b) {
    GapRange range;
    if (infiniteMeasurementPlane(a) && infiniteMeasurementPlane(b)) {
        if (constantGap(a, b)) {
            const auto p = BRepAdaptor_Surface(TopoDS::Face(a)).Plane().Location();
            include(range, p, *foot(p, b));
            range.approximate = false;
        }
        return range;
    }
    std::vector<gp_Pnt> fromA, fromB;
    const bool exactA = planarGapSamples(a, b, fromA), exactB = planarGapSamples(b, a, fromB);
    if (!exactA) fromA = samples(a);
    if (!exactB) fromB = samples(b);
    // Both directions make the result independent of click order.
    if (!(a.ShapeType() == TopAbs_FACE && b.ShapeType() == TopAbs_EDGE))
        for (const auto& p : fromA) if (auto q = foot(p, b); q && unobstructed(a,p,*q)) include(range, p, *q);
    if (!(b.ShapeType() == TopAbs_FACE && a.ShapeType() == TopAbs_EDGE))
        for (const auto& p : fromB) if (auto q = foot(p, a); q && unobstructed(b,p,*q)) include(range, *q, p);
    BRepExtrema_DistShapeShape shortest(boundedMeasurementPlane(a, b), boundedMeasurementPlane(b, a));
    if (shortest.IsDone()) for (int i = 1; i <= shortest.NbSolution(); ++i) {
        const auto p = shortest.PointOnShape1(i), q = shortest.PointOnShape2(i);
        const auto toB = foot(p, b), toA = foot(q, a);
        if ((a.ShapeType() != TopAbs_FACE || b.ShapeType() != TopAbs_EDGE) && toB && toB->Distance(q) < tolerance)
            include(range, p, q);
        else if ((b.ShapeType() != TopAbs_FACE || a.ShapeType() != TopAbs_EDGE) && toA && toA->Distance(p) < tolerance)
            include(range, p, q);
    }
    const bool planarExact = infiniteMeasurementPlane(a) ? exactB : infiniteMeasurementPlane(b) ? exactA
        : a.ShapeType() == b.ShapeType() ? exactA && exactB
        : a.ShapeType() == TopAbs_EDGE ? exactA : exactB;
    range.approximate = !planarExact && !constantGap(a, b);
    return range;
}
