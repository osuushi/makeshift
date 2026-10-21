// Original experiment using public OCCT APIs. Extract actual spline spans, then
// benchmark independent D1 queries; this is not a replacement for trimmed topology.
#include <BRepAdaptor_Surface.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <GeomConvert_BSplineSurfaceToBezierSurface.hxx>
#include <Geom_BezierSurface.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GeomAdaptor_Surface.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <vector>

using Clock = std::chrono::steady_clock;
using Patch = Handle(Geom_BezierSurface);
double elapsed(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
std::vector<Patch> patches(const char* path) {
    TopoDS_Shape shape; BRep_Builder builder;
    if (!BRepTools::Read(shape, path, builder)) throw std::runtime_error("Cannot read BRep");
    std::vector<Patch> result;
    for (TopExp_Explorer e(shape, TopAbs_FACE); e.More(); e.Next()) {
        BRepAdaptor_Surface surface(TopoDS::Face(e.Current()));
        if (surface.GetType() == GeomAbs_BezierSurface) result.push_back(surface.Bezier());
        if (surface.GetType() != GeomAbs_BSplineSurface) continue;
        // BSpline() includes the face's location transform. Keep exact rational weights.
        GeomConvert_BSplineSurfaceToBezierSurface split(surface.BSpline(),
            surface.FirstUParameter(), surface.LastUParameter(),
            surface.FirstVParameter(), surface.LastVParameter(), 1e-12);
        for (int u = 1; u <= split.NbUPatches(); ++u)
            for (int v = 1; v <= split.NbVPatches(); ++v) result.push_back(split.Patch(u, v));
    }
    if (result.empty()) throw std::runtime_error("No spline surfaces in supplied shape");
    return result;
}
void writePatches(const std::vector<Patch>& surfaces, const std::string& path) {
    std::ofstream out(path); out << std::setprecision(17) << '[';
    for (std::size_t k = 0; k < surfaces.size(); ++k) {
        const auto& s = surfaces[k];
        if (k) out << ',';
        out << "{\"nu\":" << s->NbUPoles() << ",\"nv\":" << s->NbVPoles() << ",\"poles\":[";
        for (int u = 1; u <= s->NbUPoles(); ++u) for (int v = 1; v <= s->NbVPoles(); ++v) {
            if (u != 1 || v != 1) out << ',';
            const auto p = s->Pole(u, v);
            out << '[' << p.X() << ',' << p.Y() << ',' << p.Z() << ',' << s->Weight(u, v) << ']';
        }
        out << "]}";
    }
    out << "]\n";
}
float parameter(std::uint32_t i, std::uint32_t multiplier) {
    // Exact binary fractions shared with JS/WGSL; include boundary and near-boundary values.
    if (i % 17 == 0) return 0;
    if (i % 19 == 0) return 1;
    return static_cast<float>((i * multiplier) % 65536) / 65536;
}
void evaluateRange(const std::vector<Patch>& surfaces, std::size_t begin, std::size_t end,
                   bool cached, double* values) {
    std::vector<Handle(GeomAdaptor_Surface)> adaptors;
    for (const auto& surface : surfaces) adaptors.push_back(new GeomAdaptor_Surface(surface));
    for (std::size_t i = begin; i < end; ++i) {
        gp_Pnt p; gp_Vec du, dv;
        if (cached) adaptors[i % surfaces.size()]->D1(parameter(i, 73), parameter(i, 151), p, du, dv);
        else surfaces[i % surfaces.size()]->D1(parameter(i, 73), parameter(i, 151), p, du, dv);
        const std::array<double, 9> row{p.X(), p.Y(), p.Z(), du.X(), du.Y(), du.Z(), dv.X(), dv.Y(), dv.Z()};
        std::copy(row.begin(), row.end(), values + i * 9);
    }
}
std::vector<double> evaluate(const std::vector<Patch>& surfaces, std::size_t count,
                             bool cached, unsigned threads = 1) {
    std::vector<double> values(count * 9);
    if (threads == 1) evaluateRange(surfaces, 0, count, cached, values.data());
    else {
        std::vector<std::thread> workers;
        for (unsigned t = 0; t < threads; ++t)
            workers.emplace_back(evaluateRange, std::cref(surfaces), count * t / threads,
                                 count * (t + 1) / threads, cached, values.data());
        for (auto& worker : workers) worker.join();
    }
    return values;
}
int main(int argc, char** argv) {
    try {
        if (argc != 4) throw std::runtime_error("export-surface-batch INPUT.brep OUTPUT_PREFIX COUNT");
        const std::string prefix = argv[2];
        const auto count = std::stoul(argv[3]);
        const auto start = Clock::now();
        const auto surfaces = patches(argv[1]);
        const auto extraction = elapsed(start);
        writePatches(surfaces, prefix + ".patches.json");
        std::vector<double> values;
        std::cout << std::setprecision(17) << "{\"patches\":" << surfaces.size()
                  << ",\"count\":" << count << ",\"extractionMs\":" << extraction << ",\"cpuD1Ms\":[";
        for (int round = 0; round < 4; ++round) {
            const auto tick = Clock::now();
            values = evaluate(surfaces, count, false);
            if (round) std::cout << ',';
            std::cout << elapsed(tick);
        }
        const auto reference = values;
        std::cout << "],\"cpuCachedD1Ms\":[";
        double maxDifference = 0;
        for (int round = 0; round < 4; ++round) {
            const auto tick = Clock::now();
            values = evaluate(surfaces, count, true);
            if (round) std::cout << ',';
            std::cout << elapsed(tick);
            for (std::size_t i = 0; i < values.size(); ++i)
                maxDifference = std::max(maxDifference, std::abs(values[i] - reference[i]));
        }
        const auto threads = std::max(1u, std::thread::hardware_concurrency());
        std::cout << "],\"cpuThreads\":" << threads << ",\"cpuThreadedD1Ms\":[";
        for (int round = 0; round < 4; ++round) {
            const auto tick = Clock::now();
            values = evaluate(surfaces, count, true, threads);
            if (round) std::cout << ',';
            std::cout << elapsed(tick);
            for (std::size_t i = 0; i < values.size(); ++i)
                maxDifference = std::max(maxDifference, std::abs(values[i] - reference[i]));
        }
        std::ofstream output(prefix + ".reference.f64", std::ios::binary);
        output.write(reinterpret_cast<const char*>(values.data()), values.size() * sizeof(double));
        std::cout << "],\"maxCacheDifference\":" << maxDifference << "}\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n'; return 1;
    }
}
