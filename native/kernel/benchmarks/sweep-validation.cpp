// Public OCCT API experiment; the production ArgumentAnalyzer remains unchanged.
// Time complete checker stages and conservative broad-phase experiments.
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include "sweep-checker.h"
#include "sweep-validation-cases.h"
#include <set>
#include <BOPDS_DS.hxx>
#include <BOPDS_MapOfPair.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <OSD_ThreadPool.hxx>
#include <OSD.hxx>
#include <OSD_SignalMode.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListOfShape.hxx>
#include <algorithm>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <vector>

std::set<std::pair<int,int>> faults;
double edgeMs = 0, faceMs = 0;
int edgePairs = 0, facePairs = 0, rejectedEF = 0, rejectedFF = 0;
bool check(const TopoDS_Shape& shape, int mode) {
    faults.clear();
    if (mode == 0) {
        BOPAlgo_ArgumentAnalyzer analyzer;
        analyzer.SetShape1(shape); analyzer.SelfInterMode() = true;
        analyzer.SetRunParallel(false); analyzer.Perform();
        return analyzer.HasFaulty();
    }
    SweepChecker checker;
    TopTools_ListOfShape args; args.Append(shape); checker.SetArguments(args);
    checker.SetNonDestructive(true); checker.SetRunParallel(false);
    checker.SetUseOBB(mode == 2);
    if (mode >= 3) checker.divisions = mode == 3 ? 4 : 8;
    checker.Perform();
    edgeMs += checker.edgeFaceMs; faceMs += checker.faceFaceMs;
    edgePairs += checker.edgeFacePairs; facePairs += checker.faceFacePairs;
    rejectedEF += checker.rejectedEF; rejectedFF += checker.rejectedFF;
    if (checker.HasErrors() || !checker.PDS()) { checker.DumpErrors(std::cerr); return true; }
    const auto& data = *checker.PDS();
    for (BOPDS_MapIteratorOfMapOfPair it(data.Interferences()); it.More(); it.Next()) {
        int a,b; it.Value().Indices(a,b);
        if (!data.IsNewShape(a) && !data.IsNewShape(b)) faults.emplace(std::min(a,b),std::max(a,b));
    }
    return !faults.empty();
}
void selfTest() {
    if (OSD::SignalMode() != OSD_SignalMode_AsIs)
        throw std::runtime_error("Unexpected installed OCCT signal handlers");
    for (const auto& item : sweepValidationCases()) {
        const auto before = serializedValidationShape(item.shape);
        if (check(item.shape,0) != item.faulty)
            throw std::runtime_error(item.name + ": unexpected analyzer result");
        check(item.shape,1);
        const auto original = faults;
        for (int mode = 1; mode < 5; ++mode) {
            if (check(item.shape,mode) != item.faulty || faults != original)
                throw std::runtime_error(item.name + ": checker fault pairs differ");
            if (serializedValidationShape(item.shape) != before)
                throw std::runtime_error(item.name + ": input geometry mutated");
        }
        std::cout << item.name << ": matching rejection and unchanged input; faults=";
        for (const auto& [a,b] : original) std::cout << a << ":" << b << ",";
        std::cout << '\n';
    }
}
int main(int argc, char** argv) try {
    OSD_ThreadPool::DefaultPool(1);
    if (argc == 2 && std::string(argv[1]) == "--self-test") { selfTest(); return 0; }
    if (argc != 2) {
        std::cerr << "Usage: sweep-validation-benchmark SHAPE.brep | --self-test\n";
        return 2;
    }
    TopoDS_Shape shape; BRep_Builder builder;
    if (!BRepTools::Read(shape, argv[1], builder)) return 2;
    if (!TopExp_Explorer(shape, TopAbs_SOLID).More())
        throw std::runtime_error("Benchmark needs at least one solid");
    std::vector<double> times[5], edgeTimes[5], faceTimes[5];
    bool expected = false;
    for (int round = 0; round < 7; ++round) {
        for (int i = 0; i < 5; ++i) {
            const int mode = (i + round) % 5;
            const auto start = std::chrono::steady_clock::now();
            bool faulty = false; edgeMs = faceMs = 0; edgePairs = facePairs = rejectedEF = rejectedFF = 0;
            for (TopExp_Explorer e(shape, TopAbs_SOLID); e.More(); e.Next()) faulty |= check(e.Current(), mode);
            const double ms = std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
            if (round == 0 && i == 0) expected = faulty;
            if (faulty != expected) std::cerr << "mismatch mode=" << mode << " rejected=" << rejectedEF << "," << rejectedFF << std::endl;
            if (faulty != expected) throw std::runtime_error("Checker result differs");
            if (round) { times[mode].push_back(ms); edgeTimes[mode].push_back(edgeMs); faceTimes[mode].push_back(faceMs); }
            if (!round) std::cout << "mode=" << mode << " EF_pairs=" << edgePairs << " FF_pairs=" << facePairs << " rejectedEF=" << rejectedEF << " rejectedFF=" << rejectedFF << std::endl;
        }
    }
    const char* names[] = {"analyzer", "checker", "obb", "hull-4", "hull-8"};
    for (int mode = 0; mode < 5; ++mode) {
        std::sort(times[mode].begin(), times[mode].end());
        std::sort(edgeTimes[mode].begin(), edgeTimes[mode].end());
        std::sort(faceTimes[mode].begin(), faceTimes[mode].end());
        std::cout << names[mode] << " median_ms=" << times[mode][times[mode].size()/2]
                  << " min=" << times[mode].front() << " max=" << times[mode].back()
                  << " EF_ms=" << edgeTimes[mode][3] << " FF_ms=" << faceTimes[mode][3]
                  << " faulty=" << expected << '\n';
    }
}
catch (const Standard_Failure& error) {
    std::cerr << error.GetMessageString() << '\n'; return 1;
}
catch (const std::exception& error) {
    std::cerr << error.what() << '\n'; return 1;
}
