#include "erosion-surface-witness.h"
#include <algorithm>
#include <cmath>
#include <limits>

erosion::SurfaceWitness::SurfaceWitness(const BRepAdaptor_Surface& support) : surface(support) {
    if (surface.GetType() != GeomAbs_BSplineSurface) return;
    for (int i = 0; i <= 8; ++i) for (int j = 0; j <= 8; ++j) {
        const double u = surface.FirstUParameter()+(surface.LastUParameter()-surface.FirstUParameter())*i/8;
        const double v = surface.FirstVParameter()+(surface.LastVParameter()-surface.FirstVParameter())*j/8;
        samples.push_back({u,v,surface.Value(u,v)});
    }
}
std::pair<double,double> erosion::SurfaceWitness::closest(const gp_Pnt& target) const {
    const auto seed = std::min_element(samples.begin(),samples.end(),[&](const auto& a,const auto& b) {
        return target.SquareDistance(a.point) < target.SquareDistance(b.point);
    });
    double u = seed->u, v = seed->v, squared = seed->point.SquareDistance(target);
    const double u0 = surface.FirstUParameter(), u1 = surface.LastUParameter();
    const double v0 = surface.FirstVParameter(), v1 = surface.LastVParameter();
    for (int iteration = 0; iteration < 16; ++iteration) {
        gp_Pnt point;
        gp_Vec du, dv;
        surface.D1(u,v,point,du,dv);
        const gp_Vec residual(point,target);
        const double a = du.SquareMagnitude(), b = du.Dot(dv), c = dv.SquareMagnitude();
        const double determinant = a*c-b*b;
        if (determinant <= 1e-24) break;
        const double x = residual.Dot(du), y = residual.Dot(dv);
        const double stepU = std::clamp((c*x-b*y)/determinant,-(u1-u0)/4,(u1-u0)/4);
        const double stepV = std::clamp((a*y-b*x)/determinant,-(v1-v0)/4,(v1-v0)/4);
        bool improved = false;
        for (double step = 1; step >= 1.0/128; step /= 2) {
            const double nextU = std::clamp(u+step*stepU,u0,u1), nextV = std::clamp(v+step*stepV,v0,v1);
            const double next = surface.Value(nextU,nextV).SquareDistance(target);
            if (next >= squared) continue;
            u = nextU;
            v = nextV;
            improved = squared-next > 1e-16;
            squared = next;
            break;
        }
        if (!improved) break;
    }
    return {u,v};
}
