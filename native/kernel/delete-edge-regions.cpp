#include "delete-edge-regions.h"
#include "boundary-move.h"
#include "boundary-validation.h"
#include "offset-repair.h"
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRep_Tool.hxx>
#include <ShapeAnalysis_FreeBounds.hxx>
#include <TopTools_HSequenceOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS_Solid.hxx>
#include <algorithm>
#include <numeric>

namespace {
using boundary_move::require;
using Region = TopTools_IndexedMapOfShape;

std::vector<Region> regions(const TopoDS_Shape& shape, const TopTools_MapOfShape& selected) {
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(shape, TopAbs_FACE, faces);
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndUniqueAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    std::vector<int> group(faces.Extent() + 1);
    std::iota(group.begin(), group.end(), 0);
    std::vector<bool> touched(group.size(), false);
    for (TopTools_MapOfShape::Iterator it(selected); it.More(); it.Next()) {
        require(adjacency.Contains(it.Key()), "Deletion edge no longer exists");
        const auto& neighbors = adjacency.FindFromKey(it.Key());
        require(neighbors.Extent() == 2, "Select an edge between two distinct faces");
        const int a = faces.FindIndex(neighbors.First()), b = faces.FindIndex(neighbors.Last());
        touched[a] = touched[b] = true;
        const int from = group[b], to = group[a];
        for (auto& id : group) if (id == from) id = to;
    }
    std::vector<Region> result;
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (!touched[i]) continue;
        Region region;
        for (int j = i; j <= faces.Extent(); ++j)
            if (touched[j] && group[j] == group[i]) {
                region.Add(faces(j));
                touched[j] = false;
            }
        result.push_back(region);
    }
    return result;
}

std::vector<TopoDS_Wire> boundaryLoops(const Region& region) {
    TopTools_IndexedMapOfShape edges;
    std::vector<int> uses;
    for (int i = 1; i <= region.Extent(); ++i)
        for (TopExp_Explorer it(region(i), TopAbs_EDGE); it.More(); it.Next()) {
            const int index = edges.Add(it.Current());
            if (index > static_cast<int>(uses.size())) uses.push_back(0);
            ++uses[index - 1];
        }
    Handle(TopTools_HSequenceOfShape) boundary = new TopTools_HSequenceOfShape;
    for (int i = 1; i <= edges.Extent(); ++i) {
        require(uses[i - 1] <= 2, "Deletion region has a nonmanifold boundary");
        if (uses[i - 1] == 1) boundary->Append(edges(i));
    }
    require(!boundary->IsEmpty(), "Deletion must leave a boundary to reconnect");
    Handle(TopTools_HSequenceOfShape) wires = new TopTools_HSequenceOfShape;
    ShapeAnalysis_FreeBounds::ConnectEdgesToWires(boundary, 1e-7, true, wires);
    std::vector<TopoDS_Wire> result;
    for (int i = 1; i <= wires->Length(); ++i) {
        require(BRep_Tool::IsClosed(wires->Value(i)), "Deletion boundary is not a closed loop");
        result.push_back(TopoDS::Wire(wires->Value(i)));
    }
    require(result.size() == 2, "Edge deletion needs two surviving closed boundary loops to loft");
    return result;
}

TopoDS_Shape replacement(const Region& region, TopTools_IndexedMapOfShape& retainedEdges) {
    const auto loops = boundaryLoops(region);
    BRepOffsetAPI_ThruSections loft(false, true, 1e-7);
    loft.SetMutableInput(false);
    for (const auto& loop : loops) {
        TopExp::MapShapes(loop, TopAbs_EDGE, retainedEdges);
        loft.AddWire(loop);
    }
    loft.Build();
    require(loft.IsDone(), "Cannot loft between the surviving boundaries");
    return loft.Shape();
}

Result sew(const Operand& body, const TopTools_MapOfShape& removed,
           const std::vector<TopoDS_Shape>& patches, TopTools_IndexedMapOfShape retainedEdges) {
    BRepBuilderAPI_Sewing sewing(geometry_policy::boundaryDistanceMm);
    for (TopExp_Explorer it(body.shape, TopAbs_FACE); it.More(); it.Next()) {
        if (removed.Contains(it.Current())) continue;
        sewing.Add(it.Current());
        TopExp::MapShapes(it.Current(), TopAbs_EDGE, retainedEdges);
    }
    for (const auto& patch : patches) sewing.Add(patch);
    sewing.Perform();
    const auto shell = sewing.SewedShape();
    require(shell.ShapeType() == TopAbs_SHELL && BRep_Tool::IsClosed(shell),
            "Reconnected deletion must form one closed shell");
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(shell)).Solid();
    require(BRepLib::OrientClosedSolid(solid), "Cannot orient the reconnected solid");
    offset_geometry::tightenGeneratedBoundaries(solid, body.shape, false);
    boundary_move::valid(solid, "Edge deletion");
    TopTools_IndexedMapOfShape faces, edges, assigned, assignedSources, current;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    TopExp::MapShapes(solid, TopAbs_EDGE, edges);
    TopExp::MapShapes(body.shape, current);
    Result result{solid, {}, {body.id}};
    for (const auto& source : body.entities) {
        // Cleanup/healing histories include old shapes as well as their current
        // successors. Only current topology participates in this reconstruction.
        if (!current.Contains(source.shape)) continue;
        if (source.shape.ShapeType() == TopAbs_FACE) {
            if (removed.Contains(source.shape)) continue;
            auto next = source.shape;
            if (sewing.IsModified(next)) next = sewing.Modified(next);
            require(faces.Contains(next), "Deletion lost an unaffected face");
            next = faces(faces.FindIndex(next));
            require(current(current.FindIndex(source.shape)).Orientation() == next.Orientation(),
                    "Deletion inverted an unaffected face");
            result.predecessors.push_back({source.id, next});
        } else if (source.shape.ShapeType() == TopAbs_EDGE && retainedEdges.Contains(source.shape)) {
            TopoDS_Shape match;
            for (int i = 1; i <= edges.Extent(); ++i)
                if (boundary_move::sameBoundary(TopoDS::Edge(source.shape), TopoDS::Edge(edges(i)))) {
                    require(match.IsNull(), "Ambiguous surviving deletion boundary");
                    match = edges(i);
                }
            require(!match.IsNull(), "Deletion changed a surviving boundary");
            const int previous = assigned.FindIndex(match);
            require(!previous || assignedSources(previous).IsSame(source.shape),
                    "Deletion merged distinct surviving boundaries");
            if (!previous) {
                assigned.Add(match);
                assignedSources.Add(source.shape);
            }
            result.predecessors.push_back({source.id, match});
        }
    }
    return result;
}
}

Result reconnectDeletedEdges(const Operand& body, const TopTools_MapOfShape& selected) {
    TopTools_MapOfShape removed;
    TopTools_IndexedMapOfShape retainedEdges;
    std::vector<TopoDS_Shape> patches;
    for (const auto& region : regions(body.shape, selected)) {
        patches.push_back(replacement(region, retainedEdges));
        for (int i = 1; i <= region.Extent(); ++i) removed.Add(region(i));
    }
    return sew(body, removed, patches, retainedEdges);
}
