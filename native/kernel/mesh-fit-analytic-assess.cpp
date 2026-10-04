#include "mesh-fit-analytic.h"
#include <cmath>

namespace mesh_fit::analytic {
namespace {
V perpendicular(const V& axis) {
    return unit(axis.Crossed(std::abs(axis.Z()) < 0.8 ? V(0,0,1) : V(0,1,0)));
}
void record(Statistics& stats,double distance,double& maximum) {
    maximum = std::max(maximum,distance); stats.rms += distance*distance; ++stats.samples;
}
bool forward(const Candidate& c,const Input& input,const Search& search,Statistics& stats) {
    const auto u = perpendicular(c.axis), v = c.axis.Crossed(u);
    const double pi = std::acos(-1.0);
    const int angular = std::clamp(int(std::ceil(pi/std::acos(1-std::min(0.25,input.tolerance/(4*c.radius))))),128,512);
    auto station = [&](const V& p,const V& normal) {
        const auto hit = search.closest(p);
        const double distance = std::sqrt(hit.distance2);
        record(stats,distance,stats.forward);
        return distance <= input.tolerance && normal.Dot(hit.normal) > 0;
    };
    for (int i = 0; i < angular; ++i) {
        const double angle = 2*pi*i/angular;
        const auto radial = u*std::cos(angle)+v*std::sin(angle);
        for (int j = 0; j <= angular/2; ++j) {
            const double t = double(j)/(angular/2);
            if (c.kind == Kind::Sphere) {
                const double phi = pi*(t-0.5);
                const auto n = radial*std::cos(phi)+c.axis*std::sin(phi);
                if (!station(c.center+n*c.radius,n)) return false;
            } else {
                if (!station(c.center+c.axis*(c.low+(c.high-c.low)*t)+radial*c.radius,radial)) return false;
                for (int sign : {-1,1}) {
                    const auto end = c.center+c.axis*(sign < 0 ? c.low : c.high);
                    if (c.kind == Kind::Cylinder) {
                        if (!station(end+radial*(c.radius*t),c.axis*sign)) return false;
                    } else {
                        const double phi = t*pi/2;
                        const auto n = radial*std::cos(phi)+c.axis*(sign*std::sin(phi));
                        if (!station(end+n*c.radius,n)) return false;
                    }
                }
            }
        }
    }
    return true;
}
}
V closest(const Candidate& c,const V& p) {
    const auto d = p-c.center;
    if (c.kind == Kind::Sphere) return c.center+(length(d) > 1e-15 ? unit(d) : V(1,0,0))*c.radius;
    const double z = d.Dot(c.axis), clamped = std::clamp(z,c.low,c.high);
    const auto onAxis = c.center+c.axis*clamped;
    if (c.kind == Kind::Capsule) {
        const auto delta = p-onAxis;
        return onAxis+(length(delta) > 1e-15 ? unit(delta) : perpendicular(c.axis))*c.radius;
    }
    const auto radial = d-c.axis*z;
    const double r = length(radial);
    const auto direction = r > 1e-15 ? radial/r : perpendicular(c.axis);
    if (z < c.low || z > c.high || r > c.radius)
        return onAxis+direction*std::min(r,c.radius);
    const double cap = std::min(z-c.low,c.high-z);
    if (cap < c.radius-r) return p+c.axis*(z-c.low < c.high-z ? c.low-z : c.high-z);
    return c.center+c.axis*z+direction*c.radius;
}
std::optional<Result> assess(const Candidate& c,const Input& input,const Search& search) {
    Result result;
    auto reverse = [&](const V& p) {
        const double distance = length(p-closest(c,p));
        record(result.stats,distance,result.stats.reverse);
        return distance;
    };
    for (const auto& p : input.target.vertices) {
        const double error = reverse(p);
        if (error > input.tolerance) return {};
        result.vertexErrors.push_back(error*input.scale);
    }
    for (const auto& f : input.target.triangles) {
        const auto a = input.target.vertices[f[0]], b = input.target.vertices[f[1]], d = input.target.vertices[f[2]];
        for (const auto& p : {(a+b+d)/3,(a+b)/2,(b+d)/2,(d+a)/2})
            if (reverse(p) > input.tolerance) return {};
    }
    if (!forward(c,input,search,result.stats)) return {};
    result.stats.rms = std::sqrt(result.stats.rms/result.stats.samples);
    result.planes = c.kind == Kind::Cylinder ? 2 : 0;
    result.cylinders = c.kind == Kind::Sphere ? 0 : 1;
    result.spheres = c.kind == Kind::Sphere ? 1 : c.kind == Kind::Capsule ? 2 : 0;
    return result;
}
}
