#pragma once
#include "kernel.h"
#include <Geom_TrimmedCurve.hxx>
#include <TopoDS_Edge.hxx>
#include <gp_Ax3.hxx>
#include <gp_Sphere.hxx>

class BRepAdaptor_Surface;

namespace revolved_profile {
struct Meridian {
    std::string face;
    Handle(Geom_Curve) curve;
    TopoDS_Edge sectionEdge;
};
struct Dimple {
    std::string face;
    gp_Sphere sphere;
};
struct ThroughBore {
    gp_Ax1 axis;
    std::vector<SourceEntity> walls;
};
struct PlanarCut {
    std::vector<SourceEntity> walls;
};
struct Band {
    const Operand& body;
    gp_Ax3 frame;
    double height;
    bool endGuides = false;
    std::vector<Meridian> meridians;
    std::vector<Dimple> dimples;
    std::vector<ThroughBore> bores;
    std::vector<SourceEntity> parallelCuts;
    std::vector<PlanarCut> planarCuts;
    std::optional<Result> stock;
    TopoDS_Shape cornerEnvelope;

    gp_Ax1 axis() const { return {frame.Location(), frame.YDirection()}; }
    gp_Pnt at(double radius, double height) const;
};
std::optional<gp_Ax1> rotationAxis(const BRepAdaptor_Surface&);
gp_Ax1 stableAxis(gp_Ax1);
bool coaxial(const gp_Ax1&, const gp_Ax1&);
std::optional<gp_Ax1> inwardAxis(const TopoDS_Face&);
gp_Ax3 radialFrame(const gp_Ax1&, double station);
std::array<double, 2> axialStations(const TopoDS_Shape&, const gp_Ax1&);
Handle(Geom_TrimmedCurve) meridian(const TopoDS_Face&, const Band&, bool completeTurn = true);
ThroughBore throughBore(const Operand&, const SourceEntity&);
Band boreProfile(const Operand&, const ThroughBore&, const TopoDS_Shape& envelope);
void trimToEndGuides(Band&);
std::optional<Band> cornerProfile(const Operand&, const SourceEntity&);
TopoDS_Shape replaceCorner(const Band&, const TopoDS_Shape& revolved, std::vector<SourceEntity>&);
bool hasMaterial(const TopoDS_Shape&, double threshold);
TopoDS_Shape joinCutSeams(const TopoDS_Shape&, std::vector<SourceEntity>&);
TopoDS_Shape trimDimples(const TopoDS_Shape&, const Band&, std::vector<SourceEntity>&);
bool hasDisconnectedCut(const std::vector<SourceEntity>&);
TopoDS_Shape recutParallel(TopoDS_Shape, const std::vector<SourceEntity>&, std::vector<SourceEntity>&);
TopoDS_Shape recutPlanar(TopoDS_Shape, const std::vector<PlanarCut>&, std::vector<SourceEntity>&);
void verifySameMaterial(const TopoDS_Shape&, const TopoDS_Shape&, const char* message);
void verifySectionMaterial(const TopoDS_Shape&, const TopoDS_Shape&, bool exactSupports,
                           const char* message = "The recovered profile does not reproduce the turned body");
void verifyBoreRecovery(const Band&);
Band sectionProfile(const Operand&, const gp_Ax1&, std::vector<SourceEntity>,
                    const std::optional<gp_Dir>& direction = std::nullopt);
std::optional<Band> sectionWithPlanarCuts(const Operand&, const gp_Ax1&, const std::vector<SourceEntity>&);
TopoDS_Face recoveredSectionFace(const Band&);
void verifySectionRecovery(const Band&, bool exactSupports);
Band inspect(const Tree&, const std::vector<Operand>&, bool verifyRecovery = false);
}

void describeRevolvedProfile(std::ostream&, const Tree&, const std::vector<Operand>&);
std::vector<Result> replaceRevolvedProfile(const Tree&, const std::vector<Operand>&,
                                           std::vector<std::string>&);
