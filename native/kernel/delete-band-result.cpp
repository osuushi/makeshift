#include "delete-band.h"
#include "boundary-validation.h"
#include "offset-geometry.h"
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <BRep_Tool.hxx>
#include <TopoDS_Solid.hxx>
#include <algorithm>

namespace delete_band {
using boundary_move::require;
Result rebuild(const Operand& body, const Band& band, const boundary_move::Edit& edit,
               const TopoDS_Face& shelf) {
    BRepBuilderAPI_Sewing sewing(boundary_move::boundaryDistanceMm);
    std::vector<SourceEntity> expected;
    TopTools_IndexedMapOfShape survivingEdges;
    for (const auto& source : body.entities) {
        if (source.shape.ShapeType() != TopAbs_FACE || band.selected.Contains(source.shape)) continue;
        const auto original = TopoDS::Face(source.shape);
        const auto face = boundary_move::rebuildFace(original, edit);
        require(BRepCheck_Analyzer(face).IsValid(), "Rebuilt transition neighbor is invalid");
        if (edit.affected(original))
            offset_geometry::checkParallel(original, face, 0, "Delete transition");
        sewing.Add(face);
        expected.push_back({source.id, face});
        TopExp::MapShapes(original, TopAbs_EDGE, survivingEdges);
    }
    sewing.Add(shelf);
    sewing.Perform();
    const auto shell = sewing.SewedShape();
    require(shell.ShapeType() == TopAbs_SHELL && BRep_Tool::IsClosed(shell),
            "Transition shelf must reconnect one closed shell");
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(shell)).Solid();
    require(BRepLib::OrientClosedSolid(solid), "Transition shelf cannot orient a closed solid");
    boundary_move::valid(solid, "Delete transition");
    TopTools_IndexedMapOfShape faces, edges, assigned;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    TopExp::MapShapes(solid, TopAbs_EDGE, edges);
    require(faces.Extent() == static_cast<int>(expected.size()) + 1,
            "Transition replacement changed unrelated face topology");
    Result result{solid, {}, {body.id}, {}};
    for (const auto& source : expected) {
        auto match = sewing.IsModified(source.shape) ? sewing.Modified(source.shape) : source.shape;
        if (!faces.Contains(match) && sewing.IsModifiedSubShape(source.shape))
            match = sewing.ModifiedSubShape(source.shape);
        require(faces.Contains(match) && !assigned.Contains(match), "Transition lost a surviving face");
        // Sewing history retains pre-solid orientations. Check the occurrence
        // in the oriented final solid, not that earlier shell occurrence.
        match = faces(faces.FindIndex(match));
        assigned.Add(match);
        const auto original = std::find_if(body.entities.begin(), body.entities.end(),
            [&](const auto& entity) { return entity.id == source.id; });
        if (edit.affected(original->shape))
            offset_geometry::checkParallel(TopoDS::Face(original->shape), TopoDS::Face(match),
                                           0, "Delete transition", true);
        result.predecessors.push_back({source.id, match});
    }
    assigned.Clear();
    for (const auto& source : body.entities) {
        if (source.shape.ShapeType() != TopAbs_EDGE || !survivingEdges.Contains(source.shape)) continue;
        const auto expectedEdge = edit.edge(TopoDS::Edge(source.shape));
        TopoDS_Shape match;
        for (int i = 1; i <= edges.Extent(); ++i) {
            if (!boundary_move::sameBoundary(expectedEdge, TopoDS::Edge(edges(i)))) continue;
            require(match.IsNull(), "Ambiguous transition edge correspondence");
            match = edges(i);
        }
        require(!match.IsNull() && !assigned.Contains(match), "Transition lost a surviving boundary");
        assigned.Add(match);
        result.predecessors.push_back({source.id, match});
    }
    require(assigned.Extent() == edges.Extent(), "Transition introduced an unexplained boundary");
    return result;
}
}
