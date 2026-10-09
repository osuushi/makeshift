#pragma once
#include <boost/property_tree/ptree.hpp>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Face.hxx>
#include <TopTools_MapOfShape.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <Geom_Curve.hxx>
#include <ostream>
#include <optional>
#include <string>
#include <vector>

using Tree = boost::property_tree::ptree;
struct SourceEntity { std::string id; TopoDS_Shape shape; };
struct Operand { std::string id; TopoDS_Shape shape; std::vector<SourceEntity> entities; };
struct Result {
    TopoDS_Shape shape;
    std::vector<SourceEntity> predecessors;
    std::vector<std::string> bodies;
    std::vector<TopoDS_Face> selectedFaces;
    bool copy = false;
    // Extraction can supply the exact scalar already integrated for this final
    // shape. No geometry mutation is allowed after setting it; meshing only adds
    // derived triangulation, which the exact integration does not consume.
    std::optional<double> exactVolume;
};
gp_Pnt point(const Tree& tree);
std::string quoted(const std::string& value);
std::string encode(const TopoDS_Shape& shape);
TopoDS_Shape decode(const std::string& data);
std::vector<Operand> operands(const Tree& input);
TopoDS_Shape sweep(const Tree& input, const std::vector<Operand>& bodies, std::vector<SourceEntity>& origins);
std::vector<Result> calculate(const Tree& input, const std::vector<Operand>& bodies, std::string& mode, std::vector<std::string>& participants, std::vector<Result>* tools = nullptr);
void present(std::ostream& out, const Result& result, double deflection = 0.05);
// A preferred global flux axis is a numerical integration hint for closed solids.
double volume(const TopoDS_Shape& shape, int referenceAxis = -1);
void validate(const TopoDS_Shape& shape);

std::vector<double> signature(const TopoDS_Shape& shape);

std::vector<Result> transformBodies(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

TopoDS_Shape booleanShape(const TopoDS_Shape&, const TopoDS_Shape&, const std::string&, std::vector<SourceEntity>&);
void solids(std::vector<Result>&, const TopoDS_Shape&, const std::vector<SourceEntity>&, const std::vector<std::string>&, int referenceAxis = -1);
std::vector<Result> booleanBodies(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

std::vector<Result> finishEdges(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

void edgeFinishSelection(std::ostream&, const Tree&, const std::vector<Operand>&);

std::vector<Result> offsetFaces(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

void checkOffsetFace(const TopoDS_Face&, double);
void checkUnselectedSupport(const TopoDS_Face&, const TopoDS_Face&);

std::vector<TopoDS_Face> tangentFaceChain(const TopoDS_Shape&, const std::vector<TopoDS_Face>&);

void checkOffsetVolume(const TopoDS_Shape&, const TopoDS_Shape&, double,
                       const std::vector<TopoDS_Shape>& preservedVertices = {});

TopoDS_Face profileFace(const Tree&, const std::vector<Operand>&);
TopoDS_Shape pathSweep(const Tree&, const std::vector<Operand>&);
TopoDS_Shape revolve(const Tree&, const std::vector<Operand>&);

void projectCurves(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies);
std::vector<Handle(Geom_Curve)> projectionContours(const Tree&, const std::vector<Operand>&);
std::vector<Handle(Geom_Curve)> projectionSpans(const Handle(Geom_Curve)&, const std::vector<gp_Pnt>&);

std::vector<Result> cleanupBodies(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

TopoDS_Shape extrudeProfile(const TopoDS_Face&, const gp_Vec&, const Tree&);
TopoDS_Shape extrudeDraft(const TopoDS_Face&, const gp_Vec&, const Tree&);
double extrusionDraftOffset(const gp_Vec&, const Tree&);
TopoDS_Shape extrudeTwist(const TopoDS_Face&, const gp_Vec&, const Tree&);

Result cleanupEdges(const Operand&, const TopTools_MapOfShape&,
                    const TopTools_MapOfShape& protectedEdges = TopTools_MapOfShape());
std::vector<Result> deleteTopology(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

std::vector<Result> shellBodies(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);
std::vector<Result> cutWithPlane(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);

void sketchSections(std::ostream&, const Tree&, const std::vector<Operand>&);

void offsetSketch(std::ostream&, const Tree&);
void planarSketchCurves(std::ostream&, const TopoDS_Shape&, const Tree&);

std::vector<Result> replaceFace(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);
void inspectTopology(std::ostream&, const Tree&, const std::vector<Operand>&);
void exportStep(std::ostream&, const Tree&);

TopoDS_Shape loftSections(const Tree&, const std::vector<Operand>&);
