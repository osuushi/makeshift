#include "mesh-fit.h"
#include <algorithm>
#include <numeric>

namespace mesh_fit {
namespace {
Hit triangleHit(const V& p, const V& a, const V& b, const V& c,
                const V& ab, const V& ac, double aa, double bb, double cc, double denominator) {
    const auto ap = p-a;
    Hit hit;
    if (denominator > 1e-30) {
        const double u = (ap.Dot(ab)*bb-ap.Dot(ac)*cc)/denominator;
        const double v = (ap.Dot(ac)*aa-ap.Dot(ab)*cc)/denominator;
        if (u >= 0 && v >= 0 && u+v <= 1) {
            hit.point = a+ab*u+ac*v;
            hit.weights = {1-u-v,u,v}; hit.distance2 = (p-hit.point).SquareModulus();
            return hit;
        }
    }
    const std::array<V,3> points{a,b,c};
    for (int i = 0; i < 3; ++i) {
        const int j = (i+1)%3;
        const auto d = points[j]-points[i];
        const double t = std::clamp((p-points[i]).Dot(d)/std::max(1e-30,d.SquareModulus()),0.0,1.0);
        const auto q = points[i]+d*t;
        const double distance = (p-q).SquareModulus();
        if (distance < hit.distance2) {
            hit.point = q; hit.distance2 = distance; hit.weights = {};
            hit.weights[i] = 1-t; hit.weights[j] = t;
        }
    }
    return hit;
}
double boxDistance(const V& p, const V& lo, const V& hi) {
    double distance = 0;
    for (int i = 1; i <= 3; ++i) {
        const double d = std::max({lo.Coord(i)-p.Coord(i),p.Coord(i)-hi.Coord(i),0.0});
        distance += d*d;
    }
    return distance;
}
}
Search::Search(const Mesh& value, bool smoothNormals) : mesh(value), normals(value.triangles.size()*3), order(value.triangles.size()) {
    std::iota(order.begin(), order.end(), 0);
    facets.reserve(mesh.triangles.size());
    for (const auto& t : mesh.triangles) {
        const auto& a = mesh.vertices[t[0]];
        const auto& b = mesh.vertices[t[1]];
        const auto& c = mesh.vertices[t[2]];
        const auto ab = b-a, ac = c-a;
        V lo, hi;
        for (int axis = 1; axis <= 3; ++axis) {
            lo.SetCoord(axis,std::min({a.Coord(axis),b.Coord(axis),c.Coord(axis)}));
            hi.SetCoord(axis,std::max({a.Coord(axis),b.Coord(axis),c.Coord(axis)}));
        }
        const double aa = ab.Dot(ab), bb = ac.Dot(ac), cc = ab.Dot(ac);
        facets.push_back({ab,ac,lo,hi,aa,bb,cc,aa*bb-cc*cc});
    }
    if (!mesh.normals.empty()) {
        for (size_t t = 0; t < mesh.triangles.size(); ++t) for (int j = 0; j < 3; ++j)
            normals[t*3+j] = unit(mesh.normals.at(mesh.triangles[t][j]));
        build(0,int(order.size()));
        return;
    }
    std::vector<V> faceNormals;
    std::vector<std::vector<int>> incident(mesh.vertices.size());
    for (size_t t = 0; t < mesh.triangles.size(); ++t) {
        const auto& f = mesh.triangles[t];
        faceNormals.push_back((mesh.vertices[f[1]]-mesh.vertices[f[0]]).Crossed(mesh.vertices[f[2]]-mesh.vertices[f[0]]));
        for (int v : f) incident[v].push_back(int(t));
    }
    for (size_t t = 0; t < mesh.triangles.size(); ++t) for (int j = 0; j < 3; ++j)
        for (int other : incident[mesh.triangles[t][j]])
            if (smoothNormals || unit(faceNormals[t]).Dot(unit(faceNormals[other])) > 0.7071067811865476)
                normals[t*3+j] += faceNormals[other];
    for (auto& n : normals) n = unit(n);
    build(0, int(order.size()));
}
int Search::build(int start, int end) {
    const int id = int(nodes.size());
    V lo(1e100,1e100,1e100), hi(-1e100,-1e100,-1e100);
    for (int i = start; i < end; ++i) for (int v : mesh.triangles[order[i]])
        for (int d = 1; d <= 3; ++d) {
            lo.SetCoord(d,std::min(lo.Coord(d),mesh.vertices[v].Coord(d)));
            hi.SetCoord(d,std::max(hi.Coord(d),mesh.vertices[v].Coord(d)));
        }
    nodes.push_back({lo,hi,start,end});
    if (end-start <= 8) return id;
    const auto extent = hi-lo;
    int axis = 1;
    for (int d = 2; d <= 3; ++d) if (extent.Coord(d) > extent.Coord(axis)) axis = d;
    auto center = [&](int t) {
        const auto& f = mesh.triangles[t];
        return mesh.vertices[f[0]].Coord(axis)+mesh.vertices[f[1]].Coord(axis)+mesh.vertices[f[2]].Coord(axis);
    };
    const int mid = (start+end)/2;
    std::nth_element(order.begin()+start,order.begin()+mid,order.begin()+end,
        [&](int a,int b) { return center(a) < center(b); });
    nodes[id].left = build(start,mid); nodes[id].right = build(mid,end);
    return id;
}
void Search::visit(int id, const V& p, Hit& hit) const {
    const auto& n = nodes[id];
    if (boxDistance(p,n.lo,n.hi) > hit.distance2) return;
    if (n.left >= 0) {
        const auto& a = nodes[n.left]; const auto& b = nodes[n.right];
        const bool leftFirst = boxDistance(p,a.lo,a.hi) <= boxDistance(p,b.lo,b.hi);
        visit(leftFirst ? n.left : n.right,p,hit);
        visit(leftFirst ? n.right : n.left,p,hit);
        return;
    }
    for (int i = n.start; i < n.end; ++i) {
        const int triangle = order[i];
        const auto& f = mesh.triangles[triangle];
        const auto& data = facets[triangle];
        // A triangle's box is a lower distance bound, just like the BVH nodes.
        if (boxDistance(p,data.lo,data.hi) > hit.distance2) continue;
        auto candidate = triangleHit(p,mesh.vertices[f[0]],mesh.vertices[f[1]],mesh.vertices[f[2]],
                                     data.ab,data.ac,data.aa,data.bb,data.cc,data.denominator);
        if (candidate.distance2 >= hit.distance2) continue;
        candidate.triangle = triangle;
        hit = candidate;
    }
}
Hit Search::closest(const V& p) const {
    Hit hit; visit(0,p,hit);
    hit.normal = V(0,0,0);
    if (hit.triangle >= 0) {
        for (int j = 0; j < 3; ++j) hit.normal += normals[hit.triangle*3+j]*hit.weights[j];
        hit.normal = unit(hit.normal);
    }
    return hit;
}
}
