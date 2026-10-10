#include "boolean-uv-torus.h"
#include <ElSLib.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace {
using Interval = std::array<double,2>;
Interval trig(double low, double high, bool cosine) {
    const double pi = std::acos(-1.0), shift = cosine ? 0 : pi/2;
    if (high-low >= 2*pi) return {-1,1};
    const auto eval = [cosine](double t) { return cosine ? std::cos(t) : std::sin(t); };
    Interval result{std::min(eval(low),eval(high)),std::max(eval(low),eval(high))};
    const int first = int(std::ceil((low-shift)/pi)), last = int(std::floor((high-shift)/pi));
    for (int i = first; i <= last; ++i) {
        const double value = i%2 == 0 ? 1 : -1;
        result[0] = std::min(result[0],value); result[1] = std::max(result[1],value);
    }
    return result;
}
Interval scale(Interval a, double s) {
    return {std::min(a[0]*s,a[1]*s),std::max(a[0]*s,a[1]*s)};
}
Interval add(Interval a, Interval b) { return {a[0]+b[0],a[1]+b[1]}; }
Interval multiply(Interval a, Interval b) {
    const std::array<double,4> values{a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]};
    return {*std::min_element(values.begin(),values.end()),*std::max_element(values.begin(),values.end())};
}
}
void boolean_uv::boundTorus(const gp_Torus& torus, const std::array<double,4>& uv,
                           double padding, Bnd_Box& box) {
    // Interval enclosure of C + (R+r*cos(v))*(X*cos(u)+Y*sin(u)) + Z*r*sin(v).
    const auto cu = trig(uv[0],uv[1],true), su = trig(uv[0],uv[1],false);
    const auto cv = trig(uv[2],uv[3],true), sv = trig(uv[2],uv[3],false);
    const auto radial = add({torus.MajorRadius(),torus.MajorRadius()},scale(cv,torus.MinorRadius()));
    const auto& axes = torus.Position();
    gp_Pnt low,high;
    for (int i = 1; i <= 3; ++i) {
        const auto direction = add(scale(cu,axes.XDirection().Coord(i)),scale(su,axes.YDirection().Coord(i)));
        const auto coordinate = add(multiply(radial,direction),scale(sv,torus.MinorRadius()*axes.Direction().Coord(i)));
        low.SetCoord(i,torus.Location().Coord(i)+coordinate[0]);
        high.SetCoord(i,torus.Location().Coord(i)+coordinate[1]);
    }
    box.Add(low); box.Add(high);
    // Floating-point roundoff allowance is separate from the geometry contact tolerance.
    const double magnitude = 1+torus.Location().XYZ().Modulus()+torus.MajorRadius()+torus.MinorRadius();
    box.Enlarge(padding+128*std::numeric_limits<double>::epsilon()*magnitude);
}
void boolean_uv::testTorusBounds() {
    const double pi = std::acos(-1.0);
    const gp_Torus torus(gp_Ax3(gp_Pnt(17,-11,3),gp_Dir(1,2,3)),13,7);
    for (int i = 0; i < 80; ++i) {
        const double u = -2*pi+i*pi/17, v = -2*pi+i*pi/23;
        const std::array<double,4> uv{u,u+pi/(i%7+1),v,v+pi/(i%11+1)};
        Bnd_Box box; boundTorus(torus,uv,0,box);
        for (int a = 0; a <= 20; ++a) for (int b = 0; b <= 20; ++b)
            if (box.IsOut(ElSLib::Value(u+(uv[1]-u)*a/20,v+(uv[3]-v)*b/20,torus)))
                throw std::runtime_error("Torus interval enclosure missed a sampled point");
    }
}
