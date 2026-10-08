// Original material-equivalence harness using public OCCT APIs, no upstream copy.
// Build/run exclusively under /tmp/makeshift-geometry-compute.lock.
// c++ -O3 -DNDEBUG -std=c++20 -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/compare-solids.cpp -L.cache/kernel/sdk/lib
// -Wl,--disable-new-dtags,-rpath,$PWD/.cache/kernel/sdk/lib -lTKBool -lTKBO -lTKTopAlgo
// -lTKBRep -lTKGeomBase -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/compare-solids
// Usage: compare-solids baseline.brep candidate.brep
// Intended for ordinary analytical prism fixtures whose seam topology may differ.
// Exact BRepCheck means OCCT's exact curve-on-surface method, not a mathematical
// certificate. Default geometric BRepGProp quadrature is numerical; occupancy is
// finite sampling. Two warning-free no-fuzzy difference Booleans supplement both.
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListOfShape.hxx>
#include <algorithm>
#include <array>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr double classificationTolerance = 1e-7;
constexpr double relativeVolumeTolerance = 1e-8;
constexpr std::array<TopAbs_ShapeEnum, 6> types{
    TopAbs_SOLID, TopAbs_SHELL, TopAbs_FACE, TopAbs_WIRE, TopAbs_EDGE, TopAbs_VERTEX};
