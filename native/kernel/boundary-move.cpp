#include "boundary-move.h"
#include "boundary-validation.h"
#include "timing.h"
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <algorithm>
#include <map>
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
// Every face in this reconstruction has a one-to-one successor. Only edges
// between the same continued faces can correspond. Include repeated face
// uses so periodic seams stay distinct from open or internal boundaries.
std::vector<int> incidentFaces(const TopTools_ListOfShape& neighbors,
                               const TopTools_IndexedMapOfShape& faceOrder) {
    std::vector<int> indices;
    for (const auto& face : neighbors) {
        const int i = faceOrder.FindIndex(face);
        require(i != 0, "Cannot identify a reconnected edge's incident face");
        indices.push_back(i);
    }
    std::sort(indices.begin(), indices.end());
    return indices;
}
void matchEdges(Result& result, const Edit& edit, const TopTools_IndexedMapOfShape& sourceFaces,
                const TopTools_IndexedMapOfShape& sewnFaces) {
    TopTools_IndexedDataMapOfShapeListOfShape before, after;
    TopExp::MapShapesAndAncestors(edit.body->shape, TopAbs_EDGE, TopAbs_FACE, before);
    TopExp::MapShapesAndAncestors(result.shape, TopAbs_EDGE, TopAbs_FACE, after);
    std::map<std::vector<int>, std::vector<TopoDS_Edge>> candidates;
    for (int i = 1; i <= after.Extent(); ++i)
        candidates[incidentFaces(after.FindFromIndex(i), sewnFaces)].push_back(TopoDS::Edge(after.FindKey(i)));
    TopTools_IndexedMapOfShape assigned;
    for (const auto& source : edit.body->entities) {
        if (source.shape.ShapeType() != TopAbs_EDGE) continue;
        const auto expected = edit.edge(TopoDS::Edge(source.shape));
        TopoDS_Shape match;
        const auto key = incidentFaces(before.FindFromKey(source.shape), sourceFaces);
        const auto group = candidates.find(key);
        require(group != candidates.end(), "Reconnection changed edge adjacency");
        for (const auto& candidate : group->second) {
            if (!sameBoundary(expected, candidate)) continue;
            require(match.IsNull(), "Ambiguous reconnected edge correspondence");
            match = candidate;
        }
        require(!match.IsNull() && !assigned.Contains(match),
                "Reconnection did not preserve the requested boundaries");
        assigned.Add(match);
        result.predecessors.push_back({source.id, match});
    }
    require(assigned.Extent() == after.Extent(), "Reconnection changed edge topology");
}
}
Result reconstruct(const Edit& edit, const std::vector<SourceEntity>& replacements, const SolidValidator& validateSolid) {
    KernelTiming timing("boundary-reconnection");
    BRepBuilderAPI_Sewing sewing(boundaryDistanceMm);
    std::vector<SourceEntity> expected;
    TopTools_IndexedMapOfShape sourceFaces;
    for (const auto& entity : edit.body->entities) {
        if (entity.shape.ShapeType() != TopAbs_FACE) continue;
        const auto replacement = std::find_if(replacements.begin(), replacements.end(),
            [&](const auto& r) { return r.id == entity.id; });
        const auto face = replacement == replacements.end()
            ? rebuildFace(TopoDS::Face(entity.shape), edit) : TopoDS::Face(replacement->shape);
        require(BRepCheck_Analyzer(face).IsValid(), "Reconstructed face is invalid");
        sewing.Add(face);
        expected.push_back({entity.id, face});
        sourceFaces.Add(entity.shape);
    }
    timing.phase("faces");
    sewing.Perform();
    timing.phase("sew");
    const auto shell = sewing.SewedShape();
    require(shell.ShapeType() == TopAbs_SHELL, "Reconnected faces do not form one shell");
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(shell)).Solid();
    require(BRepLib::OrientClosedSolid(solid), "Reconnected shell is not closed");
    // Offset checks every boundary, tolerance, orientation and intersection on
    // this same sewn solid. Run its stricter validator once when requested.
    (validateSolid ? validateSolid : valid)(solid, "Boundary reconnection");
    timing.phase("validate");
    TopTools_IndexedMapOfShape faces, assigned;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    require(faces.Extent() == static_cast<int>(expected.size()), "Reconnection changed face topology");
    Result result{solid, {}, {edit.body->id}, {}};
    for (const auto& item : expected) {
        const auto match = sewnFace(item.shape, sewing, faces);
        require(!assigned.Contains(match), "Reconnection merged distinct faces");
        assigned.Add(match);
        result.predecessors.push_back({item.id, match});
    }
    matchEdges(result, edit, sourceFaces, assigned);
    timing.phase("correspondence");
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
