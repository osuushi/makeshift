#include "delete-band.h"
#include "boundary-validation.h"
#include <BRepBuilderAPI_FindPlane.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRep_Tool.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopoDS_Compound.hxx>
#include <BRep_Builder.hxx>
#include <Geom_Plane.hxx>

namespace delete_band {
using boundary_move::require;
namespace {
std::vector<TopoDS_Wire> loops(const TopTools_IndexedMapOfShape& boundary) {
    TopTools_IndexedDataMapOfShapeListOfShape vertices;
    TopoDS_Compound compound;
    BRep_Builder builder;
    builder.MakeCompound(compound);
    for (int i = 1; i <= boundary.Extent(); ++i) builder.Add(compound, boundary(i));
    TopExp::MapShapesAndAncestors(compound, TopAbs_VERTEX, TopAbs_EDGE, vertices);
    for (int i = 1; i <= vertices.Extent(); ++i)
        require(vertices.FindFromIndex(i).Size() == 2, "Transition boundary must be closed and unbranched");
    TopTools_MapOfShape used;
    std::vector<TopoDS_Wire> result;
    for (int i = 1; i <= boundary.Extent(); ++i) {
        if (used.Contains(boundary(i))) continue;
        BRepBuilderAPI_MakeWire wire;
        std::vector<TopoDS_Shape> pending{boundary(i)};
        for (size_t j = 0; j < pending.size(); ++j) {
            const auto edge = pending[j];
            if (!used.Add(edge)) continue;
            wire.Add(TopoDS::Edge(edge));
            require(wire.IsDone(), "Transition boundary cannot form a wire");
            for (TopExp_Explorer v(edge, TopAbs_VERTEX); v.More(); v.Next())
                for (const auto& next : vertices.FindFromKey(v.Current()))
                    if (!used.Contains(next)) pending.push_back(next);
        }
        require(BRep_Tool::IsClosed(wire.Wire()), "Transition boundary is open");
        result.push_back(wire.Wire());
    }
    require(result.size() == 2, "Select a complete transition band with two boundary loops");
    return result;
}
}
Band inspect(const Operand& body, const std::vector<SourceEntity>& selected) {
    Band band;
    require(!selected.empty(), "Select transition faces");
    for (const auto& source : selected) band.selected.Add(source.shape);
    TopTools_IndexedMapOfShape vertices, edges;
    int faceEuler = 0;
    for (const auto& source : selected) {
        TopExp::MapShapes(source.shape, TopAbs_VERTEX, vertices);
        TopExp::MapShapes(source.shape, TopAbs_EDGE, edges);
        faceEuler += 2 - boundary_move::count(source.shape, TopAbs_WIRE);
    }
    require(vertices.Extent() - edges.Extent() + faceEuler == 0,
            "Selected transition must be an annular band");
    TopTools_IndexedDataMapOfShapeListOfShape adjacent;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacent);
    TopTools_IndexedMapOfShape boundary, connected;
    connected.Add(selected.front().shape);
    for (int cursor = 1; cursor <= connected.Extent(); ++cursor)
        for (TopExp_Explorer e(connected(cursor), TopAbs_EDGE); e.More(); e.Next())
            for (const auto& f : adjacent.FindFromKey(e.Current()))
                if (band.selected.Contains(f)) connected.Add(f);
    require(connected.Extent() == band.selected.Extent(), "Select one connected transition band");
    for (int i = 1; i <= adjacent.Extent(); ++i) {
        int inside = 0, outside = 0;
        for (const auto& face : adjacent.FindFromIndex(i))
            (band.selected.Contains(face) ? inside : outside)++;
        if (!inside || !outside) continue;
        require(inside == 1 && outside == 1, "Transition boundary is nonmanifold");
        boundary.Add(adjacent.FindKey(i));
    }
    band.loops = loops(boundary);
    for (const auto& wire : band.loops) {
        BRepBuilderAPI_FindPlane plane(wire, 1e-7);
        band.planes.push_back(plane.Found() ? std::optional<gp_Pln>(plane.Plane()->Pln()) : std::nullopt);
    }
    require(band.planes[0] || band.planes[1], "Transition needs a planar boundary loop");
    if (band.planes[0] && band.planes[1]) {
        require(band.planes[0]->Axis().Direction().IsParallel(band.planes[1]->Axis().Direction(), 1e-9),
                "Planar transition boundaries must be parallel");
        require(band.planes[0]->Distance(band.planes[1]->Location()) > boundary_move::boundaryDistanceMm,
                "Transition boundaries are already coplanar");
    }
    return band;
}
}