constexpr std::array<const char*, 6> names{"solids", "shells", "faces", "wires", "edges", "vertices"};
struct Input {
    TopoDS_Shape shape;
    TopTools_IndexedMapOfShape solids;
    std::array<int, 6> counts{};
    std::array<double, 6> bounds{};
    double volume = 0;
    bool valid = false;
};
double volume(const TopoDS_Shape& shape) {
    if (shape.IsNull()) return 0;
    GProp_GProps properties;
    BRepGProp::VolumeProperties(shape, properties);
    const double result = properties.Mass();
    if (!std::isfinite(result)) throw std::runtime_error("Non-finite volume quadrature result");
    return result;
}
std::array<double, 6> bounds(const TopoDS_Shape& shape) {
    Bnd_Box box;
    BRepBndLib::AddOptimal(shape, box, false, false);
    if (box.IsVoid() || box.IsWhole()) throw std::runtime_error("Missing or unbounded material bounds");
    std::array<double, 6> result;
    box.Get(result[0], result[1], result[2], result[3], result[4], result[5]);
    for (double value : result)
        if (!std::isfinite(value)) throw std::runtime_error("Non-finite material bounds");
    return result;
}
Input read(const char* path) {
    Input result;
    BRep_Builder builder;
    if (!BRepTools::Read(result.shape, path, builder) || result.shape.IsNull())
        throw std::runtime_error("Could not read input BRep");
    result.valid = BRepCheck_Analyzer(result.shape, true, false, true).IsValid();
    for (std::size_t i = 0; i < types.size(); ++i) {
        TopTools_IndexedMapOfShape shapes;
        TopExp::MapShapes(result.shape, types[i], shapes);
        result.counts[i] = shapes.Extent();
    }
    TopExp::MapShapes(result.shape, TopAbs_SOLID, result.solids);
    if (result.solids.IsEmpty()) throw std::runtime_error("Input contains no material solid");
    for (int i = 1; i <= result.solids.Extent(); ++i) {
        const double measured = volume(result.solids(i));
        if (measured <= 0) throw std::runtime_error("Input has collapsed or inverted material");
        result.volume += measured;
    }
    result.bounds = bounds(result.shape);
    return result;
}
void describe(const char* label, const Input& input) {
    std::cout << "{\"type\":\"input\",\"side\":\"" << label << "\",\"exact_brep_valid\":"
              << (input.valid ? "true" : "false") << ",\"volume\":" << input.volume
              << ",\"counts\":{";
    for (std::size_t i = 0; i < names.size(); ++i) {
        if (i) std::cout << ',';
        std::cout << '\"' << names[i] << "\":" << input.counts[i];
    }
    std::cout << "},\"bounds\":[";
    for (std::size_t i = 0; i < input.bounds.size(); ++i) {
        if (i) std::cout << ',';
        std::cout << input.bounds[i];
    }
    std::cout << "]}\n";
}
double difference(const TopoDS_Shape& a, const TopoDS_Shape& b) {
    BRepAlgoAPI_Cut cut;
    TopTools_ListOfShape arguments, tools;
    arguments.Append(a);
    tools.Append(b);
    cut.SetArguments(arguments);
    cut.SetTools(tools);
    cut.SetFuzzyValue(0);
    cut.SetNonDestructive(true);
    cut.SetRunParallel(false);
    cut.Build();
    if (!cut.IsDone() || cut.HasErrors() || cut.HasWarnings())
        throw std::runtime_error("Comparison difference Boolean failed or produced warnings");
    const auto result = cut.Shape();
    if (!result.IsNull() && !BRepCheck_Analyzer(result, true, false, true).IsValid())
        throw std::runtime_error("Invalid comparison difference BRep");
    return std::abs(volume(result));
}
using Classifiers = std::vector<std::unique_ptr<BRepClass3d_SolidClassifier>>;
Classifiers classifiers(const Input& input) {
    Classifiers result;
    for (int i = 1; i <= input.solids.Extent(); ++i)
        result.push_back(std::make_unique<BRepClass3d_SolidClassifier>(input.solids(i)));
    return result;
}
int occupancy(Classifiers& tools, const gp_Pnt& point) {
    bool uncertain = false, inside = false;
    for (auto& classifier : tools) {
        classifier->Perform(point, classificationTolerance);
        const auto state = classifier->State();
        if (state == TopAbs_IN || state == TopAbs_ON) inside = true;
        else if (state != TopAbs_OUT) uncertain = true;
    }
    if (uncertain) return -1;
    return inside ? 1 : 0;
}
struct Occupancy { int samples = 0, mismatches = 0, uncertain = 0; };
Occupancy compareOccupancy(const Input& baseline, const Input& candidate) {
    auto a = classifiers(baseline), b = classifiers(candidate);
    Occupancy result;
    for (const auto* input : {&baseline, &candidate}) {
        for (int solid = 1; solid <= input->solids.Extent(); ++solid) {
            const auto box = bounds(input->solids(solid));
            for (int x = 0; x < 7; ++x) for (int y = 0; y < 7; ++y) for (int z = 0; z < 7; ++z) {
                const gp_Pnt point(box[0] + (box[3] - box[0]) * (x + 0.5) / 7,
                                   box[1] + (box[4] - box[1]) * (y + 0.5) / 7,
                                   box[2] + (box[5] - box[2]) * (z + 0.5) / 7);
                const int first = occupancy(a, point), second = occupancy(b, point);
                ++result.samples;
                if (first < 0 || second < 0) ++result.uncertain;
                else if (first != second) ++result.mismatches;
            }
        }
    }
    return result;
}
int compare(const Input& baseline, const Input& candidate) {
    describe("baseline", baseline);
    describe("candidate", candidate);
    if (!baseline.valid || !candidate.valid) throw std::runtime_error("Input fails exact BRep checks");
    const double allowed = relativeVolumeTolerance * std::max(baseline.volume, candidate.volume);
    double boundsDelta = 0, span = 1;
    for (int axis = 0; axis < 3; ++axis)
        span = std::max({span, baseline.bounds[axis + 3] - baseline.bounds[axis],
                         candidate.bounds[axis + 3] - candidate.bounds[axis]});
    for (std::size_t i = 0; i < baseline.bounds.size(); ++i)
        boundsDelta = std::max(boundsDelta, std::abs(baseline.bounds[i] - candidate.bounds[i]));
    const double boundsAllowed = classificationTolerance * span;
    const double removed = difference(baseline.shape, candidate.shape);
    const double added = difference(candidate.shape, baseline.shape);
    const auto grid = compareOccupancy(baseline, candidate);
    const bool ok = baseline.solids.Extent() == candidate.solids.Extent()
        && std::abs(baseline.volume - candidate.volume) <= allowed
        && boundsDelta <= boundsAllowed && removed <= allowed && added <= allowed
        && grid.mismatches == 0 && grid.uncertain == 0;
    std::cout << "{\"type\":\"comparison\",\"ok\":" << (ok ? "true" : "false")
              << ",\"volume_absolute_tolerance\":" << allowed
              << ",\"volume_relative_tolerance\":" << relativeVolumeTolerance
              << ",\"baseline_minus_candidate\":" << removed
              << ",\"candidate_minus_baseline\":" << added
              << ",\"bounds_max_delta\":" << boundsDelta << ",\"bounds_tolerance\":" << boundsAllowed
              << ",\"occupancy_samples\":" << grid.samples << ",\"occupancy_mismatches\":" << grid.mismatches
              << ",\"occupancy_uncertain\":" << grid.uncertain << "}\n";
    return ok ? 0 : 1;
}
void failure(const char* message) {
    std::cout << "{\"type\":\"error\",\"message\":\"";
    for (const char* p = message; *p; ++p) {
        if (*p == '\"' || *p == '\\') std::cout << '\\' << *p;
        else if (*p == '\n') std::cout << "\\n";
        else if (*p == '\r') std::cout << "\\r";
        else if (*p == '\t') std::cout << "\\t";
        else if (static_cast<unsigned char>(*p) < 32) std::cout << '?';
        else std::cout << *p;
    }
    std::cout << "\"}\n";
}
}
int main(int argc, char** argv) {
    if (argc != 3) {
        std::cerr << "Usage: compare-solids baseline.brep candidate.brep\n";
        return 2;
    }
    std::cout << std::setprecision(17);
    try {
        const auto baseline = read(argv[1]), candidate = read(argv[2]);
        return compare(baseline, candidate);
    } catch (const Standard_Failure& error) {
        failure(error.GetMessageString());
    } catch (const std::exception& error) {
        failure(error.what());
    }
    return 1;
}
