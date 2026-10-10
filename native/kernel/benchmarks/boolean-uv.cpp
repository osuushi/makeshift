#include "boolean-uv.h"
#include "boolean-uv-self-tests.h"
#include "boolean-filter.h"
#include "boolean-torus-bounds.h"
#include "geometry-policy.h"
#include <BOPAlgo_PaveFiller.hxx>
#include <BOPDS_DS.hxx>
#include <BOPDS_Iterator.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <BRepTools.hxx>
#include <OSD_Parallel.hxx>
#include <OSD_ThreadPool.hxx>
#include <Standard_Failure.hxx>
#include <TopTools_ListOfShape.hxx>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>

namespace {
using Clock = std::chrono::steady_clock;
double elapsed(Clock::time_point start) {
    return std::chrono::duration<double,std::milli>(Clock::now()-start).count();
}
class TimedFiller : public BOPAlgo_PaveFiller {
    int depth;
    double padding;
    bool trimming, tightTorus;
public:
    boolean_uv::FilterStatistics filter;
    double faceFaceMs = 0;
    int candidateFaces = 0;
    TimedFiller(int refinementDepth, double tolerance, bool useTrims, bool tightenTorus)
        : depth(refinementDepth), padding(tolerance), trimming(useTrims), tightTorus(tightenTorus) {}
    void Init(const Message_ProgressRange& range) override {
        BOPAlgo_PaveFiller::Init(range);
        if (HasErrors() || depth == 0) return;
        // Reuse OCCT's pair enumeration; this extra enumeration is charged to filler time.
        auto iterator = std::make_unique<boolean_uv::FilteringIterator>(depth,padding,trimming,tightTorus);
        iterator->SetDS(myDS);
        iterator->SetRunParallel(myRunParallel);
        iterator->Prepare(myContext,myUseOBB,myFuzzyValue);
        filter = iterator->statistics;
        delete myIterator;
        myIterator = iterator.release();
    }
    void PerformFF(const Message_ProgressRange& range) override {
        // Count exactly the pairs fed to OCCT's face/face stage after box filtering.
        myIterator->Initialize(TopAbs_FACE,TopAbs_FACE);
        candidateFaces = myIterator->ExpectedLength();
        const auto start = Clock::now();
        BOPAlgo_PaveFiller::PerformFF(range);
        faceFaceMs = elapsed(start);
    }
};
struct Sample {
    double fillerMs, faceFaceMs, buildMs, validationMs;
    int candidateFaces, curves, blocks;
    TopoDS_Shape result;
    boolean_uv::FilterStatistics filter;
};
Sample subtract(const boolean_uv::Pair& pair, int depth, bool trimming = false,
                bool parallel = true, bool tightTorus = false) {
    TopTools_ListOfShape operands; operands.Append(pair.outer); operands.Append(pair.inner);
    const double padding = geometry_policy::cubicBooleanToleranceMm +
        std::max(boolean_uv::maximumTolerance(pair.outer),boolean_uv::maximumTolerance(pair.inner));
    TimedFiller filler(depth,padding,trimming,tightTorus);
    filler.SetArguments(operands);
    filler.SetNonDestructive(true);
    // Match Makeshift's cubic-boundary contact resolution for this captured pair.
    filler.SetFuzzyValue(geometry_policy::cubicBooleanToleranceMm);
    filler.SetRunParallel(parallel);
    auto start = Clock::now(); filler.Perform();
    const double fillerMs = elapsed(start);
    if (filler.HasErrors()) throw std::runtime_error("Intersection processing failed");
    int curves = 0, blocks = 0;
    const auto& intersections = filler.PDS()->InterfFF();
    for (int i = 0; i < intersections.Size(); ++i) {
        const auto& face = intersections(i);
        curves += face.Curves().Size();
        for (int j = 0; j < face.Curves().Size(); ++j)
            blocks += face.Curves()(j).PaveBlocks().Size();
    }
    BRepAlgoAPI_Cut cut(filler);
    TopTools_ListOfShape arguments, tools; arguments.Append(pair.outer); tools.Append(pair.inner);
    cut.SetArguments(arguments); cut.SetTools(tools);
    cut.SetNonDestructive(true);
    cut.SetFuzzyValue(geometry_policy::cubicBooleanToleranceMm);
    cut.SetRunParallel(parallel);
    start = Clock::now(); cut.Build();
    const double buildMs = elapsed(start);
    if (!cut.IsDone() || cut.HasErrors()) throw std::runtime_error("Cut construction failed");
    start = Clock::now();
    if (cut.Shape().IsNull() || !BRepCheck_Analyzer(cut.Shape()).IsValid())
        throw std::runtime_error("Invalid cut result");
    return {fillerMs,filler.faceFaceMs,buildMs,elapsed(start),
            filler.candidateFaces,curves,blocks,cut.Shape(),filler.filter};
}
bool run(const boolean_uv::Pair& original, const boolean_uv::Variant& variant, int round,
         const std::array<double,2>& volumes, const std::vector<boolean_uv::Probe>& probes,
         std::map<std::string,std::string>& verifiedResults) {
    try {
        const auto prepared = boolean_uv::prepare(original,variant);
        const auto sample = subtract(prepared.pair,variant.refinementDepth,variant.useTrims,
                                     variant.parallel,variant.tightTorus);
        std::ostringstream encoded;
        BRepTools::Write(sample.result,encoded,false,false,TopTools_FormatVersion_CURRENT);
        // Identical exact BReps reuse the geometric verification, outside measured time.
        if (verifiedResults[variant.name] != encoded.str()) {
            boolean_uv::verify(original,prepared.pair,sample.result,volumes,probes);
            verifiedResults[variant.name] = encoded.str();
        }
        const bool precision = prepared.precisionPreserved &&
            boolean_uv::maximumTolerance(sample.result) <= prepared.maximumTolerance*(1+1e-6);
        const double total = prepared.milliseconds+sample.fillerMs+sample.buildMs+sample.validationMs;
        std::cout << variant.name << ',' << round << ','
            << boolean_uv::count(prepared.pair.outer,TopAbs_FACE) << ','
            << boolean_uv::count(prepared.pair.inner,TopAbs_FACE) << ','
            << prepared.milliseconds << ',' << sample.fillerMs << ',' << sample.faceFaceMs << ','
            << sample.buildMs << ',' << sample.validationMs << ',' << total << ','
            << sample.candidateFaces << ',' << sample.curves << ',' << sample.blocks << ','
            << prepared.maximumTolerance << ',' << precision << ','
            << sample.filter.milliseconds << ',' << sample.filter.originalPairs << ','
            << sample.filter.rejectedPairs << ',' << sample.filter.boxes << ','
            << sample.filter.tests << ',' << sample.filter.outsideCells << ",ok" << std::endl;
        std::cerr << "Checked " << variant.name << " round " << round << std::endl;
        return true;
    } catch (const Standard_Failure& error) {
        std::cerr << "Rejected " << variant.name << ": " << error.GetMessageString() << std::endl;
    } catch (const std::exception& error) {
        std::cerr << "Rejected " << variant.name << ": " << error.what() << std::endl;
    }
    return false;
}
void selfTest() {
    boolean_uv::testTorusBounds();
    boolean_uv::testTrimRegions();
    const auto outer = BRepPrimAPI_MakeSphere(gp_Pnt(0,0,0),10).Shape();
    const std::vector<std::pair<const char*,boolean_uv::Pair>> cases{
        {"disjoint",{outer,BRepPrimAPI_MakeSphere(gp_Pnt(30,0,0),8).Shape()}},
        {"overlapping-boxes",{outer,BRepPrimAPI_MakeSphere(gp_Pnt(16,16,0),8).Shape()}},
        {"contained",{outer,BRepPrimAPI_MakeSphere(gp_Pnt(1,1,1),6).Shape()}},
        {"intersecting",{outer,BRepPrimAPI_MakeSphere(gp_Pnt(12,0,0),8).Shape()}},
        {"tangent",{outer,BRepPrimAPI_MakeSphere(gp_Pnt(18,0,0),8).Shape()}},
        {"torus-intersecting",{BRepPrimAPI_MakeTorus(10,4).Shape(),
            BRepPrimAPI_MakeSphere(gp_Pnt(12,0,0),3).Shape()}},
        {"torus-contained-tube",{BRepPrimAPI_MakeTorus(10,4).Shape(),
            BRepPrimAPI_MakeTorus(10,2).Shape()}},
        {"rational-splines",{BRepBuilderAPI_NurbsConvert(outer,true).Shape(),
            BRepBuilderAPI_NurbsConvert(BRepPrimAPI_MakeSphere(gp_Pnt(12,0,0),8).Shape(),true).Shape()}}};
    for (const auto& [name,pair] : cases) {
        const auto baseline = subtract(pair,0), adaptive = subtract(pair,8,true,true,true);
        const double expected = boolean_uv::volume(baseline.result);
        if (std::abs(boolean_uv::volume(adaptive.result)-expected) > 1e-8*expected)
            throw std::runtime_error(std::string(name)+" volume mismatch");
        BRepClass3d_SolidClassifier a(baseline.result), b(adaptive.result);
        for (int x = -12; x <= 22; x += 3)
            for (int y = -11; y <= 11; y += 3)
                for (int z = -11; z <= 11; z += 3) {
                    const gp_Pnt point(x+0.13,y+0.27,z+0.31);
                    a.Perform(point,1e-6); b.Perform(point,1e-6);
                    if (a.State() != b.State())
                        throw std::runtime_error(std::string(name)+" material mismatch");
                }
        if (std::string(name) == "disjoint" && adaptive.filter.boxes != 0)
            throw std::runtime_error("Disjoint originals must not trigger subdivision");
        if (std::string(name) == "intersecting" && adaptive.candidateFaces == 0)
            throw std::runtime_error("True surface intersection was incorrectly rejected");
        if (std::string(name) == "overlapping-boxes" &&
            (adaptive.filter.boxes == 0 || adaptive.filter.rejectedPairs == 0))
            throw std::runtime_error("Overlapping originals should be refined and separated");
        std::cerr << "Self-test passed: " << name << "; original pairs "
                  << adaptive.filter.originalPairs << "; retained " << adaptive.candidateFaces
                  << "; patch boxes " << adaptive.filter.boxes << std::endl;
    }
}
}
int main(int argc, char** argv) {
    try {
        if (argc < 2 || argc > 4)
            throw std::runtime_error("Usage: boolean-uv-benchmark CAPTURE.json [rounds=3] [--trim-experiment|--tight-experiment]");
        const int threads = OSD_Parallel::NbLogicalProcessors();
        OSD_ThreadPool::DefaultPool(threads);
        if (std::string(argv[1]) == "--self-test") { selfTest(); return 0; }
        const int rounds = argc > 2 ? std::stoi(argv[2]) : 3;
        if (rounds < 1 || rounds > 10) throw std::runtime_error("Choose 1 to 10 rounds");
        if (argc > 3 && std::string(argv[3]) != "--trim-experiment" &&
            std::string(argv[3]) != "--tight-experiment") throw std::runtime_error("Unknown experiment option");
        const auto original = boolean_uv::readFixture(argv[1]);
        const std::array<double,2> volumes{
            boolean_uv::volume(original.outer),boolean_uv::volume(original.inner)};
        const auto probes = boolean_uv::probes(original);
        std::cerr << "Threads " << threads << "; material probes " << probes.size()
                  << "; expected cavity volume " << std::setprecision(17)
                  << volumes[0]-volumes[1] << std::endl;
        std::vector<boolean_uv::Variant> variants{
            {"baseline",1,1,1,1}, {"gated-inner-U2",1,1,2,1}, {"gated-inner-V2",1,1,1,2},
            {"gated-inner-2x2",1,1,2,2}, {"gated-both-2x2",2,2,2,2},
            {"gated-inner-4x4",1,1,4,4},
            {"adaptive-depth4",1,1,1,1,4}, {"adaptive-depth6",1,1,1,1,6},
            {"adaptive-depth8",1,1,1,1,8}, {"adaptive-depth10",1,1,1,1,10}};
        if (argc > 3 && std::string(argv[3]) == "--trim-experiment") variants = {
            {"baseline",1,1,1,1}, {"baseline-serial",1,1,1,1,0,false,false},
            {"adaptive-depth10",1,1,1,1,10}, {"trim-depth10",1,1,1,1,10,true},
            {"trim-depth14",1,1,1,1,14,true}, {"trim-depth18",1,1,1,1,18,true}};
        if (argc > 3 && std::string(argv[3]) == "--tight-experiment") variants = {
            {"baseline",1,1,1,1}, {"baseline-serial",1,1,1,1,0,false,false},
            {"adaptive-depth10",1,1,1,1,10}, {"trim-depth10",1,1,1,1,10,true},
            {"tight-depth10",1,1,1,1,10,false,true,true},
            {"trim-tight-depth10",1,1,1,1,10,true,true,true},
            {"trim-tight-depth14",1,1,1,1,14,true,true,true}};
        std::cout << "variant,round,outer_faces,inner_faces,prepare_ms,filler_ms,face_face_ms,"
                     "build_ms,validate_ms,total_ms,candidate_faces,curves,blocks,max_tolerance_mm,"
                     "precision_preserved,refine_ms,original_pairs,rejected_pairs,patch_boxes,box_tests,outside_cells,status"
                  << std::endl;
        // Rotate the starting case to avoid always measuring baseline first.
        int failures = 0;
        std::map<std::string,std::string> verifiedResults;
        for (int round = 0; round < rounds; ++round)
            for (std::size_t i = 0; i < variants.size(); ++i)
                failures += !run(original,variants[(i+round)%variants.size()],round+1,
                                 volumes,probes,verifiedResults);
        return failures == 0 ? 0 : 1;
    } catch (const Standard_Failure& error) {
        std::cerr << error.GetMessageString() << std::endl; return 1;
    } catch (const std::exception& error) {
        std::cerr << error.what() << std::endl; return 1;
    }
}
