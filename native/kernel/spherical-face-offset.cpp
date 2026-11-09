#include "calculation-failure.h"
#include "spherical-face-offset.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepTools_ReShape.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Sphere.hxx>
#include <stdexcept>

std::optional<Result> sphericalFaceOffset(const Operand& body,
        const std::vector<TopoDS_Face>& selected, double distance) {
    if (selected.size() != 1) return {};
    const auto face = selected.front();
    const BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Sphere) return {};
    // Only an entire closed one-face shell can change radius without retrimming.
    TopoDS_Shape shell;
    for (TopExp_Explorer it(body.shape, TopAbs_SHELL); it.More(); it.Next()) {
        TopTools_IndexedMapOfShape faces;
        TopExp::MapShapes(it.Current(), TopAbs_FACE, faces);
        if (faces.Extent() == 1 && faces(1).IsSame(face) && BRep_Tool::IsClosed(it.Current())) {
            shell = it.Current(); break;
        }
    }
    if (shell.IsNull()) return {};
    const auto sphere = surface.Sphere();
    const double sign = (face.Orientation() == TopAbs_REVERSED ? -1 : 1) * (sphere.Direct() ? 1 : -1);
    const double radius = sphere.Radius() + sign * distance;
    if (radius <= 1e-7) throw GeometricFailure("Offset would collapse the spherical face");
    gp_Trsf scale;
    scale.SetScale(sphere.Location(), radius / sphere.Radius());
    BRepBuilderAPI_Transform operation(shell, scale, true);
    Handle(BRepTools_ReShape) replacement = new BRepTools_ReShape;
    replacement->Replace(shell, operation.Shape());
    const auto shape = replacement->Apply(body.shape);
    TopoDS_Face moved;
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next())
        if (it.Current().IsSame(operation.ModifiedShape(face))) moved = TopoDS::Face(it.Current());
    if (moved.IsNull()) throw InvalidGeometryFailure("Kernel produced invalid geometry: spherical offset lost its face");
    offset_geometry::checkParallel(face, moved, distance,
                                  "Kernel produced invalid geometry: spherical offset", true);
    offset_geometry::validSolid(shape, "Kernel produced invalid geometry: spherical offset");
    checkOffsetVolume(body.shape, shape, distance);
    TopTools_IndexedMapOfShape members;
    TopExp::MapShapes(shell, members);
    std::vector<SourceEntity> origins;
    for (const auto& source : body.entities)
        origins.push_back({source.id, members.Contains(source.shape) ? operation.ModifiedShape(source.shape) : source.shape});
    return Result{shape, origins, {body.id}, {moved}};
}
