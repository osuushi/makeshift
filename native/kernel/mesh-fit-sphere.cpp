#include "mesh-fit.h"
#include <cmath>
#include <numeric>
#include <stdexcept>

// Original implementation of the fixed-stiffness flow described by Kazhdan,
// Solomon and Ben-Chen (2012), doi:10.1111/j.1467-8659.2012.03179.x.
namespace mesh_fit {
namespace {
struct Link { int a,b; double stiffness,mass = 0; };
struct System { std::vector<double> diagonal; std::vector<Link> links; };
constexpr double timeStep = 0.001;
std::vector<V> multiply(const System& system,const std::vector<V>& x,bool massOnly) {
    std::vector<V> result(x.size());
    for (size_t i = 0; i < x.size(); ++i) result[i] = x[i]*system.diagonal[i];
    for (const auto& e : system.links) {
        result[e.a] += x[e.b]*e.mass;
        result[e.b] += x[e.a]*e.mass;
        if (!massOnly) {
            const auto delta = (x[e.a]-x[e.b])*(timeStep*e.stiffness);
            result[e.a] += delta; result[e.b] -= delta;
        }
    }
    return result;
}
double dot(const std::vector<V>& a,const std::vector<V>& b) {
    double sum = 0;
    for (size_t i = 0; i < a.size(); ++i) sum += a[i].Dot(b[i]);
    return sum;
}
std::vector<V> step(const System& system,const std::vector<V>& points) {
    auto x = points, residual = multiply(system,points,true);
    const auto applied = multiply(system,x,false);
    auto diagonal = system.diagonal;
    for (const auto& e : system.links) {
        diagonal[e.a] += timeStep*e.stiffness;
        diagonal[e.b] += timeStep*e.stiffness;
    }
    std::vector<V> direction(x.size()), preconditioned(x.size());
    for (size_t i = 0; i < x.size(); ++i) {
        residual[i] -= applied[i];
        direction[i] = preconditioned[i] = residual[i]/diagonal[i];
    }
    double rho = dot(residual,preconditioned);
    const double threshold = std::max(1e-26,rho*1e-16);
    for (int k = 0; k < 1000 && rho > threshold; ++k) {
        const auto action = multiply(system,direction,false);
        const double denominator = dot(direction,action);
        if (!(denominator > 0) || !std::isfinite(rho))
            throw std::runtime_error("Automatic mesh layout could not solve its surface mapping");
        const double alpha = rho/denominator;
        for (size_t i = 0; i < x.size(); ++i) {
            x[i] += direction[i]*alpha; residual[i] -= action[i]*alpha;
            preconditioned[i] = residual[i]/diagonal[i];
        }
        const double next = dot(residual,preconditioned), beta = next/rho;
        for (size_t i = 0; i < x.size(); ++i) direction[i] = preconditioned[i]+direction[i]*beta;
        rho = next;
    }
    if (rho > threshold*100) throw std::runtime_error("Automatic mesh layout solve did not converge");
    return x;
}
void normalize(Mesh& mesh) {
    V center; double area = 0;
    for (const auto& f : mesh.triangles) {
        const auto a = mesh.vertices[f[0]], b = mesh.vertices[f[1]], c = mesh.vertices[f[2]];
        const double weight = length((b-a).Crossed(c-a))/2;
        center += (a+b+c)*(weight/3); area += weight;
    }
    if (!(area > 1e-20)) throw std::runtime_error("Automatic mesh layout collapsed");
    center /= area;
    for (auto& p : mesh.vertices) p = (p-center)/std::sqrt(area);
}
System stiffness(const Mesh& mesh) {
    std::map<Edge,double> weights;
    for (const auto& f : mesh.triangles) for (int i = 0; i < 3; ++i) {
        const auto a = mesh.vertices[f[(i+1)%3]]-mesh.vertices[f[i]];
        const auto b = mesh.vertices[f[(i+2)%3]]-mesh.vertices[f[i]];
        weights[edge(f[(i+1)%3],f[(i+2)%3])] += a.Dot(b)/(2*length(a.Crossed(b)));
    }
    System result; result.diagonal.resize(mesh.vertices.size());
    for (const auto& [e,w] : weights) result.links.push_back({e.first,e.second,w});
    return result;
}
void updateMass(System& system,const Mesh& mesh) {
    std::fill(system.diagonal.begin(),system.diagonal.end(),0);
    std::map<Edge,double> mass;
    for (const auto& f : mesh.triangles) {
        const auto a = mesh.vertices[f[0]], b = mesh.vertices[f[1]], c = mesh.vertices[f[2]];
        const double area = length((b-a).Crossed(c-a))/2;
        for (int i = 0; i < 3; ++i) {
            system.diagonal[f[i]] += area/6;
            mass[edge(f[i],f[(i+1)%3])] += area/12;
        }
    }
    for (auto& e : system.links) e.mass = mass.at(edge(e.a,e.b));
}
bool spherical(const Mesh& mesh) {
    double area = 0;
    for (const auto& f : mesh.triangles) {
        const auto a = unit(mesh.vertices[f[0]]), b = unit(mesh.vertices[f[1]]), c = unit(mesh.vertices[f[2]]);
        const double determinant = a.Dot(b.Crossed(c));
        if (determinant < 1e-12) return false;
        area += 2*std::atan2(determinant,1+a.Dot(b)+b.Dot(c)+c.Dot(a));
    }
    return std::abs(area-4*std::acos(-1.0)) < 1e-5;
}
}
Mesh sphereMap(const Mesh& original) {
    Mesh mesh = original; normalize(mesh);
    auto system = stiffness(mesh);
    for (int iteration = 0; iteration < 256; ++iteration) {
        updateMass(system,mesh); mesh.vertices = step(system,mesh.vertices); normalize(mesh);
        double low = 1e100, high = 0;
        for (const auto& p : mesh.vertices) { low = std::min(low,length(p)); high = std::max(high,length(p)); }
        if (iteration >= 15 && high/low < 1.05 && spherical(mesh)) break;
    }
    if (!spherical(mesh)) throw std::runtime_error("Could not generate an unfolded automatic layout for this mesh");
    for (auto& p : mesh.vertices) p = unit(p);
    balanceSphere(mesh,original);
    return mesh;
}
}
