#include "planar-face-offset.h"
#include "conical-cap-offset.h"
#include "boundary-move.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Surface.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <TopExp_Explorer.hxx>
#include <algorithm>

std::optional<Result> planarFaceOffset(const Operand& body,
        const std::vector<TopoDS_Face>& faces, double distance) {
    if (auto conical = conicalCapOffset(body, faces, distance)) return conical;
    if (faces.size() != 1) return std::nullopt;
    BRepAdaptor_Surface surface(faces.front());
    if (surface.GetType() != GeomAbs_Plane) return std::nullopt;
    const auto plane = surface.Plane();
    auto normal = gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection()));
    if (faces.front().Orientation() == TopAbs_REVERSED) normal.Reverse();
    const auto displacement = normal * distance;
    const auto source = std::find_if(body.entities.begin(), body.entities.end(),
        [&](const auto& e) { return e.shape.IsSame(faces.front()); });
    if (source == body.entities.end()) return std::nullopt;
    Tree input, selected, target, translation;
    input.put("kind", "move-faces");
    target.put("body", body.id); target.put("face", source->id);
    selected.push_back({"", target}); input.add_child("faces", selected);
    for (double coordinate : {displacement.X(), displacement.Y(), displacement.Z()}) {
        Tree value; value.put_value(coordinate); translation.push_back({"", value});
    }
    input.add_child("translation", translation);
    const std::vector<Operand> operands{body};
    try {
        auto edit = boundary_move::selection(input, operands);
        boundary_move::buildEdges(edit);
        auto result = boundary_move::reconstruct(edit);
        // Reconnection is an offset only if every unselected support stays fixed.
        // In particular, this must not silently adopt Move's neighboring-face warping.
        for (const auto& entity : body.entities) {
            if (entity.shape.ShapeType() != TopAbs_FACE) continue;
            // Reconstruction copies unaffected faces without changing their support.
            if (!edit.affected(entity.shape)) continue;
            const auto next = std::find_if(result.predecessors.begin(), result.predecessors.end(),
                [&](const auto& e) { return e.id == entity.id; });
            if (next == result.predecessors.end()) return std::nullopt;
            const auto face = TopoDS::Face(next->shape);
            if (entity.id == source->id) {
                offset_geometry::checkParallel(TopoDS::Face(entity.shape), face, distance,
                                               "Planar face offset", true);
                result.selectedFaces.push_back(face);
            } else checkUnselectedSupport(TopoDS::Face(entity.shape), face);
        }
        std::vector<TopoDS_Shape> preservedVertices;
        for (TopExp_Explorer it(body.shape, TopAbs_VERTEX); it.More(); it.Next())
            if (!edit.movedVertices.Contains(it.Current())) preservedVertices.push_back(it.Current());
        checkOffsetVolume(body.shape, result.shape, distance, preservedVertices);
        return result;
    } catch (const Standard_Failure&) {
        return std::nullopt;
    } catch (const std::runtime_error&) {
        return std::nullopt;
    }
}
