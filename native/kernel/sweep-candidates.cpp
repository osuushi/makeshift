#include "sweep-candidates.h"
#include "sweep-boundary-distance.h"
#include "timing.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRep_Tool.hxx>
#include <Extrema_GenLocateExtPS.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Precision.hxx>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <string_view>

#if defined(__EMSCRIPTEN__) && defined(MAKESHIFT_KERNEL_GPU_SEARCH)
extern "C" int makeshift_search_candidates(const float*, int, const float*, int, int*);
#endif
namespace {
constexpr size_t maxSamples = 262144;
struct Face {
    TopoDS_Face shape;
    BRepAdaptor_Surface surface;
    explicit Face(const TopoDS_Face& value) : shape(value), surface(value) {}
};
std::vector<double> parameters(const BRepAdaptor_Surface& surface, bool u) {
    const double first = u ? surface.FirstUParameter() : surface.FirstVParameter();
    const double last = u ? surface.LastUParameter() : surface.LastVParameter();
    if (!std::isfinite(first) || !std::isfinite(last) || std::abs(last - first) > 1e50) return {};
    std::vector<double> knots{first};
    if (surface.GetType() == GeomAbs_BSplineSurface) {
        const auto spline = surface.BSpline();
        const int count = u ? spline->NbUKnots() : spline->NbVKnots();
        for (int i = 1; i <= count; ++i) {
            const double knot = u ? spline->UKnot(i) : spline->VKnot(i);
            if (knot > first && knot < last) knots.push_back(knot);
        }
    }
    knots.push_back(last);
    std::vector<double> result;
    for (size_t i = 1; i < knots.size(); ++i)
        for (int j = 0; j < 8; ++j) result.push_back(knots[i-1] + (knots[i] - knots[i-1]) * j / 8);
    result.push_back(last);
    return result;
}
void sampleFace(const Face& face, size_t index, std::vector<SweepSample>& samples) {
    const auto us = parameters(face.surface, true), vs = parameters(face.surface, false);
    if (us.empty() || vs.empty() || us.size() > (maxSamples - samples.size()) / vs.size()) return;
    for (const double u : us)
        for (const double v : vs) samples.push_back({face.surface.Value(u, v), u, v, index});
}
bool witness(const Face& face, const SweepSample& seed, const gp_Pnt& point, double tolerance) {
    try {
        const auto& s = face.surface;
        const double tol = std::min(BRep_Tool::Tolerance(face.shape), Precision::Confusion());
        Extrema_GenLocateExtPS refine(s, std::max(s.UResolution(tol), Precision::PConfusion()),
            std::max(s.VResolution(tol), Precision::PConfusion()));
        refine.Perform(point, seed.u, seed.v);
        if (!refine.IsDone()) return false;
        double u, v;
        refine.Point().Parameter(u, v);
        if (!std::isfinite(u) || !std::isfinite(v) || u < s.FirstUParameter() || u > s.LastUParameter()
            || v < s.FirstVParameter() || v > s.LastVParameter()) return false;
        const double squared = s.Value(u, v).SquareDistance(point);
        if (!std::isfinite(squared) || squared > tolerance * tolerance) return false;
        BRepClass_FaceClassifier classifier(face.shape, gp_Pnt2d(u, v), BRep_Tool::Tolerance(face.shape));
        return classifier.State() == TopAbs_IN || classifier.State() == TopAbs_ON;
    } catch (const Standard_Failure&) { return false; }
}
std::vector<int> candidates(const std::vector<SweepSample>& samples, const std::vector<gp_Pnt>& points) {
    std::vector<int> result(points.size(), -1);
    const char* configured = std::getenv("MAKESHIFT_SWEEP_CANDIDATES");
    const std::string_view mode(configured ? configured : "cpu");
    if (mode == "invalid") return result;
#if defined(__EMSCRIPTEN__) && defined(MAKESHIFT_KERNEL_GPU_SEARCH)
    if (mode == "gpu" && !samples.empty() && !points.empty()) {
        // Translation reduces float cancellation; float coordinates never validate geometry.
        const auto origin = points.front();
        std::vector<float> grid, queries;
        const auto append = [&](std::vector<float>& target, const gp_Pnt& point) {
            target.insert(target.end(), {float(point.X()-origin.X()), float(point.Y()-origin.Y()),
                float(point.Z()-origin.Z()), 0});
        };
        for (const auto& sample : samples) append(grid, sample.point);
        for (const auto& point : points) append(queries, point);
        if (!makeshift_search_candidates(grid.data(), samples.size(), queries.data(), points.size(), result.data()))
            return sweepCpuCandidates(samples, points);
        return result;
    }
#endif
    return sweepCpuCandidates(samples, points);
}
}
bool sweepCandidatesEnabled() {
    const char* mode = std::getenv("MAKESHIFT_SWEEP_CANDIDATES");
    return !mode || std::string_view(mode) != "off";
}
bool sweepCandidatesWithin(const TopoDS_Shape& boundary, const std::vector<gp_Pnt>& points, double tolerance) {
    KernelTiming timing("sweep-candidates");
    std::vector<std::unique_ptr<Face>> faces;
    std::vector<SweepSample> samples;
    for (TopExp_Explorer e(boundary, TopAbs_FACE); e.More(); e.Next()) {
        faces.push_back(std::make_unique<Face>(TopoDS::Face(e.Current())));
        try { sampleFace(*faces.back(), faces.size()-1, samples); }
        catch (const Standard_Failure&) { /* An unsupported surface uses the original check. */ }
    }
    timing.phase("sample");
    const auto seeds = candidates(samples, points);
    timing.phase("search");
    SweepBoundaryDistance fallback(boundary);
    size_t hits = 0, misses = 0;
    bool accepted = true;
    for (size_t i = 0; i < points.size(); ++i) {
        const int index = seeds[i];
        if (index >= 0 && size_t(index) < samples.size() &&
            witness(*faces[samples[index].face], samples[index], points[i], tolerance)) { ++hits; continue; }
        ++misses;
        if (!fallback.within(points[i], tolerance)) { accepted = false; break; }
    }
    timing.phase("refine-fallback");
    if (std::getenv("MAKESHIFT_KERNEL_TIMING"))
        std::cerr << "sweep-candidates points=" << points.size() << " samples=" << samples.size()
                  << " witnesses=" << hits << " fallbacks=" << misses << '\n';
    return accepted;
}
