#include "kernel.h"
#include "erosion.h"
#include "boundary-move.h"
#include "sketch-curve.h"
#include "geometry-policy.h"
#include "normal-extrude.h"
#include "boolean-probe.h"
#include <BRepAdaptor_Curve.hxx>
#include <ShapeFix_Wire.hxx>
#include <ShapeExtend_WireData.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <utility>

namespace {
TopoDS_Wire wire(const Tree& spans) {
    BRepBuilderAPI_MakeWire builder;
    for (const auto& item : spans) {
        BRepBuilderAPI_MakeEdge edge(sketchCurve(item.second));
        if (!edge.IsDone()) throw std::runtime_error("Cannot construct profile span");
        builder.Add(edge.Edge());
    }
    if (!builder.IsDone()) throw std::runtime_error("Profile boundary is not a valid wire");
    ShapeFix_Wire boundary;
    boundary.Load(builder.Wire());
    boundary.SetPrecision(geometry_policy::cubicBooleanToleranceMm);
    boundary.SetMaxTolerance(geometry_policy::cubicBooleanToleranceMm);
    boundary.ModifyTopologyMode() = true;
    // Trimming a tangent cubic can leave a microscopic curve or adjoining line
    // remnant. Collapse within the contact budget on this temporary profile wire;
    // retaining them creates long sliver walls with unweldable mesh boundaries.
    for (int i = boundary.NbEdges(); i > 0; --i) {
        const int count = boundary.NbEdges();
        bool cubicJunction = false;
        for (int adjacent : {i == 1 ? count : i - 1, i, i == count ? 1 : i + 1})
            if (BRepAdaptor_Curve(boundary.WireData()->Edge(adjacent)).GetType() == GeomAbs_BezierCurve)
                cubicJunction = true;
        if (cubicJunction)
            boundary.FixSmall(i, false, geometry_policy::cubicBooleanToleranceMm);
    }
    return boundary.Wire();
}

}
TopoDS_Face profileFace(const Tree& profile, const std::vector<Operand>& bodies) {
    TopoDS_Face face;
    if (auto key = profile.get_optional<std::string>("face")) {
        bool found = false;
        for (const auto& body : bodies) for (const auto& entity : body.entities)
            if (entity.id == *key && entity.shape.ShapeType() == TopAbs_FACE) { face = TopoDS::Face(entity.shape); found = true; }
        if (!found) throw std::runtime_error("Selected face no longer exists");
    } else {
        BRepBuilderAPI_MakeFace builder(wire(profile.get_child("outer")), true);
        for (const auto& hole : profile.get_child("holes")) builder.Add(TopoDS::Wire(wire(hole.second).Reversed()));
        if (!builder.IsDone()) throw std::runtime_error("Profile is not a planar face");
        face = builder.Face(); validate(face);
    }
    return face;
}
TopoDS_Shape sweep(const Tree& input, const std::vector<Operand>& bodies, std::vector<SourceEntity>& origins) {
    const double distance = input.get<double>("distance");
    if (!std::isfinite(distance) || std::abs(distance) < 1e-8) throw std::runtime_error("Extrusion needs a nonzero distance");
    const auto direction = point(input.get_child("normal"));
    gp_Vec vector(direction.X(), direction.Y(), direction.Z());
    if (std::abs(vector.Magnitude() - 1) > 1e-7) throw std::runtime_error("Extrusion axis must be a unit vector");
    vector *= distance; TopoDS_Shape tool;
    for (const auto& item : input.get_child("profiles")) {
        const auto face = profileFace(item.second, bodies);
        const auto shape = input.get<bool>("normalExtrusion", false)
            ? normalExtrude(face, distance, item.second.get<std::string>("face"), origins)
            : extrudeProfile(face, vector, input);
        validate(shape);
        if (tool.IsNull()) tool = shape;
        else tool = booleanShape(tool, shape, "union", origins);
    }
    if (tool.IsNull()) throw std::runtime_error("Select at least one closed region or face");
    return tool;
}
namespace {
struct SweepIntersection {
    const Operand* body;
    std::unique_ptr<BooleanProbe> operation;
};
std::vector<Result> intersectionResults(const std::vector<SweepIntersection>& intersections,
                                      const std::vector<SourceEntity>& toolOrigins,
                                      std::vector<std::string>& participants) {
    std::vector<Result> results;
    for (const auto& intersection : intersections) {
        participants.push_back(intersection.body->id);
        auto origins = intersection.body->entities;
        origins.insert(origins.end(), toolOrigins.begin(), toolOrigins.end());
        solids(results, intersection.operation->intersect(origins), origins, {intersection.body->id});
    }
    return results;
}
std::vector<Result> calculateSweep(const Tree& input, const std::vector<Operand>& bodies,
                                   std::string& mode, std::vector<std::string>& participants) {
    std::vector<SourceEntity> toolOrigins;
    const auto tool = input.get<std::string>("kind") == "loft"
        ? loftSections(input, bodies) : input.get<std::string>("kind") == "revolve"
        ? revolve(input, bodies) : input.get<std::string>("kind") == "path-sweep"
            ? pathSweep(input, bodies) : sweep(input, bodies, toolOrigins);
    mode = input.get<std::string>("mode");
    if (mode != "auto" && mode != "new" && mode != "union" && mode != "subtract" && mode != "intersect")
        throw std::runtime_error("Unknown Boolean mode");
    std::vector<Result> results;
    if (mode == "new") { solids(results, tool, toolOrigins, {}); return results; }
    Bnd_Box toolBounds; BRepBndLib::Add(tool, toolBounds, false); toolBounds.Enlarge(1e-7);
    std::vector<const Operand*> positive, contact, explicitTargets;
    const auto eligible = input.get_child_optional("eligibleTargets");
    const auto targetList = input.get_child_optional("targets");
    const bool reuseIntersection = mode == "intersect" && !targetList;
    std::vector<SweepIntersection> intersections;
    for (const auto& body : bodies) {
        if (eligible && std::none_of(eligible->begin(), eligible->end(), [&](const auto& v) { return v.second.template get_value<std::string>() == body.id; })) continue;
        if (targetList && std::none_of(targetList->begin(), targetList->end(), [&](const auto& v) { return v.second.template get_value<std::string>() == body.id; })) continue;
        if (targetList) {
            explicitTargets.push_back(&body);
            if (mode != "auto") continue;
        }
        Bnd_Box bodyBounds; BRepBndLib::Add(body.shape, bodyBounds, false); bodyBounds.Enlarge(1e-7);
        if (toolBounds.IsOut(bodyBounds)) continue;
        if (mode == "union") {
            BRepExtrema_DistShapeShape separation(body.shape, tool);
            if (separation.IsDone() && separation.Value() < 1e-7) contact.push_back(&body);
        } else {
            auto operation = std::make_unique<BooleanProbe>(body.shape, tool);
            if (volume(operation->shape()) > 1e-10) {
                positive.push_back(&body);
                intersections.push_back({&body, std::move(operation)});
            } else if (mode == "auto") {
                BRepExtrema_DistShapeShape separation(body.shape, tool);
                if (separation.IsDone() && separation.Value() < 1e-7) contact.push_back(&body);
            }
        }
    }
    // Auto keeps Union as the neutral default when nothing intersects. The
    // union path with no participants still returns an independent solid, but
    // preserves the user's intended default operation in the widget and reply.
    if (mode == "auto") mode = positive.empty() ? "union" : "subtract";
    if (mode == "new") { solids(results, tool, {}, {}); return results; }
    const auto& selected = targetList ? explicitTargets : mode == "union" ? contact : positive;
    if (selected.empty() && mode != "union") throw std::runtime_error("The swept shape does not intersect a target body");
    // Detection already constructed the exact implicit Intersect result/history.
    if (reuseIntersection) return intersectionResults(intersections, toolOrigins, participants);
    if (mode == "union") {
        auto shape = tool; auto origins = toolOrigins;
        for (const auto* body : selected) {
            participants.push_back(body->id); origins.insert(origins.end(), body->entities.begin(), body->entities.end());
            shape = booleanShape(shape, body->shape, mode, origins);
        }
        solids(results, shape, origins, participants);
    } else for (const auto* body : selected) {
        participants.push_back(body->id); auto origins = body->entities;
        origins.insert(origins.end(), toolOrigins.begin(), toolOrigins.end());
        const auto found = std::find_if(intersections.begin(), intersections.end(),
            [&](const auto& intersection) { return intersection.body == body; });
        const auto shape = mode == "subtract" && found != intersections.end()
            ? found->operation->subtract(origins) : booleanShape(body->shape, tool, mode, origins);
        solids(results, shape, origins, {body->id});
    }
    return results;
}
}
std::vector<Result> calculate(const Tree& input, const std::vector<Operand>& bodies,
                             std::string& mode, std::vector<std::string>& participants) {
    if (input.get<std::string>("kind", "") == "replace-face") {
        mode = "new"; return replaceFace(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "plane-cut") {
        mode = "new"; return cutWithPlane(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "extrude") == "inspect") {
        std::vector<Result> results;
        for (const auto& body : bodies) solids(results, body.shape, body.entities, {body.id});
        mode = "inspect"; return results;
    }
    if (input.get<std::string>("kind", "") == "delete-topology") {
        mode = "new"; return deleteTopology(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "erode") {
        mode = "new"; return erodeBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "shell") {
        mode = "new"; return shellBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "cleanup") {
        mode = "new"; return cleanupBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "move-edges" ||
        input.get<std::string>("kind", "") == "scale-boundaries") {
        mode = "new"; return reconnectBoundaries(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "move-faces") {
        mode = "new"; return reconnectBoundaries(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "transform" ||
        input.get<std::string>("kind", "") == "mirror" ||
        input.get<std::string>("kind", "") == "scale") {
        mode = "new"; return transformBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "offset-faces") {
        mode = "new"; return offsetFaces(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "edge-finish") {
        mode = "new"; return finishEdges(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "boolean") {
        mode = input.get<std::string>("mode"); return booleanBodies(input, bodies, participants);
    }
    return calculateSweep(input, bodies, mode, participants);
}
