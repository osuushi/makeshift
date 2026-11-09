#include "kernel.h"
#include "timing.h"
#include "delete-band.h"
#include <Standard_Failure.hxx>
#include <OSD_ThreadPool.hxx>
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <set>
#include <stdexcept>

namespace {
std::vector<SourceEntity> selected(const Tree& selection, const Operand& body, TopAbs_ShapeEnum type) {
    std::vector<SourceEntity> result;
    std::set<std::string> seen;
    for (const auto& item : selection.get_child(type == TopAbs_FACE ? "faces" : "edges")) {
        const auto id = item.second.get_value<std::string>();
        const auto found = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) {
            return e.id == id && e.shape.ShapeType() == type;
        });
        if (found == body.entities.end() || !seen.insert(id).second)
            throw std::runtime_error("Select existing faces and edges only once");
        result.push_back(*found);
    }
    return result;
}
Result healFaces(const Operand& body, const std::vector<SourceEntity>& faces) {
    if (faces.empty()) return {body.shape, body.entities, {body.id}};
    KernelTiming timing("delete-heal");
    timing.phase("begin");
    BRepAlgoAPI_Defeaturing heal;
    heal.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    heal.SetShape(body.shape);
    heal.SetToFillHistory(true);
    for (const auto& face : faces) heal.AddFaceToRemove(face.shape);
    heal.Build();
    timing.phase("build");
    if (!heal.IsDone() || heal.HasErrors() || heal.HasWarnings())
        throw std::runtime_error("These faces cannot be deleted while keeping a closed solid");
    validate(heal.Shape());
    timing.phase("validate");
    TopTools_IndexedMapOfShape remaining;
    TopExp::MapShapes(heal.Shape(), TopAbs_FACE, remaining);
    for (const auto& face : faces)
        if (remaining.Contains(face.shape) || !heal.IsDeleted(face.shape))
            throw std::runtime_error("Not every selected face could be removed; select the complete feature");
    std::vector<SourceEntity> origins;
    for (const auto& source : body.entities) {
        if (std::any_of(faces.begin(), faces.end(), [&](const SourceEntity& f) { return f.id == source.id; })) continue;
        if (!heal.IsDeleted(source.shape)) origins.push_back(source);
        for (const auto* list : {&heal.Modified(source.shape), &heal.Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) origins.push_back({source.id, i.Value()});
    }
    return {heal.Shape(), origins, {body.id}};
}
Result erase(const Tree& selection, const Operand& body) {
    if (selection.get<bool>("whole", false)) throw std::runtime_error("Select faces or edges to delete");
    const auto faces = selected(selection, body, TopAbs_FACE), edges = selected(selection, body, TopAbs_EDGE);
    if (faces.empty() && edges.empty()) throw std::runtime_error("Select faces or edges to delete");
    Result result;
    try { result = healFaces(body, faces); }
    catch (const Standard_Failure&) { result = delete_band::flattenBand(body, faces); }
    catch (const std::runtime_error&) { result = delete_band::flattenBand(body, faces); }
    TopTools_IndexedMapOfShape current;
    TopExp::MapShapes(result.shape, TopAbs_EDGE, current);
    TopTools_MapOfShape eligible;
    for (const auto& edge : edges)
        for (const auto& origin : result.predecessors)
            if (origin.id == edge.id && current.Contains(origin.shape)) eligible.Add(origin.shape);
    if (!eligible.IsEmpty()) {
        result = cleanupEdges({body.id, result.shape, result.predecessors}, eligible);
        TopTools_IndexedMapOfShape after;
        TopExp::MapShapes(result.shape, TopAbs_EDGE, after);
        for (const auto& edge : edges)
            for (const auto& origin : result.predecessors)
                if (origin.id == edge.id && after.Contains(origin.shape))
                    throw std::runtime_error("This edge separates different surfaces; delete the feature's faces instead");
    }
    validate(result.shape);
    for (TopExp_Explorer s(result.shape, TopAbs_SHELL); s.More(); s.Next())
        if (!BRep_Tool::IsClosed(s.Current())) throw std::runtime_error("Deletion would leave an open shell");
    std::vector<Result> solidsOnly;
    solids(solidsOnly, result.shape, result.predecessors, {body.id});
    if (solidsOnly.size() != 1) throw std::runtime_error("Deletion must leave one closed solid per body");
    return solidsOnly.front();
}
}
std::vector<Result> deleteTopology(const Tree& input, const std::vector<Operand>& bodies,
                                   std::vector<std::string>& participants) {
    std::vector<Result> results;
    std::set<std::string> seen;
    for (const auto& item : input.get_child("selection")) {
        const auto id = item.second.get<std::string>("body");
        if (!seen.insert(id).second) throw std::runtime_error("Duplicate deletion body");
        const auto found = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == id; });
        if (found == bodies.end()) throw std::runtime_error("Deletion body no longer exists");
        results.push_back(erase(item.second, *found));
        participants.push_back(id);
    }
    if (results.empty()) throw std::runtime_error("Select faces or edges to delete");
    return results;
}
