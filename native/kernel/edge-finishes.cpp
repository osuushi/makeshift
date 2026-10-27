#include "kernel.h"
#include "edge-finish-conditioning.h"
#include "edge-finish-construction.h"
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>

namespace {
std::map<std::string, std::vector<TopoDS_Edge>> selectedEdges(const Tree& input, const std::vector<Operand>& bodies) {
    std::map<std::string, std::vector<TopoDS_Edge>> selected;
    std::set<std::string> unique;
    for (const auto& item : input.get_child("edges")) {
        const auto bodyId = item.second.get<std::string>("body");
        const auto edgeId = item.second.get<std::string>("edge");
        if (!unique.insert(edgeId).second) throw std::runtime_error("Select each edge only once");
        const auto body = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == bodyId; });
        if (body == bodies.end()) throw std::runtime_error("Selected body no longer exists");
        const auto edge = std::find_if(body->entities.begin(), body->entities.end(), [&](const SourceEntity& e) {
            return e.id == edgeId && e.shape.ShapeType() == TopAbs_EDGE;
        });
        if (edge == body->entities.end()) throw std::runtime_error("Selected edge does not belong to this body");
        selected[bodyId].push_back(TopoDS::Edge(edge->shape));
    }
    if (selected.empty()) throw std::runtime_error("Select at least one body edge");
    return selected;
}
std::vector<Operand> finishOperands(const Tree& input, const std::vector<Operand>& bodies) {
    std::set<std::string> involved;
    for (const auto& item : input.get_child("edges"))
        involved.insert(item.second.get<std::string>("body"));
    std::vector<Operand> result;
    for (const auto& body : bodies)
        result.push_back(involved.count(body.id) ? conditionEdgeFinish(body) : body);
    return result;
}

template<class Operation>
void collectChain(const Operand& body, const std::vector<TopoDS_Edge>& edges,
                  std::vector<std::pair<std::string, std::string>>& selected) {
    Operation operation(body.shape);
    for (const auto& edge : edges) operation.Add(edge);
    for (const auto& edge : edges)
        if (!operation.Contour(edge)) throw std::runtime_error("A selected edge cannot be rounded or chamfered");
    for (int c = 1; c <= operation.NbContours(); ++c) {
        for (int e = 1; e <= operation.NbEdges(c); ++e) {
            const auto edge = operation.Edge(c, e);
            const auto found = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& entity) {
                return entity.shape.ShapeType() == TopAbs_EDGE && entity.shape.IsSame(edge);
            });
            if (found == body.entities.end()) throw std::runtime_error("Required chain edge has no document identity");
            const auto id = std::make_pair(body.id, found->id);
            if (std::find(selected.begin(), selected.end(), id) == selected.end()) selected.push_back(id);
        }
    }
}
}
void edgeFinishSelection(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto mode = input.get<std::string>("mode");
    if (mode != "fillet" && mode != "chamfer") throw std::runtime_error("Unknown edge finish");
    const auto conditioned = finishOperands(input, bodies);
    const auto grouped = selectedEdges(input, conditioned);
    std::vector<std::pair<std::string, std::string>> selected;
    for (const auto& item : input.get_child("edges"))
        selected.emplace_back(item.second.get<std::string>("body"), item.second.get<std::string>("edge"));
    for (const auto& body : conditioned) {
        const auto found = grouped.find(body.id);
        if (found == grouped.end()) continue;
        if (mode == "fillet") collectChain<BRepFilletAPI_MakeFillet>(body, found->second, selected);
        else collectChain<BRepFilletAPI_MakeChamfer>(body, found->second, selected);
    }
    out << "{\"mode\":\"new\",\"participants\":[],\"results\":[],\"edgeSelection\":[";
    for (size_t i = 0; i < selected.size(); ++i) {
        if (i) out << ',';
        out << "{\"body\":" << quoted(selected[i].first) << ",\"edge\":" << quoted(selected[i].second) << '}';
    }
    out << "]}";
}
std::vector<Result> finishEdges(const Tree& input, const std::vector<Operand>& bodies,
                                std::vector<std::string>& participants) {
    const auto size = input.get<double>("size");
    const auto mode = input.get<std::string>("mode");
    if (mode != "fillet" && mode != "chamfer") throw std::runtime_error("Unknown edge finish");
    if (!std::isfinite(size) || size <= 1e-8)
        throw std::runtime_error("Edge size must be greater than zero");
    const auto conditioned = finishOperands(input, bodies);
    const auto selected = selectedEdges(input, conditioned);
    std::vector<Result> results;
    for (const auto& body : conditioned) {
        const auto found = selected.find(body.id);
        if (found == selected.end()) continue;
        const auto& edges = found->second;
        results.push_back(constructEdgeFinish(body, edges, size, mode == "chamfer"));
        participants.push_back(body.id);
    }
    return results;
}
