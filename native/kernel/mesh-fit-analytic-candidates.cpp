#include "mesh-fit-analytic.h"
#include <math_Gauss.hxx>
#include <math_Jacobi.hxx>
#include <cmath>

namespace mesh_fit::analytic {
namespace {
struct Sample { V point, normal; double weight; };
struct Moments {
    math_Matrix matrix;
    math_Vector rhs;
    explicit Moments(int n): matrix(1,n,1,n,0.0), rhs(1,n,0.0) {}
    void add(const std::vector<double>& row,double value,double weight) {
        for (int i = 1; i <= rhs.Length(); ++i) {
            rhs(i) += row[i-1]*value*weight;
            for (int j = 1; j <= rhs.Length(); ++j) matrix(i,j) += row[i-1]*row[j-1]*weight;
        }
    }
    bool solve() {
        math_Gauss solver(matrix,1e-14);
        if (!solver.IsDone()) return false;
        solver.Solve(rhs);
        for (int i = 1; i <= rhs.Length(); ++i) if (!std::isfinite(rhs(i))) return false;
        return true;
    }
};
std::vector<Sample> samples(const Mesh& mesh) {
    std::vector<Sample> result;
    double total = 0;
    for (const auto& f : mesh.triangles) {
        const auto a = mesh.vertices[f[0]], b = mesh.vertices[f[1]], c = mesh.vertices[f[2]];
        const auto cross = (b-a).Crossed(c-a);
        const double weight = length(cross)/6;
        for (const auto& p : {a,b,c}) result.push_back({p,unit(cross),weight});
        total += 3*weight;
    }
    for (auto& s : result) s.weight /= total;
    return result;
}
void sphere(const std::vector<Sample>& samples,std::vector<Candidate>& result) {
    Moments fit(4);
    for (const auto& s : samples) {
        const auto p = s.point;
        fit.add({2*p.X(),2*p.Y(),2*p.Z(),1},p.SquareModulus(),s.weight);
    }
    if (!fit.solve()) return;
    const V center(fit.rhs(1),fit.rhs(2),fit.rhs(3));
    const double radius2 = fit.rhs(4)+center.SquareModulus();
    if (radius2 > 1e-12 && radius2 < 1)
        result.push_back({Kind::Sphere,center,{0,0,1},std::sqrt(radius2)});
}
void axial(const Mesh& mesh,const std::vector<Sample>& samples,const V& axis,std::vector<Candidate>& result) {
    const V u = unit(axis.Crossed(std::abs(axis.Z()) < 0.8 ? V(0,0,1) : V(0,1,0))), v = axis.Crossed(u);
    Moments circle(3);
    double sideArea = 0, low = 1e100, high = -1e100;
    for (const auto& p : mesh.vertices) { low = std::min(low,p.Dot(axis)); high = std::max(high,p.Dot(axis)); }
    // Cylindrical regions have normals perpendicular to their common axis.
    // Fit the support across the whole side region, never independently per quad.
    for (const auto& s : samples) if (std::abs(s.normal.Dot(axis)) < 0.005) {
        const double x = s.point.Dot(u), y = s.point.Dot(v);
        circle.add({2*x,2*y,1},x*x+y*y,s.weight); sideArea += s.weight;
    }
    if (sideArea < 0.05 || !circle.solve()) return;
    const V center = u*circle.rhs(1)+v*circle.rhs(2);
    const double radius2 = circle.rhs(3)+circle.rhs(1)*circle.rhs(1)+circle.rhs(2)*circle.rhs(2);
    if (!(radius2 > 1e-12 && radius2 < 1)) return;
    const double radius = std::sqrt(radius2);
    result.push_back({Kind::Cylinder,center,axis,radius,low,high});
    if (high-low > 2*radius+1e-6)
        result.push_back({Kind::Capsule,center,axis,radius,low+radius,high-radius});
}
}
std::vector<Candidate> candidates(const Mesh& mesh) {
    const auto data = samples(mesh);
    std::vector<Candidate> result;
    sphere(data,result);
    V center;
    for (const auto& s : data) center += s.point*s.weight;
    math_Matrix covariance(1,3,1,3,0.0), normals(1,3,1,3,0.0);
    for (const auto& s : data) {
        const auto p = s.point-center;
        for (int i = 1; i <= 3; ++i) for (int j = 1; j <= 3; ++j) {
            covariance(i,j) += s.weight*p.Coord(i)*p.Coord(j);
            normals(i,j) += s.weight*s.normal.Coord(i)*s.normal.Coord(j);
        }
    }
    std::vector<V> axes;
    for (const auto* matrix : {&covariance,&normals}) {
        math_Jacobi eigen(*matrix);
        if (eigen.IsDone()) for (int i = 1; i <= 3; ++i) {
            math_Vector value(1,3); eigen.Vector(i,value);
            const auto axis = unit(V(value(1),value(2),value(3)));
            if (std::any_of(axes.begin(),axes.end(),[&](const V& other) { return std::abs(axis.Dot(other)) > 1-1e-8; })) continue;
            axes.push_back(axis); axial(mesh,data,axis,result);
        }
    }
    return result;
}
}
