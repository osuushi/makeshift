#pragma once
#include <array>
#include <cstddef>
#include <gp_Pnt.hxx>
#include <vector>

namespace face_width {
using Triangle = std::array<gp_Pnt, 3>;
using Segment = std::array<gp_Pnt, 2>;
struct Mesh {
    std::vector<Triangle> triangles;
    std::vector<Segment> perimeter;
};
enum class Class { thin, wide, uncertain };
// Bounds the maximum distance over ALL triangle interiors, not only vertices.
// The perimeter consists solely of true boundary polylines, including holes.
Class classify(const Mesh &, double width, size_t workLimit = 100000);
} // namespace face_width
