#include "boundary-move.h"
#include "boundary-validation.h"
#include "scale-transform.h"
#include "offset-repair.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepFill.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <gp_Pln.hxx>
#include <GeomProjLib.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Wire.hxx>

namespace boundary_move {
namespace {
std::vector<TopoDS_Edge> boundary(const TopoDS_Wire& wire, const TopoDS_Face& face, const Edit& edit) {
    std::vector<TopoDS_Edge> result;
    for (BRepTools_WireExplorer it(wire, face); it.More(); it.Next())
        result.push_back(edit.edge(it.Current()));
    return result;
}
TopoDS_Wire wire(const std::vector<TopoDS_Edge>& edges) {
    BRepBuilderAPI_MakeWire builder;
    for (const auto& edge : edges) builder.Add(edge);
    require(builder.IsDone(), "Moved boundary does not form a connected wire");
    return builder.Wire();
}
TopoDS_Face band(const TopoDS_Face& face, const Edit& edit) {
    std::vector<TopoDS_Edge> boundaries;
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(face, TopAbs_EDGE, edges);
    bool seam = false;
    for (int i = 1; i <= edges.Extent(); ++i) {
        auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::IsClosed(edge, face)) { seam = true; continue; }
        if (!BRep_Tool::IsClosed(edge)) return {};
        edge.Orientation(TopAbs_FORWARD);
        boundaries.push_back(edit.edge(edge));
    }
    if (!seam || boundaries.size() != 2) return {};
    if (edit.transform.Form() == gp_Other) {
        // Match GTransform's rational conic parameterization on both rims.
        // Mixing analytic and rational parameters twists the intermediate sections.
        for (auto& edge : boundaries)
            edge = TopoDS::Edge(BRepBuilderAPI_NurbsConvert(edge, true).Shape());
    }
    // The original parameter directions define correspondence, not nearest points
    // after movement. This also works when either closed boundary is no longer circular.
    return BRepFill::Face(boundaries[0], boundaries[1]);
}
TopoDS_Face trimRuled(const TopoDS_Face& face, const std::vector<TopoDS_Edge>& edges) {
    const auto surface = BRep_Tool::Surface(face);
    BRepBuilderAPI_MakeWire outline;
    for (const auto& edge : edges) {
        double first, last, precision = 1e-7;
        const auto curve = BRep_Tool::Curve(edge, first, last);
        const auto pcurve = GeomProjLib::Curve2d(curve, first, last, surface, precision);
        require(!pcurve.IsNull() && std::isfinite(precision) && precision <= boundaryDistanceMm,
                "Cannot trim the ruled surface within boundary tolerance");
        BRep_Builder().UpdateEdge(edge, pcurve, face, 1e-7);
        outline.Add(edge);
    }
    require(outline.IsDone(), "Cannot connect the ruled surface boundary");
    BRepBuilderAPI_MakeFace trimmed(surface, outline.Wire(), true);
    require(trimmed.IsDone(), "Cannot trim the ruled surface");
    return trimmed.Face();
}
TopoDS_Face ruledQuad(const TopoDS_Face& source, const std::vector<TopoDS_Edge>& edges) {
    // A narrow warped strip can have exact ruled boundaries even when a plate
    // approximation would need loose endpoint bounds. Verify every boundary.
    if (edges.size() != 4) return {};
    for (int start = 0; start < 2; ++start) {
        const auto opposite = TopoDS::Edge(edges[start + 2].Reversed());
        const auto result = BRepFill::Face(edges[start], opposite);
        TopTools_IndexedMapOfShape generated, assigned;
        TopExp::MapShapes(result, TopAbs_EDGE, generated);
        if (generated.Extent() != 4) continue;
        bool matches = true;
        for (const auto& edge : edges) {
            int match = 0;
            for (int i = 1; i <= generated.Extent(); ++i)
                if (sameBoundary(edge, TopoDS::Edge(generated(i)))) {
                    if (match) { matches = false; break; }
                    match = i;
                }
            if (!match || assigned.Contains(generated(match))) { matches = false; break; }
            assigned.Add(generated(match));
        }
        if (!matches) continue;
        // Keep requested analytic edges; the generator's isocurves can be
        // geometrically straight B-splines, which would lose ordinary line edits.
        const auto trimmed = trimRuled(result, edges);
        offset_geometry::tightenGeneratedBoundaries(trimmed, source, false);
        return trimmed;
    }
    return {};
}
bool onPlane(const gp_Pln& plane, const std::vector<TopoDS_Edge>& edges) {
    for (const auto& edge : edges) {
        BRepAdaptor_Curve curve(edge);
        for (int i = 0; i <= 32; ++i) {
            const double t = curve.FirstParameter() + (curve.LastParameter() - curve.FirstParameter()) * i / 32;
            if (plane.Distance(curve.Value(t)) > 1e-7) return false;
        }
    }
    return true;
}
}
TopoDS_Face rebuildFace(const TopoDS_Face& source, const Edit& edit) {
    if (edit.rigidFaces.Contains(source))
        return TopoDS::Face(affineShape(source, edit.transform));
    if (!edit.affected(source)) return TopoDS::Face(BRepBuilderAPI_Copy(source).Shape());
    auto face = source;
    face.Orientation(TopAbs_FORWARD);
    const auto cylindrical = cylinderFace(face, edit);
    if (!cylindrical.IsNull()) return cylindrical;
    const auto ruled = band(face, edit);
    if (!ruled.IsNull()) return ruled;
    const auto outer = BRepTools::OuterWire(face);
    const auto edges = boundary(outer, face, edit);
    std::vector<TopoDS_Wire> holes;
    std::vector<TopoDS_Edge> allEdges = edges;
    for (TopExp_Explorer it(face, TopAbs_WIRE); it.More(); it.Next()) {
        if (it.Current().IsSame(outer)) continue;
        const auto inner = boundary(TopoDS::Wire(it.Current()), face, edit);
        holes.push_back(wire(inner));
        allEdges.insert(allEdges.end(), inner.begin(), inner.end());
    }
    const auto outline = wire(edges);
    const BRepAdaptor_Surface original(face);
    BRepBuilderAPI_MakeFace planar;
    if (original.GetType() == GeomAbs_Plane && onPlane(original.Plane(), allEdges))
        planar = BRepBuilderAPI_MakeFace(original.Plane(), outline, true);
    else
        planar = BRepBuilderAPI_MakeFace(outline, true);
    if (planar.IsDone()) {
        const auto support = BRepAdaptor_Surface(planar.Face()).Plane();
        if (onPlane(support, allEdges)) {
            for (const auto& hole : holes) planar.Add(hole);
            require(planar.IsDone(), "Cannot trim the reconnected planar face");
            return planar.Face();
        }
    }
    if (holes.empty()) {
        const auto cubic = polynomialQuad(face, edges);
        if (!cubic.IsNull()) return cubic;
        const auto ruled = ruledQuad(face, edges);
        if (!ruled.IsNull()) return ruled;
    }
    return fillFace(face, edges, holes);
}
}
