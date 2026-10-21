#pragma once
#include <TopoDS_Shape.hxx>
#include <gp_Pnt.hxx>
#include <vector>

// Experimental seeds are suggestions only; every accepted point gets an OCCT
// double-precision witness on the trimmed face, or the original distance check.
bool sweepCandidatesEnabled();
bool sweepCandidatesWithin(const TopoDS_Shape& boundary,
    const std::vector<gp_Pnt>& points, double tolerance);

struct SweepSample {
    gp_Pnt point;
    double u, v;
    size_t face;
};
std::vector<int> sweepCpuCandidates(const std::vector<SweepSample>& samples,
    const std::vector<gp_Pnt>& points);
