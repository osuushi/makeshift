#include "delete-band.h"
#include "boundary-validation.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_Circle.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <gp_Cylinder.hxx>

namespace delete_band {
using boundary_move::require;
namespace {
gp_Pnt project(const gp_Pnt& point, const gp_Pln& plane) {
    const gp_Vec normal(plane.Axis().Direction());
    return point.Translated(normal * -gp_Vec(plane.Location(), point).Dot(normal));
}
void supported(const TopoDS_Face& face, const gp_Pln& plane) {
    const BRepAdaptor_Surface surface(face);
    const auto normal = plane.Axis().Direction();
    const bool planar = surface.GetType() == GeomAbs_Plane &&
        surface.Plane().Axis().Direction().IsNormal(normal, 1e-9);
    const bool cylinder = surface.GetType() == GeomAbs_Cylinder &&
        surface.Cylinder().Axis().Direction().IsParallel(normal, 1e-9);
    require(planar || cylinder, "Transition neighbors must continue along the replacement plane normal");
}
TopoDS_Edge rim(const TopoDS_Edge& edge, const TopoDS_Face& neighbor, const gp_Pln& plane) {
    BRepAdaptor_Curve curve(edge);
    const auto p = project(curve.Value(curve.FirstParameter()), plane);
    const auto q = project(curve.Value(curve.LastParameter()), plane);
    const BRepAdaptor_Surface surface(neighbor);
    if (surface.GetType() == GeomAbs_Plane) {
        require(p.Distance(q) > 1e-7, "Transition boundary collapses on the replacement plane");
        return BRepBuilderAPI_MakeEdge(p, q).Edge();
    }
    const auto cylinder = surface.Cylinder();
    const auto center = project(cylinder.Location(), plane);
    const auto middle = project(curve.Value((curve.FirstParameter() + curve.LastParameter()) / 2), plane);
    if (BRep_Tool::IsClosed(edge)) {
        gp_Vec tangent;
        gp_Pnt point;
        curve.D1(curve.FirstParameter(), point, tangent);
        const gp_Vec radius(center, p);
        auto axis = cylinder.Axis().Direction();
        if (radius.Crossed(tangent).Dot(gp_Vec(axis)) < 0) axis.Reverse();
        const gp_Circ circle(gp_Ax2(center, axis, gp_Dir(radius)), cylinder.Radius());
        return BRepBuilderAPI_MakeEdge(circle).Edge();
    }
    GC_MakeArcOfCircle arc(p, middle, q);
    require(arc.IsDone(), "Cannot intersect the cylindrical transition boundary");
    return BRepBuilderAPI_MakeEdge(arc.Value()).Edge();
}
}
TopoDS_Wire mappedWire(const TopoDS_Wire& source, const boundary_move::Edit& edit) {
    BRepBuilderAPI_MakeWire result;
    for (BRepTools_WireExplorer e(source); e.More(); e.Next()) {
        result.Add(edit.edge(e.Current()));
        require(result.IsDone(), "Projected transition loop is disconnected");
    }
    return result.Wire();
}
boundary_move::Edit flatten(const Operand& body, const Band& band, int anchor) {
    boundary_move::Edit edit;
    edit.body = &body;
    const auto plane = *band.planes[anchor];
    TopTools_IndexedMapOfShape moving;
    TopExp::MapShapes(band.loops[1 - anchor], TopAbs_EDGE, moving);
    TopExp::MapShapes(band.loops[1 - anchor], TopAbs_VERTEX, edit.movedVertices);
    TopTools_IndexedDataMapOfShapeListOfShape adjacent;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacent);
    TopExp::MapShapes(body.shape, TopAbs_EDGE, edit.sourceEdges);
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i) {
        auto source = TopoDS::Edge(edit.sourceEdges(i));
        source.Orientation(TopAbs_FORWARD);
        TopoDS_Face neighbor;
        for (const auto& face : adjacent.FindFromKey(source)) {
            if (band.selected.Contains(face)) continue;
            if (edit.affected(source)) supported(TopoDS::Face(face), plane);
            neighbor = TopoDS::Face(face);
        }
        if (moving.Contains(source)) {
            require(!neighbor.IsNull(), "Transition rim has no surviving neighbor");
            edit.edges.push_back(rim(source, neighbor, plane));
        } else if (edit.affected(source) && !neighbor.IsNull()) {
            require(BRepAdaptor_Curve(source).GetType() == GeomAbs_Line,
                    "Transition would change a nonstraight neighboring boundary");
            TopoDS_Vertex a, b;
            TopExp::Vertices(source, a, b);
            const auto oldA = BRep_Tool::Pnt(a), oldB = BRep_Tool::Pnt(b);
            const auto p = edit.movedVertices.Contains(a) ? project(oldA, plane) : oldA;
            const auto q = edit.movedVertices.Contains(b) ? project(oldB, plane) : oldB;
            require(gp_Vec(oldA, oldB).Dot(gp_Vec(p, q)) > 1e-12,
                    "Transition would consume a neighboring wall");
            edit.edges.push_back(BRepBuilderAPI_MakeEdge(p, q).Edge());
        } else edit.edges.push_back(TopoDS::Edge(BRepBuilderAPI_Copy(source).Shape()));
    }
    return edit;
}
}
