#include "kernel.h"
#include "sketch-curve.h"
#include "sketch-offset-sections.h"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepOffsetAPI_MakeOffset.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pln.hxx>
#include <cmath>
#include <stdexcept>

void offsetSketch(std::ostream& out, const Tree& input) {
    const double amount = input.get<double>("amount");
    if (!std::isfinite(amount) || std::abs(amount) < 1e-7)
        throw std::runtime_error("Enter a non-zero offset distance");
    BRepBuilderAPI_MakeWire wire;
    for (const auto& item : input.get_child("curves"))
        wire.Add(BRepBuilderAPI_MakeEdge(sketchCurve(item.second)).Edge());
    if (!wire.IsDone()) throw std::runtime_error("Offset source is not a connected wire");
    const auto face = BRepBuilderAPI_MakeFace(gp_Pln(gp::XOY()), wire.Wire()).Face();
    if (!BRepCheck_Analyzer(face).IsValid()) throw std::runtime_error("Offset source is not a valid planar loop");
    BRepOffsetAPI_MakeOffset offset(face, GeomAbs_Intersection);
    offset.Perform(amount);
    TopoDS_Shape result;
    if (offset.IsDone()) result = offset.Shape();
    if (result.IsNull() && amount < 0) {
        // Concave cubic corners need circular erosion joins when extending
        // neighboring offset supports cannot produce an intersection join.
        BRepOffsetAPI_MakeOffset erosion(face, GeomAbs_Arc);
        erosion.Perform(amount);
        if (erosion.IsDone()) result = erosion.Shape();
    }
    if (result.IsNull()) throw std::runtime_error("Offset could not be calculated");
    const auto sections = closedOffsetSections(result, wire.Wire(), amount);
    out << "{\"curves\":";
    planarSketchCurves(out, sections, input.get_child("frame"));
    out << '}';
}
