#pragma once
#include <TColStd_MapOfInteger.hxx>
#include <BOPDS_Iterator.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <Bnd_Box.hxx>
#include <array>
#include <memory>
#include <unordered_map>

namespace boolean_uv {
struct FilterStatistics {
    double milliseconds = 0;
    int originalPairs = 0, rejectedPairs = 0, boxes = 0, tests = 0;
};
/** Experiment only: refine face boxes after OCCT's existing original-box broad phase. */
class FilteringIterator : public BOPDS_Iterator {
    struct Patch {
        Bnd_Box box;
        std::array<double,4> uv;
        int depth = 0;
        std::unique_ptr<Patch> first, second;
    };
    struct Face {
        BRepAdaptor_Surface surface;
        Patch root;
    };
    int depthLimit;
    double padding;
    std::unordered_map<int,std::unique_ptr<Face>> faces;
    Face& face(int index);
    bool split(Face&, Patch&);
    bool separated(Face&, Patch&, Face&, Patch&);
public:
    FilterStatistics statistics;
    FilteringIterator(int depth, double tolerance);
    void Prepare(const Handle(IntTools_Context)& context, Standard_Boolean checkOBB,
                 Standard_Real fuzzy) override;
};
}
