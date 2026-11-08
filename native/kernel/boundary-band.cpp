#include "boundary-move.h"
#include "boundary-validation.h"
#include "offset-repair.h"
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepFill.hxx>
#include <BRepLib.hxx>
#include <BRepLib_CheckCurveOnSurface.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Geom2d_Curve.hxx>
#include <GeomProjLib.hxx>

namespace boundary_move {
namespace {
Handle(Geom2d_Curve) projected(const TopoDS_Edge& edge, const Handle(Geom_Surface)& support) {
    double first, last, precision = 1e-7;
    const auto spatial = BRep_Tool::Curve(edge, first, last);
    auto result = GeomProjLib::Curve2d(spatial, first, last, support, precision);
    require(!result.IsNull() && std::isfinite(precision) && precision <= boundaryDistanceMm,
            "Cannot reconnect the periodic boundary within tolerance");
    return result;
}
TopoDS_Face trimBand(const TopoDS_Face& source, const TopoDS_Face& band,
                    const TopoDS_Edge& firstRim, const Edit& edit) {
    const auto support = BRep_Tool::Surface(band);
    TopoDS_Face result;
    BRep_Builder builder;
    builder.MakeFace(result, support, 1e-7);
    double u0, u1, v0, v1;
    BRepTools::UVBounds(band, u0, u1, v0, v1);
    const auto outer = BRepTools::OuterWire(source);
    std::vector<TopoDS_Edge> ordered;
    size_t first = 0;
    for (BRepTools_WireExplorer it(outer, source); it.More(); it.Next()) {
        if (it.Current().IsSame(firstRim)) first = ordered.size();
        ordered.push_back(it.Current());
    }
    // Walk from the first rim. Its following seam chain lies at Umax; the
    // return chain after the other rim lies at Umin, regardless of wire start.
    bool high = true;
    TopTools_IndexedMapOfShape seams;
    std::vector<Handle(Geom2d_Curve)> forward, reversed;
    for (size_t step = 1; step <= ordered.size(); ++step) {
        const auto original = ordered[(first + step) % ordered.size()];
        auto edge = edit.edge(original);
        if (!BRep_Tool::IsClosed(original, source)) {
            high = false;
            const auto pcurve = projected(edge, support);
            builder.UpdateEdge(edge, pcurve, result, 1e-7);
            continue;
        }
        int index = seams.FindIndex(original);
        if (!index) {
            index = seams.Add(original);
            forward.push_back({}); reversed.push_back({});
        }
        auto pcurve = projected(edge, support);
        double a, b; BRep_Tool::Range(edge, a, b);
        pcurve->Translate(gp_Vec2d((high ? u1 : u0) - pcurve->Value((a + b) / 2).X(), 0));
        (original.Orientation() == TopAbs_FORWARD ? forward : reversed)[index - 1] = pcurve;
    }
    for (int i = 1; i <= seams.Extent(); ++i) {
        require(!forward[i - 1].IsNull() && !reversed[i - 1].IsNull(),
                "Periodic seam must retain both boundary uses");
        builder.UpdateEdge(edit.edge(TopoDS::Edge(seams(i))), forward[i - 1], reversed[i - 1], result, 1e-7);
    }
    BRepBuilderAPI_MakeWire wire;
    for (const auto& edge : ordered) {
        wire.Add(edit.edge(edge));
        require(wire.IsDone(), "Cannot connect the periodic boundary");
    }
    builder.Add(result, wire.Wire());
    BRepLib::SameParameter(result, 1e-7, true);
    for (TopExp_Explorer it(result, TopAbs_EDGE); it.More(); it.Next()) {
        const auto edge = TopoDS::Edge(it.Current());
        BRepLib_CheckCurveOnSurface check(edge, result);
        check.Perform();
        require(check.IsDone() && std::isfinite(check.MaxDistance()) &&
                check.MaxDistance() <= boundaryDistanceMm && BRep_Tool::Tolerance(edge) <= boundaryDistanceMm,
                "Periodic reconnection does not meet its boundary within tolerance");
    }
    offset_geometry::tightenGeneratedBoundaries(result, source, false);
    return result;
}
}
TopoDS_Face periodicBand(const TopoDS_Face& face, const Edit& edit) {
    std::vector<TopoDS_Edge> boundaries;
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(face, TopAbs_EDGE, edges);
    int seams = 0;
    TopoDS_Edge firstRim;
    for (int i = 1; i <= edges.Extent(); ++i) {
        auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::IsClosed(edge, face)) { ++seams; continue; }
        if (!BRep_Tool::IsClosed(edge)) return {};
        if (boundaries.empty()) firstRim = edge;
        // Opposite wire traversals must become aligned spatial directions.
        // Analytic and spline rims can have opposite natural parameterizations.
        else edge.Reverse();
        boundaries.push_back(edit.edge(edge));
    }
    if (!seams || boundaries.size() != 2) return {};
    if (edit.transform.Form() == gp_Other)
        for (auto& edge : boundaries)
            edge = TopoDS::Edge(BRepBuilderAPI_NurbsConvert(edge, true).Shape());
    const auto result = BRepFill::Face(boundaries[0], boundaries[1]);
    // A segmented seam carries real topology identities and stationary vertices.
    // Preserve its requested curves instead of replacing it with one generator.
    return seams > 1 ? trimBand(face, result, firstRim, edit) : result;
}
}
