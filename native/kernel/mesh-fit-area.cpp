#include "mesh-fit.h"
#include <cmath>

namespace mesh_fit {
namespace {
double area(const V& a,const V& b,const V& c) {
    const double determinant = a.Dot(b.Crossed(c));
    if (determinant <= 1e-14) return -1;
    return 2*std::atan2(determinant,1+a.Dot(b)+b.Dot(c)+c.Dot(a));
}
V gradient(const V& a,const V& b,const V& c) {
    const double d = a.Dot(b.Crossed(c)), s = 1+a.Dot(b)+b.Dot(c)+c.Dot(a);
    const auto g = (b.Crossed(c)*s-(b+c)*d)*(2/(s*s+d*d));
    return g-a*g.Dot(a);
}
double energy(const Mesh& sphere,const std::vector<double>& desired) {
    double sum = 0;
    for (size_t i = 0; i < sphere.triangles.size(); ++i) {
        const auto& f = sphere.triangles[i];
        const double value = area(sphere.vertices[f[0]],sphere.vertices[f[1]],sphere.vertices[f[2]]);
        if (value <= 0) return 1e100;
        const double delta = value-desired[i]; sum += delta*delta/desired[i];
    }
    return sum;
}
}
void balanceSphere(Mesh& sphere,const Mesh& original) {
    std::vector<double> desired;
    double total = 0;
    for (const auto& f : original.triangles) {
        const auto a = original.vertices[f[0]], b = original.vertices[f[1]], c = original.vertices[f[2]];
        const double value = length((b-a).Crossed(c-a))/2;
        desired.push_back(value); total += value;
    }
    for (auto& value : desired) value *= 4*std::acos(-1.0)/total;
    double current = energy(sphere,desired);
    // Area-weighted distortion supplies sampling space for narrow extremities that
    // an angle-preserving map compresses. Keep the spherical map unfolded at every step.
    for (int iteration = 0; iteration < 400 && current > 1e-5; ++iteration) {
        std::vector<V> gradients(sphere.vertices.size());
        std::vector<double> diagonal(sphere.vertices.size(),1e-12);
        for (size_t i = 0; i < sphere.triangles.size(); ++i) {
            const auto& f = sphere.triangles[i];
            const auto a = sphere.vertices[f[0]], b = sphere.vertices[f[1]], c = sphere.vertices[f[2]];
            const double residual = area(a,b,c)-desired[i];
            for (int j = 0; j < 3; ++j) {
                const auto g = gradient(sphere.vertices[f[j]],sphere.vertices[f[(j+1)%3]],sphere.vertices[f[(j+2)%3]]);
                gradients[f[j]] += g*(2*residual/desired[i]);
                diagonal[f[j]] += 2*g.SquareModulus()/desired[i];
            }
        }
        double maximum = 0;
        for (size_t i = 0; i < gradients.size(); ++i) {
            gradients[i] /= diagonal[i]; maximum = std::max(maximum,length(gradients[i]));
        }
        const auto before = sphere.vertices;
        bool accepted = false;
        for (double step = std::min(1.0,0.05/std::max(1e-30,maximum)); step > 1e-8; step *= 0.5) {
            for (size_t i = 0; i < before.size(); ++i) sphere.vertices[i] = unit(before[i]-gradients[i]*step);
            const double next = energy(sphere,desired);
            if (next < current) {current = next; accepted = true; break;}
        }
        if (!accepted) {sphere.vertices = before; break;}
    }
}
}
