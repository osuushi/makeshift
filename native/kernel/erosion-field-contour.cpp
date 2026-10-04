#include "erosion-field.h"
#include "erosion-field-grid.h"
#include <chrono>
#include <cmath>
#include <map>
#include <stdexcept>

namespace erosion {
namespace {
using namespace mesh_fit;
class Contour {
    const std::vector<V>& points;
    const std::vector<double>& values;
    std::map<Edge,int> edges;
    const std::function<double(const V&)>& field;
    bool refineRoots;
    std::chrono::steady_clock::time_point started;
public:
    Mesh mesh;
    Contour(const std::vector<V>& p,const std::vector<double>& v, const std::function<double(const V&)>& f, bool refine, std::chrono::steady_clock::time_point start):
        points(p), values(v), field(f), refineRoots(refine), started(start) {}
    int crossing(int a,int b) {
        const auto key = edge(a,b);
        const auto found = edges.find(key);
        if (found != edges.end()) return found->second;
        // Keep the proposal away from grid-vertex degeneracy. This displacement
        // is at most 0.1% of an edge; the fitted B-rep is separately checked for valid solid geometry.
        double t = std::clamp(values[a]/(values[a]-values[b]),0.001,0.999);
        if(refineRoots) {
            double low=0,high=1,first=values[a],last=values[b];
            for(int iteration=0;iteration<10;++iteration) {
                const double value=field(points[a]+(points[b]-points[a])*t);
                if(!std::isfinite(value)) throw std::runtime_error("Invalid erosion distance sample");
                if(std::abs(value)<1e-8) break;
                if((value>0)==(first>0)) {low=t;first=value;} else {high=t;last=value;}
                t=std::clamp(low+(high-low)*first/(first-last),low+(high-low)*0.1,high-(high-low)*0.1);
            }
            t=std::clamp(t,0.001,0.999);
        }

        if(refineRoots && mesh.vertices.size()%256==0 &&
           std::chrono::steady_clock::now()-started>std::chrono::seconds(12))
            throw std::runtime_error("Erode distance field exceeded its calculation budget");
        const int index = int(mesh.vertices.size());
        mesh.vertices.push_back(points[a]+(points[b]-points[a])*t);
        edges.emplace(key,index);
        if (mesh.vertices.size() > 100000) throw std::runtime_error("Erode distance mesh exceeds vertex budget");
        return index;
    }
    void triangle(int a,int b,int c,const V& outward) {
        const auto normal = (mesh.vertices[b]-mesh.vertices[a]).Crossed(mesh.vertices[c]-mesh.vertices[a]);
        if (normal.Dot(outward) < 0) std::swap(b,c);
        mesh.triangles.push_back({a,b,c});
        if (mesh.triangles.size() > 200000) throw std::runtime_error("Erode distance mesh exceeds triangle budget");
    }
    void tetrahedron(const std::array<int,4>& cell) {
        std::vector<int> inside,outside;
        V direction;
        for (int index : cell) (values[index] > 0 ? inside : outside).push_back(index);
        if (inside.empty() || outside.empty()) return;
        for (int index : outside) direction += points[index]/outside.size();
        for (int index : inside) direction -= points[index]/inside.size();
        if (inside.size() == 1 || outside.size() == 1) {
            const auto& single = inside.size() == 1 ? inside : outside;
            const auto& triple = inside.size() == 1 ? outside : inside;
            triangle(crossing(single[0],triple[0]),crossing(single[0],triple[1]),
                     crossing(single[0],triple[2]),direction);
        } else {
            const int a = crossing(inside[0],outside[0]), b = crossing(inside[0],outside[1]);
            const int c = crossing(inside[1],outside[1]), d = crossing(inside[1],outside[0]);
            triangle(a,b,c,direction); triangle(a,c,d,direction);
        }
    }
};
}
mesh_fit::Mesh contourField(const V& low,const V& high,double spacing,
                           const std::function<double(const V&)>& field, bool refineRoots, bool adaptive) {
    if (!std::isfinite(spacing) || spacing <= 0)
        throw std::runtime_error("Invalid erosion distance-field spacing");
    std::array<int,3> count;
    size_t total = 1;
    for (int axis = 0; axis < 3; ++axis) {
        const double width = high.Coord(axis+1)-low.Coord(axis+1);
        const double steps = std::ceil(width/spacing)+1;
        if (!std::isfinite(steps) || width <= 0 || steps > 300000)
            throw std::runtime_error("Erode distance field exceeds sampling budget");
        count[axis] = int(steps);
        total *= size_t(count[axis]);
        if ((!adaptive && total > 300000) || (adaptive && count[axis] > 513)) throw std::runtime_error("Erode distance field exceeds sampling budget");
    }
    const auto start = std::chrono::steady_clock::now();
    FieldGrid grid;
    if (adaptive) grid = sampleDistanceGrid(low,count,spacing,field,start);
    else {
        grid.points.reserve(total); grid.values.reserve(total);
        for (int z = 0; z < count[2]; ++z) for (int y = 0; y < count[1]; ++y) for (int x = 0; x < count[0]; ++x) {
            const V p = low+V(x,y,z)*spacing;
            const double value = field(p);
            if (!std::isfinite(value)) throw std::runtime_error("Invalid erosion distance sample");
            grid.points.push_back(p); grid.values.push_back(value);
            if ((grid.values.size()%256) == 0 && std::chrono::steady_clock::now()-start > std::chrono::seconds(12))
                throw std::runtime_error("Erode distance field exceeded its calculation budget");
        }
        auto index = [&](int x,int y,int z) { return (z*count[1]+y)*count[0]+x; };
        for (int z = 0; z+1 < count[2]; ++z) for (int y = 0; y+1 < count[1]; ++y) for (int x = 0; x+1 < count[0]; ++x) {
            std::array<int,8> corners;
            for (int i = 0; i < 8; ++i) corners[i] = index(x+(i&1),y+((i>>1)&1),z+((i>>2)&1));
            grid.cells.push_back(corners);
        }
    }
    Contour contour(grid.points,grid.values,field,refineRoots,start);
    constexpr int tetrahedra[6][4] = {{0,1,3,7},{0,3,2,7},{0,2,6,7},{0,6,4,7},{0,4,5,7},{0,5,1,7}};
    for (const auto& corners : grid.cells) for (const auto& t : tetrahedra)
        contour.tetrahedron({corners[t[0]],corners[t[1]],corners[t[2]],corners[t[3]]});
    return std::move(contour.mesh);
}
}
