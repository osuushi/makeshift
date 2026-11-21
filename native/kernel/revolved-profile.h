#pragma once
#include "kernel.h"
#include <Geom_TrimmedCurve.hxx>
#include <gp_Ax3.hxx>
#include <gp_Sphere.hxx>

namespace revolved_profile {
struct Meridian {
    std::string face;
    Handle(Geom_Curve) curve;
};
struct Dimple {
    std::string face;
    gp_Sphere sphere;
};
struct ThroughBore {
    gp_Ax1 axis;
    std::vector<SourceEntity> walls;
};
struct Band {
    const Operand& body;
    gp_Ax3 frame;
    double height;
    std::array<std::string, 2> caps;
    std::vector<Meridian> meridians;
    std::vector<Dimple> dimples;
    std::vector<ThroughBore> bores;
    std::optional<Result> stock;

    gp_Ax1 axis() const { return {frame.Location(), frame.YDirection()}; }
    gp_Pnt at(double radius, double height) const;
};
bool coaxial(const gp_Ax1&, const gp_Ax1&);
std::optional<gp_Ax1> inwardAxis(const TopoDS_Face&);
gp_Ax3 radialFrame(const gp_Ax1&, double station);
Handle(Geom_TrimmedCurve) meridian(const TopoDS_Face&, const Band&);
ThroughBore throughBore(const Operand&, const SourceEntity&);
Band boreProfile(const Operand&, const ThroughBore&, const TopoDS_Shape& envelope);
void verifyBoreRecovery(const Band&);
Band inspect(const Tree&, const std::vector<Operand>&);
}

void describeRevolvedProfile(std::ostream&, const Tree&, const std::vector<Operand>&);
std::vector<Result> replaceRevolvedProfile(const Tree&, const std::vector<Operand>&,
                                           std::vector<std::string>&);
