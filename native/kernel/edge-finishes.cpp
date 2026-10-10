#include "kernel.h"
#include "edge-finish-conditioning.h"
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <ShapeFix_Shape.hxx>
#include <Standard_Failure.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <type_traits>

namespace {
TopoDS_Shape repairEdgeFinish(const TopoDS_Shape& shape) {
    if (shape.IsNull()) throw std::runtime_error("Kernel produced invalid geometry");
    if (BRepCheck_Analyzer(shape).IsValid()) return shape;
    // OCCT can build a fillet with an invalid contextual wire orientation.
    // Repair the generated shape once and accept only a validated result.
    ShapeFix_Shape repair(shape);
    repair.Perform();
    const auto fixed = repair.Shape();
    validate(fixed);
    return fixed;
}

template<class Operation>
void finishBody(const Operand& body, const std::vector<TopoDS_Edge>& edges,
                double size, std::vector<Result>& results) {
    Operation operation(body.shape);
    // Keep generated blend boundaries precise enough for subsequent offsets.
    // This changes fitting accuracy, not the edge radius or topology tolerance.
    if constexpr (std::is_same_v<Operation, BRepFilletAPI_MakeFillet>)
        operation.SetParams(1e-2, 1e-7, 1e-7, 1e-7, 1e-7, 1e-3);
    for (const auto& edge : edges) operation.Add(size, edge);
    for (const auto& edge : edges)
        if (!operation.Contour(edge)) throw std::runtime_error("A selected edge cannot be rounded or chamfered");
    TopoDS_Shape shape;
    try {
        operation.Build();
        if (!operation.IsDone()) throw std::runtime_error("Edge finish is not feasible at this size");
        shape = repairEdgeFinish(operation.Shape());
    } catch (const Standard_Failure&) {
        throw std::runtime_error("Edge finish is not feasible at this size");
    } catch (const std::runtime_error&) {
        throw std::runtime_error("Edge finish is not feasible at this size");
    }
    std::vector<SourceEntity> origins;
    for (const auto& origin : body.entities) {
        if (!operation.IsDeleted(origin.shape)) origins.push_back(origin);
        for (const auto* list : {&operation.Modified(origin.shape), &operation.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) origins.push_back({origin.id, i.Value()});
    }
    const auto count = results.size();
    solids(results, shape, origins, {body.id});
    if (results.size() != count + 1) throw std::runtime_error("Edge finish is not feasible at this size");
}
}
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
        if (mode == "fillet") finishBody<BRepFilletAPI_MakeFillet>(body, edges, size, results);
        else finishBody<BRepFilletAPI_MakeChamfer>(body, edges, size, results);
        participants.push_back(body.id);
    }
    return results;
}
