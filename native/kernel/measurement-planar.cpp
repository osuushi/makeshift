#include "measurement.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <Bnd_Box.hxx>
#include <limits>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>

namespace {
using Segment = std::pair<gp_Pnt, gp_Pnt>;
bool segments(const TopoDS_Shape& shape, std::vector<Segment>& result) {
    if (shape.ShapeType() == TopAbs_FACE && BRepAdaptor_Surface(TopoDS::Face(shape)).GetType() != GeomAbs_Plane) return false;
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current());
        if (BRep_Tool::Degenerated(edge)) continue;
        BRepAdaptor_Curve curve(edge);
        if (curve.GetType() != GeomAbs_Line) return false;
        result.emplace_back(curve.Value(curve.FirstParameter()), curve.Value(curve.LastParameter()));
    }
    return !result.empty();
}
gp_Pnt lerp(const Segment& edge, double t) { return edge.first.Translated(gp_Vec(edge.first, edge.second) * t); }
gp_Pnt project(const gp_Pnt& p, const gp_Pln& plane) {
    const gp_Vec normal(plane.Axis().Direction());
    return p.Translated(normal * -gp_Vec(plane.Location(), p).Dot(normal));
}
void crossing(const Segment& source, const Segment& target, const gp_Pln& plane, std::vector<gp_Pnt>& points) {
    const auto a = project(source.first, plane), b = project(source.second, plane);
    const gp_Vec u(a, b), v(target.first, target.second), w(a, target.first), n(plane.Axis().Direction());
    const double denominator = u.Crossed(v).Dot(n);
    if (std::abs(denominator) < 1e-12) return;
    const double s = w.Crossed(v).Dot(n) / denominator, t = w.Crossed(u).Dot(n) / denominator;
    if (s >= -1e-10 && s <= 1 + 1e-10 && t >= -1e-10 && t <= 1 + 1e-10)
        points.push_back(lerp(source, std::clamp(s, 0.0, 1.0)));
}
}
// All vertices of the projected overlap, including hole boundaries. A linear
// plane separation reaches its extrema here (or at an interior zero crossing).
bool planarGapSamples(const TopoDS_Shape& source, const TopoDS_Shape& target, std::vector<gp_Pnt>& points) {
    std::vector<Segment> from, to;
    if (!segments(source, from) || (!infiniteMeasurementPlane(target) && !segments(target, to))) return false;
    if (target.ShapeType() == TopAbs_FACE) {
        const auto plane = BRepAdaptor_Surface(TopoDS::Face(target)).Plane();
        for (const auto& edge : from) {
            points.push_back(edge.first); points.push_back(edge.second);
            for (const auto& boundary : to) crossing(edge, boundary, plane, points);
            const gp_Vec n(plane.Axis().Direction());
            const double a = gp_Vec(plane.Location(), edge.first).Dot(n), b = gp_Vec(plane.Location(), edge.second).Dot(n);
            if (a * b < 0) points.push_back(lerp(edge, a / (a - b)));
        }
        return true;
    }
    if (source.ShapeType() != TopAbs_EDGE || from.size() != 1 || to.size() != 1) return false;
    const auto& edge = from[0]; const auto& reference = to[0];
    const gp_Vec v(reference.first, reference.second);
    const double length2 = v.SquareMagnitude();
    if (length2 < 1e-16) return false;
    const double a = gp_Vec(reference.first, edge.first).Dot(v) / length2;
    const double b = gp_Vec(reference.first, edge.second).Dot(v) / length2;
    points.push_back(edge.first); points.push_back(edge.second);
    if (std::abs(b-a) > 1e-12) for (double boundary : {0.0, 1.0}) {
        const double t = (boundary-a)/(b-a);
        if (t >= 0 && t <= 1) points.push_back(lerp(edge, t));
    }
    return true;
}

// This finite query face contains the orthogonal projection of the entire finite
// operand's exact bounding box. Its boundary cannot alter plane distance results.
TopoDS_Shape boundedMeasurementPlane(const TopoDS_Shape& plane, const TopoDS_Shape& shape) {
    if (!infiniteMeasurementPlane(plane)) return plane;
    Bnd_Box box;
    BRepBndLib::AddOptimal(shape, box, false, true);
    double x0, y0, z0, x1, y1, z1;
    box.Get(x0, y0, z0, x1, y1, z1);
    const auto support = BRepAdaptor_Surface(TopoDS::Face(plane)).Plane();
    // Recenter the support at the operand to avoid cancellation from a distant
    // construction-plane origin; the infinite geometric plane stays unchanged.
    const gp_Pln local(project(gp_Pnt((x0+x1)/2, (y0+y1)/2, (z0+z1)/2), support), support.Axis().Direction());
    double u0 = std::numeric_limits<double>::infinity(), v0 = u0, u1 = -u0, v1 = -u0;
    for (double x : {x0, x1}) for (double y : {y0, y1}) for (double z : {z0, z1}) {
        const gp_Vec delta(local.Location(), gp_Pnt(x,y,z));
        const double u = delta.Dot(gp_Vec(local.Position().XDirection()));
        const double v = delta.Dot(gp_Vec(local.Position().YDirection()));
        u0 = std::min(u0, u); u1 = std::max(u1, u);
        v0 = std::min(v0, v); v1 = std::max(v1, v);
    }
    return BRepBuilderAPI_MakeFace(local, u0-1, u1+1, v0-1, v1+1).Face();
}
