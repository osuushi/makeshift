#include "kernel.h"
#include "blends.h"
#include "offset-contacts.h"
#include "offset-collapse.h"
#include "offset-geometry.h"
#include "offset-result.h"
#include "timing.h"
#include "planar-face-offset.h"
#include "planar-offset-prisms.h"
#include "spherical-face-offset.h"
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <BRepOffset_MakeOffset.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>

namespace {
std::map<std::string, std::vector<TopoDS_Face>> selectedFaces(
        const Tree& input, const std::vector<Operand>& bodies) {
    std::map<std::string, std::vector<TopoDS_Face>> selected;
    std::set<std::string> unique;
    for (const auto& item : input.get_child("faces")) {
        const auto bodyId = item.second.get<std::string>("body");
        const auto faceId = item.second.get<std::string>("face");
        if (!unique.insert(faceId).second) throw std::runtime_error("Select each face only once");
        const auto body = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == bodyId; });
        if (body == bodies.end()) throw std::runtime_error("Selected body no longer exists");
        const auto face = std::find_if(body->entities.begin(), body->entities.end(), [&](const SourceEntity& e) {
            return e.id == faceId && e.shape.ShapeType() == TopAbs_FACE;
        });
        if (face == body->entities.end()) throw std::runtime_error("Selected face does not belong to this body");
        selected[bodyId].push_back(TopoDS::Face(face->shape));
    }
    if (selected.empty()) throw std::runtime_error("Select at least one body face");
    return selected;
}
Result finishOffset(const Operand& body, BRepOffset_MakeOffset& operation,
                    const std::vector<FaceOffset>& offsets, bool absorbed, double distance, bool freeform) {
    std::vector<SourceEntity> origins;
    for (const auto& origin : body.entities) {
        if (!operation.IsDeleted(origin.shape)) origins.push_back(origin);
        for (const auto* list : {&operation.Modified(origin.shape), &operation.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) {
                    if (origin.shape.ShapeType() == TopAbs_FACE && std::none_of(offsets.begin(), offsets.end(),
                        [&](const FaceOffset& offset) { return offset.face.IsSame(origin.shape); }))
                        checkUnselectedSupport(TopoDS::Face(origin.shape), TopoDS::Face(i.Value()));
                    origins.push_back({origin.id, i.Value()});
                }
    }
    // Contact absorption is part of Offset's existing interaction. Otherwise
    // preserve intentional subdivisions until explicit cleanup is requested.
    ShapeUpgrade_UnifySameDomain unify(operation.Shape(), absorbed, absorbed, false);
    unify.Build();
    const auto history = unify.History();
    auto continued = origins;
    for (const auto& source : origins) {
        for (const auto* list : {&history->Modified(source.shape), &history->Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) continued.push_back({source.id, i.Value()});
    }
    std::vector<TopoDS_Face> highlighted;
    for (const auto& offset : offsets) {
        std::vector<TopoDS_Shape> faces{offset.face};
        for (const auto* list : {&operation.Modified(offset.face), &operation.Generated(offset.face)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next()) faces.push_back(i.Value());
        for (const auto& face : faces) {
            if (face.ShapeType() != TopAbs_FACE) continue;
            highlighted.push_back(TopoDS::Face(face));
            for (TopTools_ListIteratorOfListOfShape i(history->Modified(face)); i.More(); i.Next())
                if (i.Value().ShapeType() == TopAbs_FACE) highlighted.push_back(TopoDS::Face(i.Value()));
        }
    }
    validate(unify.Shape());
    if (freeform) offset_geometry::validSolid(unify.Shape(), "Kernel produced invalid geometry: offset");
    checkOffsetVolume(body.shape, unify.Shape(), distance);
    std::vector<Result> results;
    solids(results, unify.Shape(), continued, {body.id});
    if (results.size() != 1) throw std::runtime_error("Face offset must leave one valid solid per body");
    results.front().selectedFaces = highlighted;
    return std::move(results.front());
}
}

std::vector<Result> offsetFaces(const Tree& input, const std::vector<Operand>& bodies,
                               std::vector<std::string>& participants) {
    if (input.get_optional<double>("radius")) return resizeBlends(input, bodies, participants);
    const double distance = input.get<double>("distance");
    if (!std::isfinite(distance)) throw std::runtime_error("Enter a finite face offset");
    auto selected = selectedFaces(input, bodies);
    std::vector<Result> results;
    for (auto body : bodies) {
        KernelTiming timing("face-offset-body");
        const auto found = selected.find(body.id);
        if (found == selected.end()) continue;
        if (auto collapsed = collapseOffsetFinish(body, found->second, distance)) {
            participants.push_back(body.id);
            results.push_back(std::move(*collapsed));
            continue;
        }
        found->second = tangentFaceChain(body.shape, found->second);
        for (const auto& face : found->second) checkOffsetFace(face, distance);
        participants.push_back(body.id);
        if (std::abs(distance) < 1e-8) { solids(results, body.shape, body.entities, {body.id}); continue; }
        const auto originalBody = body;
        const auto requestedFaces = found->second;
        try {
            const bool freeform = offset_geometry::freeform(body.shape);
            const auto original = body.shape;
            const auto originalEncoding = freeform ? offset_geometry::encoding(original) : "";
            body = offset_geometry::prepare(body, "Kernel produced invalid geometry: offset", &found->second);
            body = prepareOffset(body, found->second, distance);
            timing.phase("prepare");
            const auto preparedEncoding = freeform ? offset_geometry::encoding(body.shape) : "";
            BRepOffset_MakeOffset operation;
            operation.Initialize(body.shape, 0, 1e-7, BRepOffset_Skin, !freeform, false, GeomAbs_Intersection);
            const auto offsets = offsetContacts(body.shape, found->second, distance);
            for (const auto& offset : offsets) operation.SetOffsetOnFace(offset.face, offset.distance);
            operation.MakeOffsetShape();
            timing.phase("construct");
            if (!operation.IsDone()) throw std::runtime_error("Those faces cannot be offset by that distance");
            if (freeform) offset_geometry::rebuildBoundaries(operation.Shape(), body.shape);
            timing.phase("boundaries");
            if (freeform && offset_geometry::encoding(body.shape) != preparedEncoding)
                throw std::runtime_error("Kernel produced invalid geometry: offset construction altered its operand");
            validate(operation.Shape());
            timing.phase("validate");
            if (freeform) checkFreeformOffset(body, operation, offsets);
            timing.phase("correspondence");
            auto result = finishOffset(body, operation, offsets, offsets.size() > found->second.size(),
                                       distance, freeform);
            timing.phase("result");
            if (freeform && (offset_geometry::encoding(original) != originalEncoding ||
                             offset_geometry::encoding(body.shape) != preparedEncoding))
                throw std::runtime_error("Kernel produced invalid geometry: offset altered input geometry");
            results.push_back(std::move(result));
        } catch (const std::runtime_error&) {
            if (auto spherical = sphericalFaceOffset(originalBody, requestedFaces, distance)) {
                results.push_back(std::move(*spherical));
                continue;
            }
            auto planar = planarFaceOffset(originalBody, requestedFaces, distance);
            if (!planar) planar = planarOffsetPrisms(originalBody, requestedFaces, distance);
            if (!planar) throw;
            results.push_back(std::move(*planar));
        }
    }
    return results;
}
