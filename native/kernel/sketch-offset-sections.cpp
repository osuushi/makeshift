#include "sketch-offset-sections.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepLib.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <vector>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <ElCLib.hxx>
#include <Geom_Circle.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
bool containsSupport(const TopoDS_Wire& wire, const gp_Circ& circle) {
    for (TopExp_Explorer it(wire, TopAbs_EDGE); it.More(); it.Next()) {
        BRepAdaptor_Curve curve(TopoDS::Edge(it.Current()));
        if (curve.GetType() == GeomAbs_Circle &&
            curve.Circle().Location().Distance(circle.Location()) < 1e-7 &&
            std::abs(curve.Circle().Radius() - circle.Radius()) < 1e-7) return true;
    }
    return false;
}
TopoDS_Wire closeSection(const TopoDS_Wire& wire, const TopoDS_Wire& source, double amount) {
    TopoDS_Vertex first, last;
    TopExp::Vertices(wire, first, last);
    if (first.IsNull() || last.IsNull()) throw std::runtime_error("Offset section has no endpoints");
    if (first.IsSame(last)) return wire;
    // Intersection joins may omit an arc when two formerly separate spans of
    // its support meet after a neck closes. Continue that exact offset support;
    // never close the section with an arbitrary chord.
    const auto a = BRep_Tool::Pnt(last), b = BRep_Tool::Pnt(first);
    TopoDS_Edge closing;
    gp_Circ chosen;
    for (TopExp_Explorer it(source, TopAbs_EDGE); it.More(); it.Next()) {
        BRepAdaptor_Curve curve(TopoDS::Edge(it.Current()));
        if (curve.GetType() != GeomAbs_Circle) continue;
        auto circle = curve.Circle();
        const double sign = circle.Axis().Direction().Z() *
            (it.Current().Orientation() == TopAbs_REVERSED ? -1 : 1);
        const double radius = circle.Radius() + amount * sign;
        if (radius <= 1e-7) continue;
        circle.SetRadius(radius);
        if (containsSupport(wire, circle)) continue;
        if (std::abs(a.Distance(circle.Location()) - radius) > 1e-7 ||
            std::abs(b.Distance(circle.Location()) - radius) > 1e-7) continue;
        if (!closing.IsNull()) {
            if (chosen.Location().Distance(circle.Location()) < 1e-7 &&
                std::abs(chosen.Radius() - radius) < 1e-7) continue;
            throw std::runtime_error("Offset section has ambiguous closing supports");
        }
        if (it.Current().Orientation() == TopAbs_REVERSED) circle.SetAxis(circle.Axis().Reversed());
        double start = ElCLib::Parameter(circle, a), end = ElCLib::Parameter(circle, b);
        while (end <= start) end += 2 * std::acos(-1.0);
        closing = BRepBuilderAPI_MakeEdge(new Geom_Circle(circle), last, first, start, end).Edge();
        chosen = circle;
    }
    if (closing.IsNull()) throw std::runtime_error("Offset could not close a surviving section");
    BRepBuilderAPI_MakeWire complete(wire);
    complete.Add(closing);
    if (!complete.IsDone()) throw std::runtime_error("Offset could not join a surviving section");
    return complete.Wire();
}
void recoverCircularIslands(std::vector<TopoDS_Wire>& sections, const TopoDS_Wire& source, double amount) {
    if (amount >= 0) return;
    const auto sourceFace = BRepBuilderAPI_MakeFace(gp_Pln(gp::XOY()), source).Face();
    for (TopExp_Explorer it(source, TopAbs_EDGE); it.More(); it.Next()) {
        BRepAdaptor_Curve curve(TopoDS::Edge(it.Current()));
        if (curve.GetType() != GeomAbs_Circle) continue;
        auto circle = curve.Circle();
        const double sign = circle.Axis().Direction().Z() *
            (it.Current().Orientation() == TopAbs_REVERSED ? -1 : 1);
        if (sign <= 0 || circle.Radius() + amount <= 1e-7) continue;
        circle.SetRadius(circle.Radius() + amount);
        if (std::any_of(sections.begin(), sections.end(), [&](const auto& wire) {
            return containsSupport(wire, circle);
        })) continue;
        const auto edge = BRepBuilderAPI_MakeEdge(circle).Edge();
        const auto wire = BRepBuilderAPI_MakeWire(edge).Wire();
        const auto point = ElCLib::Value(0, circle);
        BRepClass_FaceClassifier inside(sourceFace, point, 1e-7);
        BRepExtrema_DistShapeShape clearance(wire, source);
        // A whole omitted support survives only when its entire circumference
        // is inside the source and at least the requested distance from its boundary.
        // Positive clearance plus one interior point establishes containment.
        if (inside.State() != TopAbs_IN || !clearance.IsDone() ||
            clearance.Value() < -amount - 1e-7) continue;
        const auto island = BRepBuilderAPI_MakeFace(gp_Pln(gp::XOY()), wire).Face();
        bool independent = true;
        for (const auto& section : sections) {
            const auto face = BRepBuilderAPI_MakeFace(gp_Pln(gp::XOY()), section).Face();
            TopoDS_Vertex first, last; TopExp::Vertices(section, first, last);
            BRepExtrema_DistShapeShape gap(wire, section);
            if (!gap.IsDone() || gap.Value() <= 1e-7 || first.IsNull() ||
                BRepClass_FaceClassifier(face, point, 1e-7).State() != TopAbs_OUT ||
                BRepClass_FaceClassifier(island, BRep_Tool::Pnt(first), 1e-7).State() != TopAbs_OUT) {
                independent = false; break;
            }
        }
        if (independent) sections.push_back(wire);
    }
}

}
TopoDS_Shape closedOffsetSections(const TopoDS_Shape& offset, const TopoDS_Wire& source, double amount) {
    TopoDS_Compound result;
    BRep_Builder builder; builder.MakeCompound(result);
    std::vector<TopoDS_Wire> sections;
    for (TopExp_Explorer it(offset, TopAbs_WIRE); it.More(); it.Next())
        sections.push_back(closeSection(TopoDS::Wire(it.Current()), source, amount));
    recoverCircularIslands(sections, source, amount);
    for (const auto& wire : sections) {
        const auto face = BRepBuilderAPI_MakeFace(gp_Pln(gp::XOY()), wire).Face();
        if (!BRepCheck_Analyzer(face).IsValid()) {
            // Planar projection of offset cubics can differ from the spatial
            // curve by more than OCCT's default 1e-7 mm edge tolerance. Measure
            // the representation discrepancy, cap it at the existing offset
            // budget, and still require full validity; never move the curves.
            BRepLib::UpdateInnerTolerances(face);
            for (TopExp_Explorer it(face, TopAbs_EDGE); it.More(); it.Next())
                if (BRep_Tool::Tolerance(TopoDS::Edge(it.Current())) > geometry_policy::offsetTopologyToleranceMm)
                    throw std::runtime_error("Offset boundary tolerance exceeded");
            for (TopExp_Explorer it(face, TopAbs_VERTEX); it.More(); it.Next())
                if (BRep_Tool::Tolerance(TopoDS::Vertex(it.Current())) > geometry_policy::offsetTopologyToleranceMm)
                    throw std::runtime_error("Offset endpoint tolerance exceeded");
        }
        if (!BRepCheck_Analyzer(face).IsValid())
            throw std::runtime_error("Offset section is not a valid closed boundary");
        builder.Add(result, wire);
    }
    if (sections.empty()) throw std::runtime_error("Offset collapses the loop; try a smaller distance");
    return result;
}
