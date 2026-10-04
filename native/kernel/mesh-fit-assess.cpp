#include "mesh-fit.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <stdexcept>
#include <iostream>

namespace mesh_fit {
namespace {
std::pair<double,double> parameters(int side, double t) {
    if (side == 0) return {t,0};
    if (side == 1) return {1,t};
    if (side == 2) return {1-t,1};
    return {0,1-t};
}
V normal(const Evaluation& e) {
    const auto n = e.du.Crossed(e.dv);
    if (n.SquareModulus() < 1e-24 || n.SquareModulus() < e.du.SquareModulus()*e.dv.SquareModulus()*1e-10)
        throw std::runtime_error("Fitted patch has a singular or folded parameterization; revise the quad layout");
    return unit(n);
}
double seams(const Network& n) {
    std::map<Edge,std::pair<int,int>> seen;
    double maximum = 0; int worstFace = 0, worstSide = 0, worstK = 0;
    for (size_t f = 0; f < n.patches.size(); ++f) for (int side = 0; side < 4; ++side) {
        const auto& q = n.patches[f].corners;
        const auto e = edge(q[side],q[(side+1)%4]);
        if (n.layout.creases.contains(e)) continue;
        if (!seen.contains(e)) { seen[e] = {int(f),side}; continue; }
        const auto [other,otherSide] = seen[e];
        for (int k = 0; k <= 32; ++k) {
            const auto [u,v] = parameters(side,k/32.0);
            const auto [s,t] = parameters(otherSide,1-k/32.0);
            const auto a = normal(evaluate(n,int(f),u,v)), b = normal(evaluate(n,other,s,t));
            const double angle = std::acos(std::clamp(a.Dot(b),-1.0,1.0))*180/std::acos(-1.0);
            if (angle > maximum) { maximum = angle; worstFace = int(f); worstSide = side; worstK = k; }
        }
    }
    if (std::getenv("MAKESHIFT_KERNEL_TIMING")) {
        const auto [u,v] = parameters(worstSide,worstK/32.0);
        const auto e = evaluate(n,worstFace,u,v);
        std::cerr << "worst seam " << worstFace << " side " << worstSide << " t " << worstK/32.0
            << " angle " << maximum << " position " << e.point.X() << ',' << e.point.Y() << ',' << e.point.Z()
            << " derivatives " << length(e.du) << ',' << length(e.dv)
            << " tangent cosine " << unit(e.du).Dot(unit(e.dv)) << '\n';
    }
    return maximum;
}
}
Statistics assess(const Network& n, const Mesh& mesh, const Search& target) {
    Statistics stats;
    auto record = [&](double distance, double& maximum) {
        maximum = std::max(maximum,distance); stats.rms += distance*distance; ++stats.samples;
    };
    // Validation stations are denser than fitting stations, including cell interiors.
    for (size_t f = 0; f < n.patches.size(); ++f) for (int i = 0; i <= 24; ++i)
        for (int j = 0; j <= 24; ++j) {
            const auto value = evaluate(n,int(f),i/24.0,j/24.0);
            const auto hit = target.closest(value.point);
            const auto direction = normal(value);
            if (i > 0 && i < 24 && j > 0 && j < 24 && direction.Dot(hit.normal) <= 0) {
                stats.oriented = false;
            }
            record(std::sqrt(hit.distance2),stats.forward);
        }
    SurfaceSearch surface(n,12);
    auto reverse = [&](const V& p) { record(length(p-surface.closest(p).value.point),stats.reverse); };
    for (const auto& p : mesh.vertices) reverse(p);
    // Check every triangle, not a random subset: narrow features must participate.
    for (const auto& triangle : mesh.triangles) {
        const auto a = mesh.vertices[triangle[0]], b = mesh.vertices[triangle[1]], c = mesh.vertices[triangle[2]];
        reverse((a+b+c)/3);
        reverse((a+b)/2); reverse((b+c)/2); reverse((c+a)/2);
    }
    stats.normalAngle = seams(n);
    stats.rms = std::sqrt(stats.rms/stats.samples);
    return stats;
}
}
