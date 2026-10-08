#include "kernel.h"
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
// Repartitioning spline faces changes ordinary quadrature; compare both halves
// and their union with the same adaptive integration accuracy.
double adaptiveVolume(const TopoDS_Shape& shape) {
    GProp_GProps props; BRepGProp::VolumeProperties(shape, props, 1e-10);
    return props.Mass();
}
TopoDS_Shape half(const TopoDS_Face& face, const gp_Vec& travel, const Tree& input) {
    return input.get_child_optional("twist")
        ? extrudeTwist(face, travel, input) : extrudeDraft(face, travel, input);
}
TopoDS_Shape centeredPrism(const TopoDS_Face& face, const gp_Vec& travel) {
    gp_Trsf shift;
    shift.SetTranslation(travel * -0.5);
    const auto start = TopoDS::Face(BRepBuilderAPI_Transform(face, shift, true).Shape());
    BRepPrimAPI_MakePrism prism(start, travel, true);
    if (!prism.IsDone()) throw std::runtime_error("Extrusion failed");
    return prism.Shape();
}
}

TopoDS_Shape extrudeProfile(const TopoDS_Face& face, const gp_Vec& travel, const Tree& input) {
    if (!input.get<bool>("symmetric", false)) return half(face, travel, input);
    // Constant sections form one exact prism. The half-depth draft calculation
    // retains the existing validation and zero-offset threshold for this path.
    if (!input.get_child_optional("twist") &&
        std::abs(extrusionDraftOffset(travel * 0.5, input)) < 1e-10)
        return centeredPrism(face, travel);
    Tree forward = input, backward = input;
    if (input.get_child_optional("twist")) {
        const auto angle = input.get<double>("twist.angle");
        forward.put("twist.angle", angle / 2);
        backward.put("twist.angle", -angle / 2);
    }
    // Draft offset remains the displacement per wall at either cap. Angle mode
    // naturally uses half the total depth; the unchanged source is the midplane.
    const auto a = half(face, travel * 0.5, forward);
    const auto b = half(face, travel * -0.5, backward);
    validate(a); validate(b);
    const double expected = adaptiveVolume(a) + adaptiveVolume(b);
    std::vector<SourceEntity> unused;
    const auto result = booleanShape(a, b, "union", unused);
    validate(result);
    if (expected <= 1e-10 || std::abs(adaptiveVolume(result) - expected) > 1e-6 * std::max(1.0, expected))
        throw std::runtime_error("Symmetric extrusion halves could not be joined");
    return result;
}
