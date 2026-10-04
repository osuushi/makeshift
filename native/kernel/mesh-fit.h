#pragma once
#include "kernel.h"
#include <algorithm>
#include <array>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <set>

// Temporary reconstruction data only. Accepted geometry remains an ordinary B-rep.
namespace mesh_fit {
using V = gp_XYZ;
using Quad = std::array<int, 4>;
using Triangle = std::array<int, 3>;
using Edge = std::pair<int, int>;
inline Edge edge(int a, int b) { return std::minmax(a, b); }
inline double length(const V& p) { return p.Modulus(); }
inline V unit(const V& p) { return p / std::max(1e-30, length(p)); }
struct Mesh {
    std::vector<V> vertices;
    std::vector<Triangle> triangles;
    // Optional smooth-source construction guidance, never persistent data.
    std::vector<V> normals;
};
struct Layout {
    std::vector<V> vertices;
    std::vector<Quad> quads;
    std::set<Edge> creases;
};
struct Input {
    Mesh target;
    Layout layout;
    V origin;
    double scale, tolerance, smoothAngle;
    int maxPatches;
};
struct Hit {
    V point, normal;
    std::array<double, 3> weights{};
    double distance2 = std::numeric_limits<double>::infinity();
    int triangle = -1;
};
class Search {
    struct Node { V lo, hi; int start, end, left = -1, right = -1; };
    struct Facet {
        V ab, ac, lo, hi;
        double aa, bb, cc, denominator;
    };
    const Mesh& mesh;
    std::vector<Facet> facets;
    std::vector<V> normals;
    std::vector<int> order;
    std::vector<Node> nodes;
    int build(int start, int end);
    void visit(int node, const V& p, Hit& hit) const;
    void crossings(int,const V&,const V&,int&,bool&) const;
public:
    explicit Search(const Mesh& mesh, bool smoothNormals = false);
    Hit closest(const V& p) const;
    // Triangle ray parity for temporary proposals; ambiguous edge hits need a fallback.
    std::optional<bool> contains(const V&) const;
};
struct Patch { Quad corners; std::array<int, 16> controls; };
struct Network {
    Layout layout;
    std::vector<V> controls;
    std::vector<Patch> patches;
};
struct Evaluation { V point, du, dv; };
struct SurfaceHit { Evaluation value; int patch; double u, v; };
class SurfaceSearch {
    const Network& network;
    int resolution;
    Mesh mesh;
    std::unique_ptr<Search> search;
public:
    SurfaceSearch(const Network&, int resolution);
    SurfaceHit closest(const V&) const;
};
struct Statistics {
    double forward = 0, reverse = 0, normalAngle = 0, rms = 0;
    int samples = 0;
    bool oriented = true;
};
struct Fitted {
    TopoDS_Shape shape;
    Statistics stats;
    int patches = 0, controlPoints = 0;
    std::optional<std::array<int,3>> analyticFaces;
    std::vector<double> vertexErrors;
};
// Calculation reuse for Erode; normalized input and ordinary exact geometry out.
Input automaticInput(Mesh,double tolerance,int maxPatches);
Fitted fitSurface(Input,bool deviations = false,bool approximate = false);
using Seams = std::map<Edge,std::vector<std::pair<int,int>>>;
Seams smoothSeams(const Network&);
std::map<Edge,std::array<V,9>> seamNormals(const Network&,const Seams&,const Search&);
Input read(const Tree&);
Mesh sphereMap(const Mesh&);
void balanceSphere(Mesh&,const Mesh&);
Layout automaticLayout(const Mesh&,int budget);
std::optional<Layout> radialLayout(const Mesh&,int budget);
int topology(const std::vector<V>&, const std::vector<std::vector<int>>&, const char*);
Network initialize(const Layout&, const Search&);
Network refine(const Network&);
std::array<double, 4> basis(double t);
std::array<double, 4> derivative(double t);
Evaluation evaluate(const Network&, int patch, double u, double v);
void fit(Network&, const Network& seed, const Mesh&, const Search&, int iterations);
Statistics assess(const Network&, const Mesh&, const Search&);
TopoDS_Shape assemble(const Network&, const Input&);
void reconstruct(std::ostream&, const Tree&);
}
