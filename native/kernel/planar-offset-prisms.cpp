#include "planar-offset-prisms.h"
#include "offset-contacts.h"
#include "offset-geometry.h"
#include "offset-continuation.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRep_Tool.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
bool sameSupport(const TopoDS_Face& a, const TopoDS_Face& b) {
    // Unchanged freeform faces retain their exact support through the Boolean.
    if (BRep_Tool::Surface(a) == BRep_Tool::Surface(b)) return true;
    BRepAdaptor_Surface x(a), y(b);
    if (x.GetType() != y.GetType()) return false;
    if (x.GetType() == GeomAbs_Plane)
        return x.Plane().Axis().IsParallel(y.Plane().Axis(), 1e-10) &&
               x.Plane().Distance(y.Plane().Location()) < 1e-7;
    if (x.GetType() != GeomAbs_Cylinder) return false;
    // A rebuilt cylinder can reverse its parameter axis without changing its support.
    auto axis = y.Cylinder().Axis();
    if (x.Cylinder().Axis().IsOpposite(axis, 1e-10)) axis.Reverse();
    return x.Cylinder().Axis().IsCoaxial(axis, 1e-10, 1e-7) &&
           std::abs(x.Cylinder().Radius() - y.Cylinder().Radius()) < 1e-7;
}
void continueOrigins(std::vector<SourceEntity>& origins, BRepAlgoAPI_Fuse& fuse) {
    std::vector<SourceEntity> next;
    for (const auto& origin : origins) {
        if (!fuse.IsDeleted(origin.shape)) next.push_back(origin);
        for (const auto* list : {&fuse.Modified(origin.shape), &fuse.Generated(origin.shape)})
            for (const auto& shape : *list)
                if (shape.ShapeType() == origin.shape.ShapeType()) next.push_back({origin.id, shape});
    }
    origins = std::move(next);
}
Result build(const Operand& body, const std::vector<FaceOffset>& offsets, double distance) {
    auto shape = body.shape;
    auto origins = body.entities;
    std::vector<TopoDS_Face> targets, fixed;
    for (const auto& source : body.entities)
        if (source.shape.ShapeType() == TopAbs_FACE &&
            std::none_of(offsets.begin(), offsets.end(), [&](const auto& offset) {
                return offset.face.IsSame(source.shape);
            })) fixed.push_back(TopoDS::Face(source.shape));
    for (const auto& offset : offsets) {
        const auto travel = offsetContinuation(body.shape, offset.face, offset.distance);
        gp_Trsf move; move.SetTranslation(travel);
        targets.push_back(TopoDS::Face(BRepBuilderAPI_Transform(offset.face, move, true).Shape()));
        if (offset.distance <= 1e-8) continue;
        BRepPrimAPI_MakePrism prism(offset.face, travel, true);
        // Each generator was certified against the adjacent support. This is
        // continuation to a parallel cap plane, including oblique tube walls.
        for (TopExp_Explorer it(offset.face, TopAbs_EDGE); it.More(); it.Next())
            for (const auto& generated : prism.Generated(it.Current()))
                if (generated.ShapeType() == TopAbs_FACE) fixed.push_back(TopoDS::Face(generated));
        for (const auto& source : body.entities)
            if (source.shape.IsSame(offset.face)) origins.push_back({source.id, prism.LastShape()});
        BRepAlgoAPI_Fuse fuse;
        TopTools_ListOfShape arguments, tools; arguments.Append(shape); tools.Append(prism.Shape());
        fuse.SetArguments(arguments); fuse.SetTools(tools); fuse.SetNonDestructive(true); fuse.Build();
        if (!fuse.IsDone() || fuse.HasErrors() || fuse.HasWarnings())
            throw std::runtime_error("Planar offset could not merge contacted material");
        continueOrigins(origins, fuse);
        shape = fuse.Shape();
    }
    ShapeUpgrade_UnifySameDomain unify(shape, true, true, false); unify.Build();
    auto continued = origins;
    for (const auto& origin : origins)
        for (const auto& modified : unify.History()->Modified(origin.shape))
            if (modified.ShapeType() == origin.shape.ShapeType()) continued.push_back({origin.id, modified});
    shape = unify.Shape();
    std::vector<Result> results; solids(results, shape, continued, {body.id});
    if (results.size() != 1) throw std::runtime_error("Planar offset must leave one solid");
    shape = results.front().shape;
    offset_geometry::validSolid(shape, "Kernel produced invalid geometry: planar offset");
    checkOffsetVolume(body.shape, shape, distance);
    std::vector<TopoDS_Face> selected;
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) {
        const auto face = TopoDS::Face(it.Current());
        if (std::any_of(targets.begin(), targets.end(), [&](const auto& target) { return sameSupport(target, face); }))
            selected.push_back(face);
        else if (std::none_of(fixed.begin(), fixed.end(), [&](const auto& source) { return sameSupport(source, face); }))
            throw std::runtime_error("Planar offset would introduce an unrelated support");
    }
    if (selected.empty()) throw std::runtime_error("Planar offset lost its moved face");
    results.front().selectedFaces = selected;
    return std::move(results.front());
}
}
std::optional<Result> planarOffsetPrisms(const Operand& body, const std::vector<TopoDS_Face>& seeds, double distance) {
    if (distance <= 0 || seeds.size() != 1 ||
        BRepAdaptor_Surface(seeds.front()).GetType() != GeomAbs_Plane) return std::nullopt;
    try {
        auto selected = seeds;
        const auto prepared = offset_geometry::prepare(body, "Planar offset", &selected, true);
        return build(prepared, offsetContacts(prepared.shape, selected, distance), distance);
    } catch (const Standard_Failure&) { return std::nullopt; }
      catch (const std::runtime_error&) { return std::nullopt; }
}
