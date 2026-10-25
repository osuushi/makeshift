#include "boundary-move.h"
#include "boundary-validation.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepLib.hxx>
#include <BRep_Builder.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <Geom2d_Curve.hxx>
#include <GeomProjLib.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <gp_Lin.hxx>

namespace boundary_move {
namespace {
Handle(Geom2d_Curve) projected(const TopoDS_Edge& original, const TopoDS_Edge& moved,
                             const TopoDS_Face& source, const Handle(Geom_Surface)& surface) {
    double first, last, precision = 1e-7;
    const auto spatial = BRep_Tool::Curve(moved, first, last);
    require(!spatial.IsNull(), "Missing spatial cylindrical boundary");
    auto curve = GeomProjLib::Curve2d(spatial, first, last, surface, precision);
    require(!curve.IsNull() && std::isfinite(precision) && precision <= boundaryDistanceMm,
            "Cannot project the moved cylindrical boundary precisely");
    double oldFirst, oldLast;
    const auto old = BRep_Tool::CurveOnSurface(original, source, oldFirst, oldLast);
    require(!old.IsNull(), "Missing cylindrical boundary parameters");
    const double period = 2 * std::acos(-1);
    const double shift = period * std::round((old->Value((oldFirst + oldLast) / 2).X()
        - curve->Value((first + last) / 2).X()) / period);
    curve->Translate(gp_Vec2d(shift, 0));
    // Keep the original periodic branch, including the two sides of a seam.
    // Projection must also retain the spatial edge's parameter correspondence.
    for (int i = 0; i <= 64; ++i) {
        const double t = first + (last - first) * i / 64;
        const auto uv = curve->Value(t);
        require(surface->Value(uv.X(), uv.Y()).Distance(spatial->Value(t)) <= boundaryDistanceMm,
                "Cylindrical boundary projection exceeds tolerance");
    }
    return curve;
}
}
TopoDS_Face cylinderFace(const TopoDS_Face& source, const Edit& edit) {
    const BRepAdaptor_Surface original(source);
    if (original.GetType() != GeomAbs_Cylinder) return {};
    const auto cylinder = original.Cylinder();
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(source, TopAbs_EDGE, edges);
    for (int e = 1; e <= edges.Extent(); ++e) {
        BRepAdaptor_Curve curve(edit.edge(TopoDS::Edge(edges(e))));
        for (int i = 0; i <= 64; ++i) {
            const auto p = curve.Value(curve.FirstParameter() +
                (curve.LastParameter() - curve.FirstParameter()) * i / 64);
            if (std::abs(gp_Lin(cylinder.Axis()).Distance(p) - cylinder.Radius()) > 1e-7) return {};
        }
    }
    const Handle(Geom_Surface) surface = new Geom_CylindricalSurface(cylinder);
    BRep_Builder builder;
    TopoDS_Face result;
    builder.MakeFace(result, surface, 1e-7);
    for (int e = 1; e <= edges.Extent(); ++e) {
        auto edge = TopoDS::Edge(edges(e));
        edge.Orientation(TopAbs_FORWARD);
        auto moved = edit.edge(edge);
        const auto curve = projected(edge, moved, source, surface);
        if (BRep_Tool::IsClosed(edge, source)) {
            edge.Reverse();
            const auto other = projected(edge, moved, source, surface);
            builder.UpdateEdge(moved, curve, other, result, 1e-7);
        } else builder.UpdateEdge(moved, curve, result, 1e-7);
    }
    for (TopExp_Explorer wires(source, TopAbs_WIRE); wires.More(); wires.Next()) {
        BRepBuilderAPI_MakeWire wire;
        // Stored edge order need not be connected. MakeWire can reject a detached
        // edge, then report success after later additions while omitting that edge.
        for (BRepTools_WireExplorer edges(TopoDS::Wire(wires.Current()), source); edges.More(); edges.Next()) {
            wire.Add(edit.edge(edges.Current()));
            require(wire.IsDone(), "Cannot reconnect a cylindrical boundary edge");
        }
        require(wire.IsDone(), "Cannot reconnect the cylindrical wire");
        builder.Add(result, wire.Wire());
    }
    BRepLib::SameParameter(result, 1e-7, true);
    for (TopExp_Explorer it(result, TopAbs_EDGE); it.More(); it.Next())
        require(BRep_Tool::Tolerance(TopoDS::Edge(it.Current())) <= boundaryDistanceMm,
                "Cylindrical reconnection exceeds edge tolerance");
    for (TopExp_Explorer it(result, TopAbs_VERTEX); it.More(); it.Next())
        require(BRep_Tool::Tolerance(TopoDS::Vertex(it.Current())) <= boundaryDistanceMm,
                "Cylindrical reconnection exceeds vertex tolerance");
    return result;
}
}
