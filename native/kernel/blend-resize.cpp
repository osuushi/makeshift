#include "blends.h"
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
bool contains(const std::vector<TopoDS_Face>& faces, const TopoDS_Shape& face) {
    return std::any_of(faces.begin(), faces.end(), [&](const TopoDS_Face& f) { return f.IsSame(face); });
}
template<class Operation>
std::vector<SourceEntity> trace(Operation& operation, const std::vector<SourceEntity>& originals) {
    std::vector<SourceEntity> result;
    for (const auto& source : originals) {
        if (!operation.IsDeleted(source.shape)) result.push_back(source);
        for (const auto* list : {&operation.Modified(source.shape), &operation.Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) result.push_back({source.id, i.Value()});
    }
    return result;
}
struct Pair { TopoDS_Face a, b; std::string origin; };
Result finishResult(const Operand& body, const std::vector<TopoDS_Face>& selected,
                    const TopoDS_Shape& shape, const std::vector<SourceEntity>& origins) {
    for (const auto& original : body.entities) {
        if (original.shape.ShapeType() != TopAbs_FACE || contains(selected, original.shape)) continue;
        for (const auto& current : origins)
            if (current.id == original.id && current.shape.ShapeType() == TopAbs_FACE)
                checkUnselectedSupport(TopoDS::Face(original.shape), TopoDS::Face(current.shape));
    }
    std::vector<Result> results;
    solids(results, shape, origins, {body.id});
    if (results.size() != 1) throw std::runtime_error("Edge finish edit must leave one valid solid");
    return results[0];
}
std::vector<SourceEntity> recoveredEdges(const Operand& body, BRepAlgoAPI_Defeaturing& remove,
                                         const std::vector<Pair>& pairs) {
    const auto images = [&](const TopoDS_Face& original, const TopoDS_Shape& current) {
        if (original.IsSame(current)) return true;
        for (TopTools_ListIteratorOfListOfShape i(remove.Modified(original)); i.More(); i.Next())
            if (i.Value().IsSame(current)) return true;
        return false;
    };
    TopTools_IndexedMapOfShape previousEdges;
    TopExp::MapShapes(body.shape, TopAbs_EDGE, previousEdges);
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(remove.Shape(), TopAbs_EDGE, TopAbs_FACE, adjacency);
    std::vector<SourceEntity> replacementSeeds;
    for (int e = 1; e <= adjacency.Extent(); ++e) {
        const auto edge = TopoDS::Edge(adjacency.FindKey(e));
        if (previousEdges.Contains(edge)) continue;
        for (const auto& pair : pairs) {
            bool a = false, b = false;
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromIndex(e)); i.More(); i.Next()) {
                a |= images(pair.a, i.Value()); b |= images(pair.b, i.Value());
            }
            if (!a || !b) continue;
            replacementSeeds.push_back({pair.origin, edge});
        }
    }
    if (replacementSeeds.empty()) throw std::runtime_error("Could not identify the recovered supporting edges");
    return replacementSeeds;
}
Result resize(const Operand& body, const std::vector<TopoDS_Face>& seeds, double radius, bool chamfer) {
    const auto blends = chamfer ? recognizeChamfers(body.shape) : recognizeBlends(body.shape);
    const auto selected = chamfer ? tangentFaceChain(body.shape, seeds) : blendGroup(blends, seeds);
    for (const auto& seed : selected)
        if (std::none_of(blends.begin(), blends.end(), [&](const auto& b) { return b.face.IsSame(seed); }))
            throw std::runtime_error("Select an existing equal-distance chamfer face");
    std::vector<Pair> pairs;
    for (const auto& blend : blends) {
        if (!contains(selected, blend.face)) continue;
        std::vector<TopoDS_Face> supports;
        for (const auto& face : blend.supports) if (!contains(selected, face)) supports.push_back(face);
        const auto origin = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) { return e.shape.IsSame(blend.face); });
        if (supports.size() == 2 && origin != body.entities.end()) pairs.push_back({supports[0], supports[1], origin->id});
    }
    if (pairs.empty()) throw std::runtime_error("Could not resolve this edge finish's supporting faces");
    BRepAlgoAPI_Defeaturing remove;
    remove.SetShape(body.shape);
    remove.SetToFillHistory(true);
    for (const auto& face : selected) remove.AddFaceToRemove(face);
    remove.Build();
    if (!remove.IsDone() || remove.HasErrors() || remove.HasWarnings()) throw std::runtime_error("Could not recover the edge finish's supporting edges");
    validate(remove.Shape());
    TopTools_IndexedMapOfShape remaining;
    TopExp::MapShapes(remove.Shape(), TopAbs_FACE, remaining);
    for (const auto& face : selected) if (remaining.Contains(face)) throw std::runtime_error("Could not remove this edge finish for resizing");
    auto origins = trace(remove, body.entities);
    if (radius == 0) return finishResult(body, selected, remove.Shape(), origins);
    const auto replacementSeeds = recoveredEdges(body, remove, pairs);
    BRepFilletAPI_MakeFillet fillet(remove.Shape());
    BRepFilletAPI_MakeChamfer bevel(remove.Shape());
    TopTools_MapOfShape added;
    for (const auto& seed : replacementSeeds) {
        if (!added.Add(seed.shape)) continue;
        if (chamfer) bevel.Add(radius, TopoDS::Edge(seed.shape));
        else fillet.Add(radius, TopoDS::Edge(seed.shape));
    }
    BRepBuilderAPI_MakeShape& finish = chamfer ? static_cast<BRepBuilderAPI_MakeShape&>(bevel) : fillet;
    if (chamfer) bevel.Build(); else fillet.Build();
    if (!finish.IsDone()) throw std::runtime_error("Edge finish cannot use that size with its current neighbors");
    validate(finish.Shape());
    origins = chamfer ? trace(bevel, origins) : trace(fillet, origins);
    for (const auto& seed : replacementSeeds)
        for (TopTools_ListIteratorOfListOfShape i(finish.Generated(seed.shape)); i.More(); i.Next())
            if (i.Value().ShapeType() == TopAbs_FACE) origins.push_back({seed.id, i.Value()});
    return finishResult(body, selected, finish.Shape(), origins);
}
}
std::optional<Result> collapseOffsetFinish(const Operand& body,
                                          const std::vector<TopoDS_Face>& seeds, double distance) {
    // At a curved face's zero radius or a chamfer's zero setback, recover the
    // support intersection rather than constructing a zero-area surface.
    for (const bool chamfer : {false, true}) {
        const auto finishes = chamfer ? recognizeChamfers(body.shape) : recognizeBlends(body.shape);
        const auto atCorner = [&](const auto& face) {
            const auto finish = std::find_if(finishes.begin(), finishes.end(),
                [&](const auto& f) { return f.face.IsSame(face); });
            return finish != finishes.end() &&
                   std::abs(finish->radius + (chamfer ? -1 : 1) * finish->outward *
                            distance * finish->distanceScale) <= 1e-7;
        };
        if (seeds.empty() || !std::all_of(seeds.begin(), seeds.end(), atCorner)) continue;
        const auto selected = chamfer ? tangentFaceChain(body.shape, seeds) : blendGroup(finishes, seeds);
        // A connected strip may only heal together when every member reaches
        // its endpoint; do not silently consume a differently sized neighbor.
        if (!std::all_of(selected.begin(), selected.end(), atCorner)) return std::nullopt;
        return resize(body, selected, 0, chamfer);
    }
    return std::nullopt;
}
std::vector<Result> resizeBlends(const Tree& input, const std::vector<Operand>& bodies,
                               std::vector<std::string>& participants) {
    const double radius = input.get<double>("radius");
    if (!std::isfinite(radius) || radius < 0 || (radius > 0 && radius <= 1e-7)) throw std::runtime_error("Fillet radius must be zero or greater than the geometry tolerance");
    std::vector<Result> results;
    size_t count = 0;
    for (const auto& body : bodies) {
        std::vector<TopoDS_Face> selected;
        for (const auto& item : input.get_child("faces")) {
            if (item.second.get<std::string>("body") != body.id) continue;
            const auto id = item.second.get<std::string>("face");
            const auto face = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) { return e.id == id && e.shape.ShapeType() == TopAbs_FACE; });
            if (face == body.entities.end()) throw std::runtime_error("Selected face does not belong to this body");
            if (contains(selected, face->shape)) throw std::runtime_error("Select each fillet face only once");
            selected.push_back(TopoDS::Face(face->shape)); ++count;
        }
        if (selected.empty()) continue;
        results.push_back(resize(body, selected, radius, input.get<bool>("chamfer", false))); participants.push_back(body.id);
    }
    if (!count || count != input.get_child("faces").size()) throw std::runtime_error("Select existing fillet faces");
    return results;
}
