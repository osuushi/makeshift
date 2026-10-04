#include "mesh-fit.h"
#include <algorithm>

namespace mesh_fit {
namespace {
constexpr int sides[4][4] = {{0,4,8,12},{12,13,14,15},{15,11,7,3},{3,2,1,0}};
V creaseTangent(const Layout& layout, const Search& target, int a, int b, const V& direction) {
    std::vector<V> normals;
    for (const auto& face : layout.quads) {
        bool adjacent = false;
        V center;
        for (int i = 0; i < 4; ++i) {
            center += layout.vertices[face[i]]/4;
            adjacent = adjacent || edge(face[i],face[(i+1)%4]) == edge(a,b);
        }
        if (adjacent) normals.push_back(target.closest(layout.vertices[a]+(center-layout.vertices[a])*0.001).normal);
    }
    const auto tangent = normals[0].Crossed(normals[1]);
    if (tangent.SquareModulus() < 1e-12) return direction;
    const auto axis = unit(tangent);
    return axis*direction.Dot(axis);
}
Network network(const Layout& layout, const std::vector<std::array<V,16>>& poles) {
    Network r; r.layout = layout; r.controls = layout.vertices;
    std::map<Edge,std::array<int,2>> edges;
    for (size_t f = 0; f < layout.quads.size(); ++f) {
        Patch patch{layout.quads[f],{}};
        for (int s = 0; s < 4; ++s) {
            const int a = patch.corners[s], b = patch.corners[(s+1)%4];
            patch.controls[sides[s][0]] = a;
            const auto e = edge(a,b);
            if (!edges.contains(e)) {
                const int index = int(r.controls.size()); edges[e] = {index,index+1};
                r.controls.push_back(poles[f][sides[s][a < b ? 1 : 2]]);
                r.controls.push_back(poles[f][sides[s][a < b ? 2 : 1]]);
            }
            patch.controls[sides[s][1]] = edges[e][a < b ? 0 : 1];
            patch.controls[sides[s][2]] = edges[e][a < b ? 1 : 0];
        }
        for (int i : {5,6,9,10}) {
            patch.controls[i] = int(r.controls.size()); r.controls.push_back(poles[f][i]);
        }
        r.patches.push_back(patch);
    }
    return r;
}
std::array<V,16> split(const std::array<V,16>& p, int direction, bool high) {
    std::array<V,16> result;
    for (int i = 0; i < 4; ++i) {
        auto index = [&](int j) { return direction == 0 ? j*4+i : i*4+j; };
        const auto a = p[index(0)], b = p[index(1)], c = p[index(2)], d = p[index(3)];
        const auto ab = (a+b)*0.5, bc = (b+c)*0.5, cd = (c+d)*0.5;
        const auto abc = (ab+bc)*0.5, bcd = (bc+cd)*0.5, center = (abc+bcd)*0.5;
        const std::array<V,4> row = high ? std::array<V,4>{center,bcd,cd,d} : std::array<V,4>{a,ab,abc,center};
        for (int j = 0; j < 4; ++j) result[index(j)] = row[j];
    }
    return result;
}
}
std::array<double,4> basis(double t) { const double s = 1-t; return {s*s*s,3*s*s*t,3*s*t*t,t*t*t}; }
std::array<double,4> derivative(double t) { const double s = 1-t; return {-3*s*s,3*s*s-6*s*t,6*s*t-3*t*t,3*t*t}; }
Evaluation evaluate(const Network& n, int patch, double u, double v) {
    const auto bu = basis(u), bv = basis(v), du = derivative(u), dv = derivative(v);
    Evaluation r;
    for (int i = 0; i < 4; ++i) for (int j = 0; j < 4; ++j) {
        const auto& p = n.controls[n.patches[patch].controls[i*4+j]];
        r.point += p*(bu[i]*bv[j]); r.du += p*(du[i]*bv[j]); r.dv += p*(bu[i]*dv[j]);
    }
    return r;
}
Network initialize(const Layout& layout, const Search& target) {
    auto fitted = layout;
    for (auto& p : fitted.vertices) {
        p = target.closest(p).point;
    }
    std::vector<std::array<V,16>> poles;
    for (const auto& face : layout.quads) {
        std::array<V,16> p;
        for (int s = 0; s < 4; ++s) {
            const int a = face[s], b = face[(s+1)%4];
            const auto start = fitted.vertices[a], end = fitted.vertices[b], d = (end-start)/3;
            const bool crease = layout.creases.contains(edge(a,b));
            const auto na = target.closest(start+(end-start)*0.001).normal;
            const auto nb = target.closest(end+(start-end)*0.001).normal;
            p[sides[s][0]] = start; p[sides[s][3]] = end;
            p[sides[s][1]] = start+(crease ? creaseTangent(fitted,target,a,b,d) : d-na*d.Dot(na));
            p[sides[s][2]] = end-(crease ? creaseTangent(fitted,target,b,a,d) : d-nb*d.Dot(nb));
        }
        // Blend opposing boundaries, subtracting their double-counted bilinear term.
        for (int i = 1; i < 3; ++i) for (int j = 1; j < 3; ++j) {
            const double u = i/3.0, v = j/3.0;
            const auto bilinear = p[0]*((1-u)*(1-v))+p[12]*(u*(1-v))+p[15]*(u*v)+p[3]*((1-u)*v);
            p[i*4+j] = p[i*4]*(1-v)+p[i*4+3]*v+p[j]*(1-u)+p[12+j]*u-bilinear;
        }
        poles.push_back(p);
    }
    return network(fitted,poles);
}
Network refine(const Network& n) {
    Layout next; next.vertices.assign(n.controls.begin(),n.controls.begin()+n.layout.vertices.size());
    std::map<Edge,int> midpoints;
    std::vector<std::array<V,16>> poles;
    for (size_t f = 0; f < n.patches.size(); ++f) {
        const auto& patch = n.patches[f];
        std::array<int,4> mids;
        for (int s = 0; s < 4; ++s) {
            const auto e = edge(patch.corners[s],patch.corners[(s+1)%4]);
            if (!midpoints.contains(e)) {
                midpoints[e] = int(next.vertices.size());
                const auto& a = n.controls[patch.controls[sides[s][0]]];
                const auto& b = n.controls[patch.controls[sides[s][1]]];
                const auto& c = n.controls[patch.controls[sides[s][2]]];
                const auto& d = n.controls[patch.controls[sides[s][3]]];
                next.vertices.push_back((a+b*3+c*3+d)/8);
                if (n.layout.creases.contains(e)) {
                    next.creases.insert(edge(e.first,midpoints[e])); next.creases.insert(edge(midpoints[e],e.second));
                }
            }
            mids[s] = midpoints[e];
        }
        const int center = int(next.vertices.size()); next.vertices.push_back(evaluate(n,int(f),0.5,0.5).point);
        const auto& q = patch.corners;
        next.quads.insert(next.quads.end(),{{q[0],mids[0],center,mids[3]}, {mids[0],q[1],mids[1],center},
            {center,mids[1],q[2],mids[2]}, {mids[3],center,mids[2],q[3]}});
        std::array<V,16> p; for (int i = 0; i < 16; ++i) p[i] = n.controls[patch.controls[i]];
        poles.push_back(split(split(p,0,false),1,false)); poles.push_back(split(split(p,0,true),1,false));
        poles.push_back(split(split(p,0,true),1,true)); poles.push_back(split(split(p,0,false),1,true));
    }
    return network(next,poles);
}
}
