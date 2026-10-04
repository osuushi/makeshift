#include "mesh-fit.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace mesh_fit {
namespace {
std::vector<V> vertices(const Tree& tree) {
    if (tree.size() < 4 || tree.size() > 100000)
        throw std::runtime_error("Mesh fitting requires 4–100000 vertices");
    std::vector<V> result;
    for (const auto& item : tree) {
        const auto p = point(item.second).XYZ();
        if (std::max({std::abs(p.X()), std::abs(p.Y()), std::abs(p.Z())}) > 1e9)
            throw std::runtime_error("Mesh fitting coordinates exceed the supported range");
        result.push_back(p);
    }
    return result;
}
template<size_t N> std::vector<std::array<int, N>> faces(const Tree& tree, size_t count, size_t limit) {
    if (tree.empty() || tree.size() > limit) throw std::runtime_error("Mesh fitting face budget exceeded");
    std::vector<std::array<int, N>> result;
    for (const auto& item : tree) {
        if (item.second.size() != N) throw std::runtime_error("Invalid mesh face size");
        std::array<int, N> face; int i = 0;
        for (const auto& index : item.second) {
            const double value = index.second.get_value<double>();
            if (!std::isfinite(value) || value != std::floor(value) || value < 0 || value >= count)
                throw std::runtime_error("Invalid mesh vertex index");
            face[i++] = int(value);
        }
        if (std::set<int>(face.begin(), face.end()).size() != N)
            throw std::runtime_error("Repeated vertex in mesh face");
        result.push_back(face);
    }
    return result;
}
template<size_t N> int check(const std::vector<V>& points, const std::vector<std::array<int, N>>& fs, const char* name) {
    std::vector<std::vector<int>> list;
    for (const auto& f : fs) list.emplace_back(f.begin(), f.end());
    return topology(points, list, name);
}
}
int topology(const std::vector<V>& points, const std::vector<std::vector<int>>& fs, const char* name) {
    auto fail = [name](const char* why) { throw std::runtime_error(std::string(name) + ": " + why); };
    std::map<Edge, std::vector<std::pair<int, int>>> edges;
    std::vector<std::set<int>> incident(points.size());
    double volume6 = 0;
    for (size_t f = 0; f < fs.size(); ++f) {
        const auto& face = fs[f];
        for (size_t j = 0; j < face.size(); ++j) {
            const int a = face[j], b = face[(j+1)%face.size()];
            if ((points[a]-points[b]).SquareModulus() < 1e-24) fail("collapsed edge");
            edges[edge(a,b)].push_back({int(f), a < b ? 1 : -1});
            incident[a].insert(int(f));
        }
        for (size_t j = 1; j+1 < face.size(); ++j) {
            const auto a = points[face[0]], b = points[face[j]], c = points[face[j+1]];
            if ((b-a).Crossed(c-a).SquareModulus() < 1e-24) fail("degenerate face");
            volume6 += a.Dot(b.Crossed(c));
        }
    }
    std::vector<std::vector<int>> adjacent(fs.size());
    std::vector<std::map<int,std::vector<int>>> fans(points.size());
    for (const auto& [e, uses] : edges) {
        if (uses.size() != 2 || uses[0].second == uses[1].second)
            fail("requires consistently oriented closed manifold edges");
        const int a = uses[0].first, b = uses[1].first;
        adjacent[a].push_back(b); adjacent[b].push_back(a);
        for (int v : {e.first,e.second}) { fans[v][a].push_back(b); fans[v][b].push_back(a); }
    }
    auto connected = [](int first, const auto& adjacency) {
        std::set<int> seen; std::vector<int> pending{first};
        while (!pending.empty()) {
            const int f = pending.back(); pending.pop_back();
            if (!seen.insert(f).second) continue;
            for (int n : adjacency.at(f)) pending.push_back(n);
        }
        return seen.size();
    };
    if (connected(0, adjacent) != fs.size()) fail("requires one connected component");
    for (size_t v = 0; v < points.size(); ++v) {
        if (incident[v].empty()) fail("unused vertex");
        if (connected(*incident[v].begin(), fans[v]) != incident[v].size()) fail("nonmanifold vertex");
    }
    if (!(volume6 > 1e-15)) fail("requires outward orientation and positive volume");
    return int(points.size()) - int(edges.size()) + int(fs.size());
}
namespace {
void prepare(Input& r,bool automatic) {
    const double budget = r.maxPatches;
    if (!std::isfinite(r.tolerance) || r.tolerance < 1e-6 ||
        !std::isfinite(r.smoothAngle) || r.smoothAngle < 0.1 || r.smoothAngle > 30 ||
        !std::isfinite(budget) || budget != std::floor(budget) || budget < (automatic ? size_t(6) : r.layout.quads.size()) || budget > 256)
        throw std::runtime_error("Invalid fit tolerance, smooth angle (0.1–30 degrees), or patch budget (up to 256)");
    V lo = r.target.vertices[0], hi = lo;
    for (const auto& p : r.target.vertices) for (int i = 1; i <= 3; ++i) {
        lo.SetCoord(i, std::min(lo.Coord(i), p.Coord(i)));
        hi.SetCoord(i, std::max(hi.Coord(i), p.Coord(i)));
    }
    r.origin = (lo+hi)*0.5; r.scale = length(hi-lo);
    if (r.scale < 1e-4 || r.scale > 1e6 || r.tolerance > r.scale*0.1)
        throw std::runtime_error("Unsupported mesh scale or tolerance larger than 10% of its diagonal");
    r.tolerance /= r.scale;
    for (auto* list : {&r.target.vertices, &r.layout.vertices})
        for (auto& p : *list) p = (p-r.origin)/r.scale;
    const int targetTopology = check(r.target.vertices, r.target.triangles, "Target mesh");
    if (automatic) {
        if (targetTopology != 2) throw std::runtime_error("Automatic layout currently needs one closed mesh without holes");
    }
    if (!automatic && targetTopology != check(r.layout.vertices, r.layout.quads, "Quad layout"))
        throw std::runtime_error("Target mesh and quad layout must have the same topology (genus)");
}
}
Input read(const Tree& input) {
    Input r;
    r.target.vertices = vertices(input.get_child("mesh.vertices"));
    r.target.triangles = faces<3>(input.get_child("mesh.triangles"), r.target.vertices.size(), 200000);
    const bool automatic = !input.get_child_optional("layout");
    if (!automatic) {
        r.layout.vertices = vertices(input.get_child("layout.vertices"));
        r.layout.quads = faces<4>(input.get_child("layout.quads"), r.layout.vertices.size(), 256);
    }
    r.tolerance = input.get<double>("tolerance");
    r.smoothAngle = input.get<double>("smoothAngle", 5);
    const double budget = input.get<double>("maxPatches", 256);
    if (!std::isfinite(budget) || budget < 0 || budget > 256 || budget != std::floor(budget))
        throw std::runtime_error("Invalid fit patch budget");
    r.maxPatches = int(budget);
    prepare(r,automatic);
    if (const auto cs = input.get_child_optional("layout.creases")) {
        if (!cs->empty()) for (const auto& c : faces<2>(*cs, r.layout.vertices.size(), 1024)) {
            const auto e = edge(c[0], c[1]);
            bool found = false;
            for (const auto& f : r.layout.quads) for (int j = 0; j < 4; ++j)
                found = found || edge(f[j], f[(j+1)%4]) == e;
            if (!found || !r.layout.creases.insert(e).second)
                throw std::runtime_error("Creases must name unique quad layout edges");
        }
    }
    return r;
}
Input automaticInput(Mesh mesh,double tolerance,int maxPatches) {
    if (mesh.vertices.size() < 4 || mesh.vertices.size() > 100000 ||
        mesh.triangles.empty() || mesh.triangles.size() > 200000)
        throw std::runtime_error("Reconstructed distance mesh exceeds fitting limits");
    for (const auto& p : mesh.vertices) for (int axis = 1; axis <= 3; ++axis)
        if (!std::isfinite(p.Coord(axis)) || std::abs(p.Coord(axis)) > 1e9)
            throw std::runtime_error("Invalid distance mesh coordinates");
    for (const auto& face : mesh.triangles) for (int index : face)
        if (index < 0 || size_t(index) >= mesh.vertices.size())
            throw std::runtime_error("Invalid distance mesh index");
    if (!mesh.normals.empty()) {
        if (mesh.normals.size() != mesh.vertices.size()) throw std::runtime_error("Invalid mesh normal count");
        for (const auto& normal : mesh.normals)
            if (!std::isfinite(length(normal)) || length(normal) < 1e-12)
                throw std::runtime_error("Invalid mesh normal guidance");
    }
    Input input{std::move(mesh),{},{},0,tolerance,5,maxPatches};
    prepare(input,true);
    return input;
}

}
