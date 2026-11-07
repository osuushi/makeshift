#include "boundary-move.h"
#include "boundary-validation.h"
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <algorithm>
#include <TopoDS_Solid.hxx>

namespace boundary_move {
namespace {
TopoDS_Shape sewnFace(const TopoDS_Shape& face, const BRepBuilderAPI_Sewing& sewing,
                     const TopTools_IndexedMapOfShape& candidates) {
    auto result = face;
    if (sewing.IsModified(face)) result = sewing.Modified(face);
    if (!candidates.Contains(result) && sewing.IsModifiedSubShape(face))
        result = sewing.ModifiedSubShape(face);
    require(result.ShapeType() == TopAbs_FACE && candidates.Contains(result),
            "Cannot continue a reconstructed face through sewing");
    return result;
}
void matchEdges(Result& result, const Edit& edit, const TopTools_IndexedMapOfShape& candidates) {
    TopTools_IndexedMapOfShape assigned;
    for (const auto& source : edit.body->entities) {
        if (source.shape.ShapeType() != TopAbs_EDGE) continue;
        const auto expected = edit.edge(TopoDS::Edge(source.shape));
        TopoDS_Shape match;
        for (int i = 1; i <= candidates.Extent(); ++i) {
            if (!sameBoundary(expected, TopoDS::Edge(candidates(i)))) continue;
            require(match.IsNull(), "Ambiguous reconnected edge correspondence");
            match = candidates(i);
        }
        require(!match.IsNull() && !assigned.Contains(match),
                "Reconnection did not preserve the requested boundaries");
        assigned.Add(match);
        result.predecessors.push_back({source.id, match});
    }
    require(assigned.Extent() == candidates.Extent(), "Reconnection changed edge topology");
}
}
Result reconstruct(const Edit& edit, const std::vector<SourceEntity>& replacements) {
    BRepBuilderAPI_Sewing sewing(boundaryDistanceMm);
    std::vector<SourceEntity> expected;
    for (const auto& entity : edit.body->entities) {
        if (entity.shape.ShapeType() != TopAbs_FACE) continue;
        const auto replacement = std::find_if(replacements.begin(), replacements.end(),
            [&](const auto& r) { return r.id == entity.id; });
        const auto face = replacement == replacements.end()
            ? rebuildFace(TopoDS::Face(entity.shape), edit) : TopoDS::Face(replacement->shape);
        require(BRepCheck_Analyzer(face).IsValid(), "Reconstructed face is invalid");
        sewing.Add(face);
        expected.push_back({entity.id, face});
    }
    sewing.Perform();
    const auto shell = sewing.SewedShape();
    require(shell.ShapeType() == TopAbs_SHELL, "Reconnected faces do not form one shell");
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(shell)).Solid();
    require(BRepLib::OrientClosedSolid(solid), "Reconnected shell is not closed");
    boundary_move::valid(solid, "Boundary reconnection");
    TopTools_IndexedMapOfShape faces, edges, assigned;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    TopExp::MapShapes(solid, TopAbs_EDGE, edges);
    require(faces.Extent() == static_cast<int>(expected.size()), "Reconnection changed face topology");
    Result result{solid, {}, {edit.body->id}, {}};
    for (const auto& item : expected) {
        const auto match = sewnFace(item.shape, sewing, faces);
        require(!assigned.Contains(match), "Reconnection merged distinct faces");
        assigned.Add(match);
        result.predecessors.push_back({item.id, match});
    }
    matchEdges(result, edit, edges);
    return result;
}
}
std::vector<Result> reconnectBoundaries(const Tree& input, const std::vector<Operand>& bodies,
                                      std::vector<std::string>& participants) {
    auto edit = boundary_move::selection(input, bodies);
    bool identity = true;
    for (int row = 1; row <= 3; ++row)
        for (int column = 1; column <= 4; ++column)
            identity &= std::abs(edit.transform.Value(row, column) - (row == column ? 1.0 : 0.0)) < 1e-14;
    if (identity) {
        participants.push_back(edit.body->id);
        return {{edit.body->shape, edit.body->entities, {edit.body->id}, {}}};
    }
    if (auto prism = boundary_move::translatedPrism(edit)) {
        participants.push_back(edit.body->id);
        return {std::move(*prism)};
    }
    boundary_move::buildEdges(edit);
    auto result = boundary_move::reconstruct(edit);
    participants.push_back(edit.body->id);
    return {result};
}
