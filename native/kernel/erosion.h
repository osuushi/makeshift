#pragma once
#include "kernel.h"
#include <optional>
#include <utility>
#include <stdexcept>

namespace erosion {
struct CoverageFailure : std::runtime_error {
    double requiredDepth;
    bool exhausted;
    CoverageFailure(const char* message, double depth, bool limit)
        : std::runtime_error(message), requiredDepth(depth), exhausted(limit) {}
};
struct AllowanceFailure : std::runtime_error {
    double allowance;
    AllowanceFailure(const std::string& message, double value)
        : std::runtime_error(message), allowance(value) {}
};
std::pair<TopoDS_Shape, TopoDS_Shape> coverageFrame(const TopoDS_Shape& source, const TopoDS_Shape& candidate);
TopoDS_Shape offset(const TopoDS_Shape& source, double inward, bool intersections);
TopoDS_Shape boundary(const TopoDS_Shape& shape);
// Independently check that every point deeper than depth survives in the candidate.
// Unresolved distance bounds reject; a failed construction is never an empty result.
void checkCoverage(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth);
std::optional<bool> sphericalCoverage(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth);
void validateCavity(const TopoDS_Shape& source, const TopoDS_Shape& candidate,
                    double thickness, double allowance);
TopoDS_Shape simplify(const TopoDS_Shape& source, double allowance);
TopoDS_Shape removeCollapsedFeatures(const TopoDS_Shape& source, double thickness);
}

std::vector<Result> erodeBodies(const Tree&, const std::vector<Operand>&,
                               std::vector<std::string>&,Tree* quality = nullptr);

void writeErosionQuality(std::ostream&,const Tree&);
