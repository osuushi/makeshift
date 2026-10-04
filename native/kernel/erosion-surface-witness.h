#pragma once
#include <BRepAdaptor_Surface.hxx>
#include <utility>
#include <vector>

namespace erosion {
// Finds a nearby point on the actual support, not a certified closest point.
// The caller must classify its parameters against the face's trimming wires.
class SurfaceWitness {
    struct Sample { double u, v; gp_Pnt point; };
    BRepAdaptor_Surface surface;
    std::vector<Sample> samples;
public:
    explicit SurfaceWitness(const BRepAdaptor_Surface&);
    std::pair<double,double> closest(const gp_Pnt&) const;
};
}
