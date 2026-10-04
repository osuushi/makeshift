#pragma once
#include "mesh-fit.h"

namespace mesh_fit {
struct Row { std::vector<std::pair<int,double>> terms; double value = 0; };
// Sparse least squares for one joint XYZ fit; no additional geometry/document owner.
std::vector<double> leastSquares(const std::vector<Row>&, const std::vector<double>& initial);
}
