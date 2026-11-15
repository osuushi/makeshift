#include "edge-finish-validation.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>
#include <Geom2dAdaptor_Curve.hxx>
#include <Geom2dInt_GInter.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <IntRes2d_Domain.hxx>
#include <Precision.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
// Match OCCT's wire-intersection precision; endpoint allowances still come
// from the exact vertices' existing model-space tolerances.
constexpr double intersectionTolerance = 1e-10;

bool atVertex(const TopoDS_Edge& edge, const gp_Pnt& point) {
    for (TopExp_Explorer v(edge, TopAbs_VERTEX); v.More(); v.Next()) {
        const auto vertex = TopoDS::Vertex(v.Current());
        if (point.Distance(BRep_Tool::Pnt(vertex)) <= BRep_Tool::Tolerance(vertex)) return true;
    }
    return false;
}

void checkSpan(const Handle(Geom2d_BSplineCurve)& source, double first, double last,
               const TopoDS_Edge& edge, const BRepAdaptor_Surface& surface) {
    auto span = Handle(Geom2d_BSplineCurve)::DownCast(source->Copy());
    span->Segment(first, last);
    const Geom2dAdaptor_Curve curve(span, first, last);
    const IntRes2d_Domain domain(span->Value(first), first, intersectionTolerance,
                               span->Value(last), last, intersectionTolerance);
    Geom2dInt_GInter intersections;
    intersections.Perform(curve, domain, intersectionTolerance, intersectionTolerance);
    if (!intersections.IsDone()) throw std::runtime_error("Cannot validate edge-finish spline trim");
    for (int i = 1; i <= intersections.NbPoints(); ++i) {
        const auto& crossing = intersections.Point(i);
        if (std::abs(crossing.ParamOnFirst() - crossing.ParamOnSecond()) <= Precision::PConfusion())
            continue;
        const auto uv = span->Value(crossing.ParamOnFirst());
        if (!atVertex(edge, surface.Value(uv.X(), uv.Y())))
            throw std::runtime_error("Edge finish has a self-intersecting spline trim");
    }
}
}

void validateFinishTrimLoops(const TopoDS_Shape& shape) {
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        const BRepAdaptor_Surface surface(face);
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (BRep_Tool::Degenerated(edge)) continue;
            double first, last;
            const auto curve = Handle(Geom2d_BSplineCurve)::DownCast(
                BRep_Tool::CurveOnSurface(edge, face, first, last));
            if (curve.IsNull()) continue;
            for (int knot = 1; knot < curve->NbKnots(); ++knot) {
                const double a = std::max(first, curve->Knot(knot));
                const double b = std::min(last, curve->Knot(knot + 1));
                if (b - a > Precision::PConfusion()) checkSpan(curve, a, b, edge, surface);
            }
        }
    }
}
