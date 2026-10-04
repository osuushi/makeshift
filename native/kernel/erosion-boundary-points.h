#pragma once
#include <TopoDS_Shape.hxx>
#include <gp_Pnt.hxx>
#include <vector>

namespace erosion {
// Indexed points on exact boundary curves and trimmed faces supply distance upper bounds only.
// Sampling density affects speed of certification, never its correctness.
class BoundaryPoints {
    std::vector<gp_Pnt> points;
    double uncertainty = 0;
    void partition(size_t first, size_t last, int axis);
    void nearest(const gp_Pnt&, size_t first, size_t last, int axis, double&) const;
public:
    explicit BoundaryPoints(const TopoDS_Shape&);
    double upper(const gp_Pnt&) const;
};
}
