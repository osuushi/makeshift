#include "mesh-fit-solve.h"
#include <cmath>
#include <numeric>
#include <stdexcept>

namespace mesh_fit {
namespace {
constexpr double damping = 1e-5;
double dot(const std::vector<double>& a, const std::vector<double>& b) {
    return std::inner_product(a.begin(),a.end(),b.begin(),0.0);
}
std::vector<double> multiply(const std::vector<Row>& rows, const std::vector<double>& x) {
    std::vector<double> result(x.size());
    for (size_t i = 0; i < x.size(); ++i) result[i] = damping*x[i];
    for (const auto& row : rows) {
        double value = 0;
        for (const auto& [i,w] : row.terms) value += w*x[i];
        for (const auto& [i,w] : row.terms) result[i] += w*value;
    }
    return result;
}
}
std::vector<double> leastSquares(const std::vector<Row>& rows, const std::vector<double>& initial) {
    std::vector<double> diagonal(initial.size(),damping), residual(initial.size()), x = initial;
    for (const auto& row : rows) {
        double current = 0;
        for (const auto& [i,w] : row.terms) current += w*initial[i];
        for (const auto& [i,w] : row.terms) {
            residual[i] += w*(row.value-current); diagonal[i] += w*w;
        }
    }
    std::vector<double> direction(x.size()), preconditioned(x.size());
    for (size_t i = 0; i < x.size(); ++i) direction[i] = preconditioned[i] = residual[i]/diagonal[i];
    double rho = dot(residual,preconditioned);
    const double initialError = rho;
    for (int iteration = 0; iteration < 180 && rho > std::max(1e-22,initialError*1e-12); ++iteration) {
        const auto applied = multiply(rows,direction);
        const double denominator = dot(direction,applied);
        if (!(denominator > 0) || !std::isfinite(rho)) throw std::runtime_error("Mesh surface fit failed to converge");
        const double alpha = rho/denominator;
        for (size_t i = 0; i < x.size(); ++i) {
            x[i] += alpha*direction[i]; residual[i] -= alpha*applied[i];
            preconditioned[i] = residual[i]/diagonal[i];
        }
        const double next = dot(residual,preconditioned), beta = next/rho;
        for (size_t i = 0; i < x.size(); ++i) direction[i] = preconditioned[i]+beta*direction[i];
        rho = next;
    }
    for (double value : x) if (!std::isfinite(value)) throw std::runtime_error("Non-finite fitted surface");
    return x;
}
}
