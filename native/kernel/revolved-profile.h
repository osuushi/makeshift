#pragma once
#include "kernel.h"
#include <Geom_TrimmedCurve.hxx>
#include <gp_Ax3.hxx>
#include <gp_Sphere.hxx>

namespace revolved_profile {
struct Meridian {
    std::string face;
    Handle(Geom_TrimmedCurve) curve;
};
struct Dimple {
    std::string face;
    gp_Sphere sphere;
};
struct Band {
    const Operand& body;
    gp_Ax3 frame;
    double height;
    std::array<std::string, 2> caps;
    std::vector<Meridian> meridians;
    std::vector<Dimple> dimples;

    gp_Ax1 axis() const { return {frame.Location(), frame.YDirection()}; }
    gp_Pnt at(double radius, double height) const;
};
Band inspect(const Tree&, const std::vector<Operand>&);
}

void describeRevolvedProfile(std::ostream&, const Tree&, const std::vector<Operand>&);
std::vector<Result> replaceRevolvedProfile(const Tree&, const std::vector<Operand>&,
                                           std::vector<std::string>&);
