#pragma once
#include <BOPDS_DS.hxx>
#include <BOPDS_IteratorSI.hxx>
#include <Bnd_Box.hxx>
#include <vector>

// Benchmark only: full support coverage, without trim-cell or sampled rejection.
std::vector<Bnd_Box> sweepBoxes(const TopoDS_Shape& shape, double padding, int divisions);
class SweepIterator : public BOPDS_IteratorSI {
public:
    int filter(TopAbs_ShapeEnum first, TopAbs_ShapeEnum second, int divisions);
};
