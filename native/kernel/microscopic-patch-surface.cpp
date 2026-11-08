#include "microscopic-patch-surface.h"
#include "geometry-policy.h"
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <Geom2dAdaptor_Curve.hxx>
#include <Geom2dConvert.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <Geom2d_TrimmedCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <TColStd_Array2OfReal.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace {
constexpr double precision = geometry_policy::boundaryDistanceMm / 10;
struct Patch {
    Handle(Geom_BSplineSurface) surface;
    TopAbs_Orientation orientation;
};
void require(bool value, const char* reason = "Spline patches cannot be joined without refitting") {
    if (!value)
        throw std::runtime_error(reason);
}
int side(const TopoDS_Edge& edge, const TopoDS_Face& face, double u0, double u1, double v0,
         double v1) {
    double first, last;
    const auto curve = BRep_Tool::CurveOnSurface(edge, face, first, last);
    require(!curve.IsNull());
    const auto spline =
        Geom2dConvert::CurveToBSplineCurve(new Geom2d_TrimmedCurve(curve, first, last));
    double lowU = INFINITY, highU = -INFINITY, lowV = INFINITY, highV = -INFINITY;
    for (int i = 1; i <= spline->NbPoles(); ++i) {
        require(spline->Weight(i) > 0);
        const auto p = spline->Pole(i);
        lowU = std::min(lowU, p.X());
        highU = std::max(highU, p.X());
        lowV = std::min(lowV, p.Y());
        highV = std::max(highV, p.Y());
    }
    // Positive rational control hulls certify an isoparametric boundary even
    // when the kernel stores that straight UV curve as a spline.
    const double eu = 64 * std::numeric_limits<double>::epsilon() *
                      std::max({std::abs(u0), std::abs(u1), u1 - u0});
    const double ev = 64 * std::numeric_limits<double>::epsilon() *
                      std::max({std::abs(v0), std::abs(v1), v1 - v0});
    if (highU - lowU <= eu) {
        if (std::abs(lowU - u0) <= eu)
            return 0;
        if (std::abs(lowU - u1) <= eu)
            return 1;
    }
    if (highV - lowV <= ev) {
        if (std::abs(lowV - v0) <= ev)
            return 2;
        if (std::abs(lowV - v1) <= ev)
            return 3;
    }
    throw std::runtime_error("Patch boundary is not rectangular");
}
void reverseOrientation(Patch& patch) { patch.orientation = TopAbs::Reverse(patch.orientation); }
Patch canonical(const TopoDS_Face& face, const TopoDS_Edge& shared, bool first) {
    auto original = Handle(Geom_BSplineSurface)::DownCast(BRep_Tool::Surface(face));
    require(!original.IsNull() && !original->IsUPeriodic() && !original->IsVPeriodic());
    int wires = 0;
    for (TopExp_Explorer w(face, TopAbs_WIRE); w.More(); w.Next())
        ++wires;
    require(wires == 1);
    double u0, u1, v0, v1;
    BRepTools::UVBounds(face, u0, u1, v0, v1);
    require(std::isfinite(u0 + u1 + v0 + v1) && u1 > u0 && v1 > v0);
    bool sides[4] = {};
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
        sides[side(TopoDS::Edge(e.Current()), face, u0, u1, v0, v1)] = true;
    for (bool present : sides)
        require(present);
    const int boundary = side(shared, face, u0, u1, v0, v1);
    double start, end;
    const auto curve = BRep_Tool::CurveOnSurface(shared, face, start, end);
    const auto p = curve->Value(start), q = curve->Value(end);
    const double span =
        boundary < 2 ? std::abs(q.Y() - p.Y()) / (v1 - v0) : std::abs(q.X() - p.X()) / (u1 - u0);
    require(std::abs(span - 1) <= 1e-10, "Shared edge is not a whole patch side");
    Patch result{Handle(Geom_BSplineSurface)::DownCast(original->Copy()), face.Orientation()};
    result.surface->Segment(u0, u1, v0, v1);
    if (boundary < 2) {
        result.surface->ExchangeUV();
        reverseOrientation(result);
    }
    const bool high = boundary % 2 == 1;
    if (high != first) {
        result.surface->VReverse();
        reverseOrientation(result);
    }
    TColStd_Array1OfReal u(1, result.surface->NbUKnots()), v(1, result.surface->NbVKnots());
    result.surface->UKnots(u);
    result.surface->VKnots(v);
    const double us = u.First(), ud = u.Last() - us, vs = v.First(), vd = v.Last() - vs;
    for (int i = 1; i <= u.Length(); ++i)
        u(i) = (u(i) - us) / ud;
    for (int i = 1; i <= v.Length(); ++i)
        v(i) = (v(i) - vs) / vd + (first ? 0 : 1);
    result.surface->SetUKnots(u);
    result.surface->SetVKnots(v);
    return result;
}
void align(Patch& a, Patch& b) {
    const auto end = a.surface->Value(0, 1);
    if (end.Distance(b.surface->Value(1, 1)) < end.Distance(b.surface->Value(0, 1))) {
        b.surface->UReverse();
        reverseOrientation(b);
    }
    require(a.orientation == b.orientation, "Patch orientation mismatch");
    const int du = std::max(a.surface->UDegree(), b.surface->UDegree());
    const int dv = std::max(a.surface->VDegree(), b.surface->VDegree());
    a.surface->IncreaseDegree(du, dv);
    b.surface->IncreaseDegree(du, dv);
    TColStd_Array1OfReal ak(1, a.surface->NbUKnots()), bk(1, b.surface->NbUKnots());
    TColStd_Array1OfInteger am(1, ak.Length()), bm(1, bk.Length());
    a.surface->UKnots(ak);
    a.surface->UMultiplicities(am);
    b.surface->UKnots(bk);
    b.surface->UMultiplicities(bm);
    a.surface->InsertUKnots(bk, bm, 1e-12, false);
    b.surface->InsertUKnots(ak, am, 1e-12, false);
    require(a.surface->NbUPoles() == b.surface->NbUPoles());
}
Handle(Geom_BSplineSurface) concatenate(const Patch& pa, const Patch& pb) {
    const auto a = pa.surface, b = pb.surface;
    const int nu = a->NbUPoles(), na = a->NbVPoles(), nb = b->NbVPoles();
    const double ratio = a->Weight(1, na) / b->Weight(1, 1);
    double poleGap = 0, weightError = 0, diameter = 0;
    const auto origin = b->Pole(1, 1);
    for (int u = 1; u <= nu; ++u) {
        poleGap = std::max(poleGap, a->Pole(u, na).Distance(b->Pole(u, 1)));
        weightError =
            std::max(weightError, std::abs(a->Weight(u, na) / (ratio * b->Weight(u, 1)) - 1));
        for (int v = 1; v <= nb; ++v)
            diameter = std::max(diameter, 2 * origin.Distance(b->Pole(u, v)));
    }
    // Positive rational basis functions form a convex combination. Moving a
    // control row and changing its relative weights bounds the entire patch,
    // not just the shared boundary or a sampling of the interior.
    require(weightError < 1 && poleGap + diameter * weightError / (1 - weightError) <= precision,
            "Patch control rows disagree");
    TColgp_Array2OfPnt poles(1, nu, 1, na + nb - 1);
    TColStd_Array2OfReal weights(1, nu, 1, na + nb - 1);
    for (int u = 1; u <= nu; ++u) {
        for (int v = 1; v <= na; ++v) {
            poles(u, v) = a->Pole(u, v);
            weights(u, v) = a->Weight(u, v);
        }
        for (int v = 2; v <= nb; ++v) {
            poles(u, na + v - 1) = b->Pole(u, v);
            weights(u, na + v - 1) = ratio * b->Weight(u, v);
        }
    }
    TColStd_Array1OfReal uk(1, a->NbUKnots()), vk(1, a->NbVKnots() + b->NbVKnots() - 1);
    TColStd_Array1OfInteger um(1, uk.Length()), vm(1, vk.Length());
    a->UKnots(uk);
    a->UMultiplicities(um);
    for (int i = 1; i <= a->NbVKnots(); ++i) {
        vk(i) = a->VKnot(i);
        vm(i) = i == a->NbVKnots() ? a->VDegree() : a->VMultiplicity(i);
    }
    for (int i = 2; i <= b->NbVKnots(); ++i) {
        const int n = a->NbVKnots() + i - 1;
        vk(n) = b->VKnot(i);
        vm(n) = b->VMultiplicity(i);
    }
    return new Geom_BSplineSurface(poles, weights, uk, vk, um, vm, a->UDegree(), a->VDegree());
}
} // namespace
TopoDS_Face joinMicroscopicPatchSurfaces(const TopoDS_Face& first, const TopoDS_Face& second,
                                         const TopoDS_Edge& edge) {
    auto a = canonical(first, edge, true), b = canonical(second, edge, false);
    align(a, b);
    auto result = BRepBuilderAPI_MakeFace(concatenate(a, b), precision).Face();
    result.Orientation(a.orientation);
    return result;
}
