#include "mesh-fit.h"
#include <algorithm>

namespace mesh_fit {
namespace {
const double corners[4][2] = {{0,0},{1,0},{1,1},{0,1}};
V sampleNormal(const Network& n,const Search& target,int face,double u,double v) {
    return target.closest(evaluate(n,face,u+(0.5-u)*0.001,v+(0.5-v)*0.001).point).normal;
}
V cornerNormal(const Network& n, const Seams& seams, const Search& target, int start, int vertex) {
    std::set<int> seen;
    std::vector<int> pending{start};
    V sum;
    while (!pending.empty()) {
        const int face = pending.back(); pending.pop_back();
        if (!seen.insert(face).second) continue;
        const auto& q = n.patches[face].corners;
        for (int i = 0; i < 4; ++i) if (q[i] == vertex) {
            sum += sampleNormal(n,target,face,corners[i][0],corners[i][1]);
            for (int neighbor : {q[(i+1)%4],q[(i+3)%4]}) {
                const auto found = seams.find(edge(vertex,neighbor));
                if (found != seams.end()) for (const auto& [other,side] : found->second) pending.push_back(other);
            }
        }
    }
    return unit(sum);
}
std::pair<double,double> uv(int side,double t) {
    if (side == 0) return {t,0};
    if (side == 1) return {1,t};
    if (side == 2) return {1-t,1};
    return {0,1-t};
}
}
Seams smoothSeams(const Network& n) {
    Seams seams;
    for (size_t f = 0; f < n.patches.size(); ++f) for (int side = 0; side < 4; ++side) {
        const auto& q = n.patches[f].corners;
        const auto e = edge(q[side],q[(side+1)%4]);
        if (!n.layout.creases.contains(e)) seams[e].push_back({int(f),side});
    }
    return seams;
}
std::map<Edge,std::array<V,9>> seamNormals(const Network& n, const Seams& seams, const Search& target) {
    std::map<Edge,std::array<V,9>> normals;
    for (const auto& [e,uses] : seams) {
        auto& values = normals[e];
        values[0] = cornerNormal(n,seams,target,uses[0].first,e.first);
        values[8] = cornerNormal(n,seams,target,uses[0].first,e.second);
        for (int k = 1; k < 8; ++k) {
            V sum;
            for (const auto& [face,side] : uses) {
                const bool forward = n.patches[face].corners[side] == e.first;
                const auto [u,v] = uv(side,forward ? k/8.0 : 1-k/8.0);
                sum += sampleNormal(n,target,face,u,v);
            }
            values[k] = unit(sum);
        }
    }
    return normals;
}
}
