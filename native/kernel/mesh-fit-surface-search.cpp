#include "mesh-fit.h"
#include <algorithm>
#include <cmath>

namespace mesh_fit {
SurfaceSearch::SurfaceSearch(const Network& n, int count) : network(n), resolution(count) {
    for (size_t p = 0; p < n.patches.size(); ++p) {
        const int base = int(mesh.vertices.size());
        for (int i = 0; i <= count; ++i) for (int j = 0; j <= count; ++j)
            mesh.vertices.push_back(evaluate(n,int(p),double(i)/count,double(j)/count).point);
        for (int i = 0; i < count; ++i) for (int j = 0; j < count; ++j) {
            const int a = base+i*(count+1)+j, b = a+count+1;
            mesh.triangles.push_back({a,b,b+1}); mesh.triangles.push_back({a,b+1,a+1});
        }
    }
    search = std::make_unique<Search>(mesh);
}
SurfaceHit SurfaceSearch::closest(const V& p) const {
    const auto hit = search->closest(p);
    const int patch = hit.triangle/(resolution*resolution*2);
    double u = 0, v = 0;
    for (int i = 0; i < 3; ++i) {
        const int index = mesh.triangles[hit.triangle][i] % ((resolution+1)*(resolution+1));
        u += double(index/(resolution+1))/resolution*hit.weights[i];
        v += double(index%(resolution+1))/resolution*hit.weights[i];
    }
    auto value = evaluate(network,patch,u,v);
    for (int step = 0; step < 15; ++step) {
        const auto delta = p-value.point;
        const double a = value.du.Dot(value.du), b = value.du.Dot(value.dv), c = value.dv.Dot(value.dv);
        const double determinant = a*c-b*b;
        if (determinant < 1e-25) break;
        const double du = (delta.Dot(value.du)*c-delta.Dot(value.dv)*b)/determinant;
        const double dv = (delta.Dot(value.dv)*a-delta.Dot(value.du)*b)/determinant;
        if (std::abs(du)+std::abs(dv) < 1e-11) break;
        bool improved = false;
        for (double factor = 1; factor >= 1.0/32; factor *= 0.5) {
            const double nextU = std::clamp(u+du*factor,0.0,1.0), nextV = std::clamp(v+dv*factor,0.0,1.0);
            const auto next = evaluate(network,patch,nextU,nextV);
            if ((p-next.point).SquareModulus() < delta.SquareModulus()) {
                value = next; u = nextU; v = nextV; improved = true; break;
            }
        }
        if (!improved) break;
    }
    return {value,patch,u,v};
}
}
