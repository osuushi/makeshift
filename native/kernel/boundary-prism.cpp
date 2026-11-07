#include "boundary-move.h"
#include "boundary-validation.h"
#include "scale-transform.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>

namespace boundary_move {
// A translated cap of a straight extrusion defines one affine continuation.
// Internal periodic seam subdivisions follow the wall, rather than pinning it.
std::optional<Result> translatedPrism(const Edit& edit) {
    if (edit.rigidFaces.Extent() != 1 || edit.transform.Form() != gp_Translation) return std::nullopt;
    const auto cap = TopoDS::Face(edit.rigidFaces(1));
    const BRepAdaptor_Surface selected(cap);
    if (selected.GetType() != GeomAbs_Plane) return std::nullopt;
    const auto plane = selected.Plane();
    const gp_Vec normal(plane.Axis().Direction());
    std::optional<gp_Pln> base;
    int walls = 0;
    for (const auto& face : faces(edit.body->shape)) {
        if (face.IsSame(cap)) continue;
        const BRepAdaptor_Surface surface(face);
        if (surface.GetType() == GeomAbs_Plane) {
            if (base || !surface.Plane().Axis().IsParallel(plane.Axis(), 1e-10)) return std::nullopt;
            base = surface.Plane();
        } else if (surface.GetType() == GeomAbs_Cylinder &&
                   surface.Cylinder().Axis().IsParallel(plane.Axis(), 1e-10)) ++walls;
        else return std::nullopt;
    }
    if (!base || !walls) return std::nullopt;
    const double height = gp_Vec(base->Location(), plane.Location()).Dot(normal);
    if (std::abs(height) < boundaryDistanceMm) return std::nullopt;
    const auto travel = edit.transform.TranslationPart();
    gp_GTrsf shear;
    for (int row = 1; row <= 3; ++row) {
        for (int column = 1; column <= 3; ++column)
            shear.SetValue(row, column, (row == column ? 1.0 : 0.0) +
                           travel.Coord(row) * normal.Coord(column) / height);
        shear.SetValue(row, 4, -travel.Coord(row) * gp_Vec(base->Location().XYZ()).Dot(normal) / height);
    }
    require(shear.VectorialPart().Determinant() > 1e-8, "Movement collapses or inverts the extrusion");
    BRepBuilderAPI_GTransform operation(edit.body->shape, shear, true);
    require(operation.IsDone(), "Cannot continue the extrusion walls");
    const auto supports = affineSupports(edit.body->shape, shear, operation);
    Result result{supports->Apply(operation.Shape()), {}, {edit.body->id}, {}};
    valid(result.shape, "Translated extrusion cap");
    for (const auto& entity : edit.body->entities)
        result.predecessors.push_back({entity.id, supports->Apply(operation.ModifiedShape(entity.shape))});
    return result;
}
}
