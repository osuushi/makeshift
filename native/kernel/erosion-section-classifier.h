#pragma once
#include <TopoDS_Shape.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>
#include <array>
#include <optional>
#include <vector>

namespace erosion {
// Exact cross-section parity for recognized polynomial section solids. Any
// unsupported trim, singularity or numerically ambiguous crossing uses OCCT.
class SectionClassifier {
    struct Patch {
        std::array<std::array<gp_Pnt,4>,4> poles;
        double low, high, heightError = 0, minimumSlope = 0, maximumSlope = 0;
    };
    gp_Trsf frame;
    std::vector<Patch> patches;
    std::vector<double> planes;
    bool ready = false;
public:
    bool supported() const { return ready; }
    explicit SectionClassifier(const TopoDS_Shape&);
    // minimumDistance must be a conservative lower bound to the boundary.
    std::optional<bool> contains(const gp_Pnt&, double minimumDistance) const;
};
}
