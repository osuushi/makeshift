#include "kernel.h"
#include "scale-transform.h"
#include <BRepBuilderAPI_Transform.hxx>
#include <gp_Ax1.hxx>
#include <gp_Ax2.hxx>
#include <gp_Mat.hxx>
#include <array>
#include <cmath>
#include <set>
#include <stdexcept>

namespace {
gp_GTrsf affineTransform(const Tree& input) {
    std::array<double, 12> m;
    std::size_t index = 0;
    for (const auto& item : input.get_child("matrix")) {
        const double value = item.second.get_value<double>();
        if (index == m.size() || !std::isfinite(value))
            throw std::runtime_error("Invalid affine transform");
        m[index++] = value;
    }
    if (index != m.size()) throw std::runtime_error("Invalid affine transform");
    const gp_XYZ u(m[0], m[4], m[8]), v(m[1], m[5], m[9]), w(m[2], m[6], m[10]);
    const auto length = u.Modulus(), angleScale = length * length;
    if (std::abs(u.DotCross(v, w)) <= length * v.Modulus() * w.Modulus() * 1e-12)
        throw std::runtime_error("Singular affine transform");
    const auto tolerance = angleScale * 1e-12;
    if (std::abs(u.Dot(v)) <= tolerance && std::abs(v.Dot(w)) <= tolerance &&
        std::abs(w.Dot(u)) <= tolerance && std::abs(v.SquareModulus() - angleScale) <= tolerance &&
        std::abs(w.SquareModulus() - angleScale) <= tolerance) {
        gp_Trsf similarity;
        similarity.SetValues(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
                             m[8], m[9], m[10], m[11]);
        return gp_GTrsf(similarity);
    }
    return gp_GTrsf(gp_Mat(u, v, w), gp_XYZ(m[3], m[7], m[11]));
}
}

std::vector<Result> transformBodies(const Tree& input, const std::vector<Operand>& bodies,
                                   std::vector<std::string>& participants) {
    const auto kind = input.get<std::string>("kind");
    const bool mirror = kind == "mirror";
    const bool general = kind == "scale" || kind == "affine";
    const auto affine = general ? (kind == "scale" ? scaleTransform(input) : affineTransform(input))
                                : gp_GTrsf();
    gp_Trsf transform;
    if (general && affine.Form() != gp_Other) {
        transform = affine.Trsf();
    } else if (mirror) {
        const auto origin = point(input.get_child("plane.origin"));
        const auto normal = point(input.get_child("plane.normal"));
        const gp_Vec axis(normal.X(), normal.Y(), normal.Z());
        if (axis.Magnitude() < 1e-12) throw std::runtime_error("Invalid mirror normal");
        transform.SetMirror(gp_Ax2(origin, gp_Dir(axis)));
    } else if (!general) {
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
    const bool copy = !general && input.get<bool>(mirror ? "keepOriginal" : "duplicate");
    std::vector<Result> results;
    for (const auto& body : bodies) {
        if (!selected.erase(body.id)) continue;
        if (general && affine.Form() == gp_Other) {
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
        if ((mirror || general) && volume(operation.Shape()) <= 0)
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
