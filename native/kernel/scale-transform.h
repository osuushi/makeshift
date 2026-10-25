#pragma once
#include "kernel.h"
#include <BRepBuilderAPI_GTransform.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <gp_GTrsf.hxx>
#include <BRepTools_ReShape.hxx>
#include <cmath>

inline gp_GTrsf scaleTransform(const Tree& input) {
    const auto pivot = point(input.get_child("pivot"));
    const double factor = input.get<double>("factor");
    const auto values = input.get_child_optional("factors");
    const auto factors = values ? point(*values) : gp_Pnt(factor, factor, factor);
    if (factors.X() == factors.Y() && factors.Y() == factors.Z()) {
        if (!std::isfinite(factors.X()) || factors.X() <= 0 ||
            !std::isfinite(pivot.X()) || !std::isfinite(pivot.Y()) || !std::isfinite(pivot.Z()))
            throw std::runtime_error("Enter a positive finite transform factor and a finite pivot");
        gp_Trsf uniform;
        uniform.SetScale(pivot, factors.X());
        return gp_GTrsf(uniform);
    }
    gp_GTrsf result;
    for (int i = 1; i <= 3; ++i) {
        const double f = factors.Coord(i), p = pivot.Coord(i);
        if (!std::isfinite(f) || f <= 0 || !std::isfinite(p))
            throw std::runtime_error("Enter positive finite transform factors and a finite pivot");
        result.SetValue(i, i, f);
        result.SetValue(i, 4, p * (1 - f));
    }
    return result;
}

TopoDS_Face affineCylinder(const TopoDS_Face&, const gp_GTrsf&, BRepBuilderAPI_GTransform&);

Handle(BRepTools_ReShape) affineSupports(const TopoDS_Shape&, const gp_GTrsf&,
                                     BRepBuilderAPI_GTransform&);

inline TopoDS_Shape affineShape(const TopoDS_Shape& shape, const gp_GTrsf& transform) {
    if (transform.Form() != gp_Other)
        return BRepBuilderAPI_Transform(shape, transform.Trsf(), true).Shape();
    BRepBuilderAPI_GTransform operation(shape, transform, true);
    return affineSupports(shape, transform, operation)->Apply(operation.Shape());
}
