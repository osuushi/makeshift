#include "kernel.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <Bnd_Box.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <optional>
#include <stdexcept>

namespace {
constexpr double tolerance = 1e-6;
struct Surface { TopoDS_Shape solid; std::vector<TopoDS_Face> faces; };
struct Sample { double size; double residual; };

// Only newly generated rounding/chamfer faces may satisfy the target. An
// unchanged wall passing through the point is not a solved edge finish.
std::vector<Surface> finishSurfaces(const Tree& input, const std::vector<Operand>& bodies, double size) {
    auto request = input;
    request.put("size", size);
    std::vector<std::string> participants;
    const auto results = finishEdges(request, bodies, participants);
    std::vector<Surface> surfaces;
    for (const auto& result : results) {
        Surface surface{result.shape, {}};
        for (TopExp_Explorer it(result.shape, TopAbs_FACE); it.More(); it.Next()) {
            const bool inherited = std::any_of(result.predecessors.begin(), result.predecessors.end(),
                [&](const SourceEntity& source) { return source.shape.IsSame(it.Current()); });
            if (!inherited) surface.faces.push_back(TopoDS::Face(it.Current()));
        }
        if (!surface.faces.empty()) surfaces.push_back(std::move(surface));
    }
    return surfaces;
}

class Fit {
    const Tree& input;
    const std::vector<Operand>& bodies;
    std::map<double, std::optional<std::vector<Surface>>> cache;
public:
    Fit(const Tree& input, const std::vector<Operand>& bodies) : input(input), bodies(bodies) {}
    std::optional<Sample> sample(const gp_Pnt& target, double size) {
        auto found = cache.find(size);
        if (found == cache.end()) {
            if (cache.size() >= 64) cache.erase(cache.begin());
            std::optional<std::vector<Surface>> surfaces;
            try { surfaces = finishSurfaces(input, bodies, size); }
            catch (const Standard_Failure&) {}
            catch (const std::runtime_error&) {}
            found = cache.emplace(size, std::move(surfaces)).first;
        }
        if (!found->second) return std::nullopt;
        const auto vertex = BRepBuilderAPI_MakeVertex(target).Vertex();
        double closest = std::numeric_limits<double>::infinity();
        double residual = closest;
        for (const auto& surface : *found->second) {
            double distance = closest;
            for (const auto& face : surface.faces) {
                BRepExtrema_DistShapeShape query(vertex, face);
                if (query.IsDone()) distance = std::min(distance, query.Value());
            }
            if (distance >= closest) continue;
            closest = distance;
            BRepClass3d_SolidClassifier classifier(surface.solid, target, 1e-7);
            residual = classifier.State() == TopAbs_IN ? -distance : distance;
        }
        return std::isfinite(residual) ? std::optional<Sample>{{size, residual}} : std::nullopt;
    }
    std::optional<double> bracket(const gp_Pnt& target, Sample a, Sample b) {
        for (int step = 0; step < 40; ++step) {
            if (std::abs(a.residual) <= tolerance) return a.size;
            if (std::abs(b.residual) <= tolerance) return b.size;
            const double fraction = step % 3 == 2 ? 0.5
                : std::clamp(-a.residual / (b.residual-a.residual), 0.1, 0.9);
            const auto mid = sample(target, a.size+(b.size-a.size)*fraction);
            if (!mid) return std::nullopt;
            if (std::abs(mid->residual) <= tolerance) return mid->size;
            if (std::signbit(mid->residual) == std::signbit(a.residual)) a = *mid;
            else b = *mid;
        }
        return std::nullopt;
    }
    std::optional<double> boundary(const gp_Pnt& target, Sample valid, double invalid) {
        // A target can be reached just before OCCT's feasible size limit.
        for (int step = 0; step < 22; ++step) {
            const double size = (valid.size+invalid)*0.5;
            const auto next = sample(target, size);
            if (!next) { invalid = size; continue; }
            if (std::abs(next->residual) <= tolerance) return size;
            if (std::signbit(next->residual) != std::signbit(valid.residual))
                return bracket(target, valid, *next);
            valid = *next;
        }
        return std::nullopt;
    }
    std::optional<double> solve(const gp_Pnt& target, double distance, double limit) {
        if (distance <= tolerance || !std::isfinite(distance)) return std::nullopt;
        // Include the exact right-angle bisector seed, but solve against native
        // generated surfaces for arbitrary angles, concave edges and curved rims.
        std::vector<double> sizes{std::max(1e-5, distance*0.01), distance*0.1,
            distance, distance*(1+std::sqrt(2.0))};
        for (double size = distance*4; size < limit; size *= 2) sizes.push_back(size);
        sizes.push_back(limit);
        std::sort(sizes.begin(), sizes.end());
        std::optional<Sample> previous;
        for (const double size : sizes) {
            if (size <= 1e-8) continue;
            const auto next = sample(target, size);
            if (!next) {
                if (previous) return boundary(target, *previous, size);
                continue;
            }
            if (std::abs(next->residual) <= tolerance) return size;
            if (previous && std::signbit(previous->residual) != std::signbit(next->residual))
                return bracket(target, *previous, *next);
            previous = next;
        }
        return std::nullopt;
    }
};

std::vector<TopoDS_Shape> selectedEdges(const Tree& input, const std::vector<Operand>& bodies) {
    std::vector<TopoDS_Shape> edges;
    for (const auto& value : input.get_child("edges")) {
        const auto bodyId = value.second.get<std::string>("body");
        const auto edgeId = value.second.get<std::string>("edge");
        const auto body = std::find_if(bodies.begin(), bodies.end(), [&](const auto& b) { return b.id == bodyId; });
        if (body == bodies.end()) throw std::runtime_error("Unknown snap source body");
        const auto edge = std::find_if(body->entities.begin(), body->entities.end(), [&](const auto& e) {
            return e.id == edgeId && e.shape.ShapeType() == TopAbs_EDGE;
        });
        if (edge == body->entities.end()) throw std::runtime_error("Unknown snap source edge");
        edges.push_back(edge->shape);
    }
    if (edges.empty()) throw std::runtime_error("Select an edge to fit");
    return edges;
}
}

void edgeFinishTargets(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto mode = input.get<std::string>("mode");
    if (mode != "fillet" && mode != "chamfer") throw std::runtime_error("Unknown edge finish");
    const auto edges = selectedEdges(input, bodies);
    Bnd_Box bounds;
    for (const auto& body : bodies) BRepBndLib::AddOptimal(body.shape, bounds, false, false);
    double x0, y0, z0, x1, y1, z1;
    bounds.Get(x0, y0, z0, x1, y1, z1);
    const double limit = gp_Pnt(x0,y0,z0).Distance(gp_Pnt(x1,y1,z1))*1e6;
    bounds.Enlarge(tolerance);
    Fit fit(input, bodies);
    out << "{\"edgeFinishTargets\":[";
    bool first = true;
    for (const auto& value : input.get_child("points")) {
        const auto target = point(value.second);
        std::optional<double> size;
        if (!bounds.IsOut(target)) {
            const auto vertex = BRepBuilderAPI_MakeVertex(target).Vertex();
            double distance = std::numeric_limits<double>::infinity();
            for (const auto& edge : edges) {
                BRepExtrema_DistShapeShape query(vertex, edge);
                if (query.IsDone()) distance = std::min(distance, query.Value());
            }
            size = fit.solve(target, distance, limit);
        }
        if (!first) out << ',';
        first = false;
        if (size) out << *size; else out << "null";
    }
    out << "]}";
}
