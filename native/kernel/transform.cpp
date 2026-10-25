#include "kernel.h"
#include "scale-transform.h"
#include <BRepBuilderAPI_Transform.hxx>
#include <gp_Ax1.hxx>
#include <gp_Ax2.hxx>
#include <cmath>
#include <set>
#include <stdexcept>

std::vector<Result> transformBodies(const Tree& input, const std::vector<Operand>& bodies,
                                   std::vector<std::string>& participants) {
    const bool mirror = input.get<std::string>("kind") == "mirror";
    const bool scale = input.get<std::string>("kind") == "scale";
    const auto affine = scale ? scaleTransform(input) : gp_GTrsf();
    gp_Trsf transform;
    if (scale && affine.Form() != gp_Other) {
        transform = affine.Trsf();
    } else if (mirror) {
        const auto origin = point(input.get_child("plane.origin"));
        const auto normal = point(input.get_child("plane.normal"));
        const gp_Vec axis(normal.X(), normal.Y(), normal.Z());
        if (axis.Magnitude() < 1e-12) throw std::runtime_error("Invalid mirror normal");
        transform.SetMirror(gp_Ax2(origin, gp_Dir(axis)));
    } else if (!scale) {
        const auto pivot = point(input.get_child("pivot"));
        const auto axisPoint = point(input.get_child("axis"));
        const gp_Vec axis(axisPoint.X(), axisPoint.Y(), axisPoint.Z());
        const auto translation = point(input.get_child("translation"));
        const double degrees = input.get<double>("angle");
        if (!std::isfinite(degrees) || axis.Magnitude() < 1e-12)
            throw std::runtime_error("Invalid rigid transform");
        gp_Trsf rotation, movement;
        rotation.SetRotation(gp_Ax1(pivot, gp_Dir(axis)), degrees * std::acos(-1.0) / 180);
        movement.SetTranslation(gp_Vec(translation.X(), translation.Y(), translation.Z()));
        transform = movement * rotation;
    }
    std::set<std::string> selected;
    for (const auto& id : input.get_child("ids")) selected.insert(id.second.get_value<std::string>());
    if (selected.empty()) throw std::runtime_error("Select bodies to move");
    const bool copy = !scale && input.get<bool>(mirror ? "keepOriginal" : "duplicate");
    std::vector<Result> results;
    for (const auto& body : bodies) {
        if (!selected.erase(body.id)) continue;
        if (scale && affine.Form() == gp_Other) {
            BRepBuilderAPI_GTransform operation(body.shape, affine, true);
            if (!operation.IsDone()) throw std::runtime_error("Body transform failed");
            const auto supports = affineSupports(body.shape, affine, operation);
            const auto shape = supports->Apply(operation.Shape());
            validate(shape);
            if (volume(shape) <= 0) throw std::runtime_error("Transform produced a non-positive solid");
            Result result{shape, {}, {}};
            result.bodies.push_back(body.id);
            participants.push_back(body.id);
            for (const auto& entity : body.entities)
                result.predecessors.push_back({entity.id, supports->Apply(operation.ModifiedShape(entity.shape))});
            results.push_back(std::move(result));
            continue;
        }
        BRepBuilderAPI_Transform operation(body.shape, transform, true);
        if (!operation.IsDone()) throw std::runtime_error("Body transform failed");
        validate(operation.Shape());
        if ((mirror || scale) && volume(operation.Shape()) <= 0)
            throw std::runtime_error("Transform produced a non-positive solid");
        Result result{operation.Shape(), {}, {}};
        result.copy = copy;
        if (!copy) participants.push_back(body.id);
        result.bodies.push_back(body.id);
        for (const auto& entity : body.entities)
            result.predecessors.push_back({entity.id, operation.ModifiedShape(entity.shape)});
        results.push_back(std::move(result));
    }
    if (!selected.empty()) throw std::runtime_error("Selected body no longer exists");
    return results;
}
