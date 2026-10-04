#pragma once
#include "mesh-fit.h"
#include <optional>

namespace mesh_fit::analytic {
enum class Kind { Sphere, Cylinder, Capsule };
// Temporary fit parameters in normalized mesh coordinates; not persistent features.
struct Candidate {
    Kind kind;
    V center, axis{0,0,1};
    double radius = 0, low = 0, high = 0;
};
struct Result {
    TopoDS_Shape shape;
    Statistics stats;
    std::vector<double> vertexErrors;
    int planes = 0, cylinders = 0, spheres = 0;
};
std::vector<Candidate> candidates(const Mesh&);
V closest(const Candidate&,const V&);
std::optional<Result> assess(const Candidate&,const Input&,const Search&);
TopoDS_Shape assemble(const Candidate&,const Input&);
std::optional<Result> reconstruct(const Input&);
}
