// Public OCCT API experiment; the production ArgumentAnalyzer remains unchanged.
// Compare the original wrapper, direct checker and oriented-box candidate search.
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include <BOPAlgo_CheckerSI.hxx>
#include <BOPDS_DS.hxx>
#include <BOPDS_MapOfPair.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <OSD_ThreadPool.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListOfShape.hxx>
#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <vector>

bool check(const TopoDS_Shape& shape, int mode) {
    if (mode == 0) {
        BOPAlgo_ArgumentAnalyzer analyzer;
        analyzer.SetShape1(shape); analyzer.SelfInterMode() = true;
        analyzer.SetRunParallel(false); analyzer.Perform();
        return analyzer.HasFaulty();
    }
    BOPAlgo_CheckerSI checker;
    TopTools_ListOfShape args; args.Append(shape); checker.SetArguments(args);
    checker.SetNonDestructive(true); checker.SetRunParallel(false);
    checker.SetUseOBB(mode == 2); checker.Perform();
    if (checker.HasErrors() || !checker.PDS()) return true;
    const auto& data = *checker.PDS();
    for (BOPDS_MapIteratorOfMapOfPair it(data.Interferences()); it.More(); it.Next()) {
        int a,b; it.Value().Indices(a,b);
        if (!data.IsNewShape(a) && !data.IsNewShape(b)) return true;
    }
    return false;
}
int main(int argc, char** argv) {
    OSD_ThreadPool::DefaultPool(1);
    if (argc != 2) {
        std::cerr << "Usage: sweep-validation-benchmark SHAPE.brep\n";
        return 2;
    }
    TopoDS_Shape shape; BRep_Builder builder;
    if (!BRepTools::Read(shape, argv[1], builder)) return 2;
    if (!TopExp_Explorer(shape, TopAbs_SOLID).More())
        throw std::runtime_error("Benchmark needs at least one solid");
    std::vector<double> times[3];
    bool expected = false;
    for (int round = 0; round < 7; ++round) {
        for (int i = 0; i < 3; ++i) {
            const int mode = (i + round) % 3;
            const auto start = std::chrono::steady_clock::now();
            bool faulty = false;
            for (TopExp_Explorer e(shape, TopAbs_SOLID); e.More(); e.Next()) faulty |= check(e.Current(), mode);
            const double ms = std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
            if (round == 0 && i == 0) expected = faulty;
            if (faulty != expected) throw std::runtime_error("Checker result differs");
            if (round) times[mode].push_back(ms);
        }
    }
    const char* names[] = {"analyzer", "checker", "obb"};
    for (int mode = 0; mode < 3; ++mode) {
        std::sort(times[mode].begin(), times[mode].end());
        std::cout << names[mode] << " median_ms=" << times[mode][times[mode].size()/2]
                  << " min=" << times[mode].front() << " max=" << times[mode].back()
                  << " faulty=" << expected << '\n';
    }
}
