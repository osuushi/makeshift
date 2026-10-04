#pragma once
#include "mesh-fit.h"
#include <chrono>
#include <functional>

namespace erosion {
// Sample only cells that can meet a distance level set. All retained leaves use
// one uniform lattice, so neighboring tetrahedra share exactly the same edges.
struct FieldGrid {
    std::vector<mesh_fit::V> points;
    std::vector<double> values;
    std::vector<std::array<int,8>> cells;
};
FieldGrid sampleDistanceGrid(const mesh_fit::V& low,const std::array<int,3>& count,
    double spacing,const std::function<double(const mesh_fit::V&)>& field,
    std::chrono::steady_clock::time_point start);
}
