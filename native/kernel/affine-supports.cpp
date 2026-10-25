#include "scale-transform.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepTools.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pln.hxx>

// A nonsingular affine map preserves planes exactly. GTransform stores them
// as spline surfaces; restore their analytic supports for subsequent face tools,
// retaining its exact transformed wires and edge identities.
Handle(BRepTools_ReShape) affineSupports(const TopoDS_Shape& source, const gp_GTrsf& transform,
                                     BRepBuilderAPI_GTransform& operation) {
    Handle(BRepTools_ReShape) replacements = new BRepTools_ReShape;
    for (TopExp_Explorer it(source, TopAbs_FACE); it.More(); it.Next()) {
        const auto original = TopoDS::Face(it.Current());
        BRepAdaptor_Surface support(original);
        if (support.GetType() == GeomAbs_Cylinder) {
            const auto cylinder = affineCylinder(original, transform, operation);
            if (!cylinder.IsNull()) replacements->Replace(operation.ModifiedShape(original), cylinder);
        }
        if (support.GetType() != GeomAbs_Plane) continue;
        const auto plane = support.Plane();
        auto origin = plane.Location().XYZ();
        transform.Transforms(origin);
        const auto matrix = transform.VectorialPart();
        const gp_Vec u(matrix * plane.Position().XDirection().XYZ());
        const gp_Vec v(matrix * plane.Position().YDirection().XYZ());
        const gp_Pln next(gp_Ax3(gp_Pnt(origin), gp_Dir(u.Crossed(v)), gp_Dir(u)));
        const auto mapped = TopoDS::Face(operation.ModifiedShape(original));
        auto forward = mapped;
        forward.Orientation(TopAbs_FORWARD);
        const auto outer = BRepTools::OuterWire(forward);
        BRepBuilderAPI_MakeFace builder(next, outer, true);
        for (TopExp_Explorer wires(forward, TopAbs_WIRE); wires.More(); wires.Next())
            if (!wires.Current().IsSame(outer)) builder.Add(TopoDS::Wire(wires.Current()));
        if (!builder.IsDone()) throw std::runtime_error("Cannot retain transformed planar face");
        auto face = builder.Face();
        face.Orientation(mapped.Orientation());
        replacements->Replace(mapped, face);
    }
    return replacements;
}
