#pragma once
#include <BRepAdaptor_Surface.hxx>
#include <array>
#include <vector>

namespace erosion {
// Convex hull boxes enclose the complete surface, including any trimmed face.
class BezierBounds {
    using Box = std::array<double,6>;
    struct Node { Box box; int begin, end, left = -1, right = -1; };
    std::vector<Box> boxes;
    std::vector<Node> nodes;
    int build(int begin, int end);
    void lower(int node, const gp_Pnt&, double& best) const;
    bool crosses(int node, const Box&) const;
public:
    explicit BezierBounds(const BRepAdaptor_Surface&);
    double lower(const gp_Pnt&) const;
    bool crosses(const std::array<gp_Pnt,8>&) const;
};
}
