#include "mesh-fit-analytic.h"
#include "offset-geometry.h"
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Sphere.hxx>
#include <cmath>
#include <stdexcept>

namespace mesh_fit::analytic {
TopoDS_Shape assemble(const Candidate& c,const Input& input) {
    const double radius = c.radius*input.scale, height = (c.high-c.low)*input.scale;
    const gp_Pnt center(c.center*input.scale+input.origin);
    const gp_Ax2 axis(gp_Pnt((c.center+c.axis*c.low)*input.scale+input.origin),gp_Dir(c.axis));
    if (c.kind == Kind::Sphere) return BRepPrimAPI_MakeSphere(center,radius).Shape();
    if (c.kind == Kind::Cylinder) return BRepPrimAPI_MakeCylinder(axis,radius,height).Shape();
    const double pi = std::acos(-1.0);
    auto upper = axis; upper.SetLocation(gp_Pnt((c.center+c.axis*c.high)*input.scale+input.origin));
    // Exact common equators and axis; no approximate post-hoc replacement of spline edges.
    BRepBuilderAPI_Sewing sewing(1e-7);
    sewing.Add(BRepBuilderAPI_MakeFace(gp_Cylinder(gp_Ax3(axis),radius),0,2*pi,0,height).Face());
    sewing.Add(BRepBuilderAPI_MakeFace(gp_Sphere(gp_Ax3(axis),radius),0,2*pi,-pi/2,0).Face());
    sewing.Add(BRepBuilderAPI_MakeFace(gp_Sphere(gp_Ax3(upper),radius),0,2*pi,0,pi/2).Face());
    sewing.Perform();
    const auto shell = sewing.SewedShape();
    if (shell.ShapeType() != TopAbs_SHELL || sewing.NbFreeEdges() || sewing.NbMultipleEdges())
        throw std::runtime_error("Analytic mesh regions do not form one closed shell");
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(shell)).Solid();
    if (!BRepLib::OrientClosedSolid(solid)) throw std::runtime_error("Could not orient analytic mesh regions");
    return solid;
}
std::optional<Result> reconstruct(const Input& input) {
    Search target(input.target,true);
    for (const auto& candidate : candidates(input.target)) {
        auto result = assess(candidate,input,target);
        if (!result) continue;
        try {
            result->shape = assemble(candidate,input);
            offset_geometry::validSolid(result->shape,"Analytic mesh reconstruction");
            TopTools_IndexedMapOfShape faces;
            TopExp::MapShapes(result->shape,TopAbs_FACE,faces);
            if (faces.Extent() != result->planes+result->cylinders+result->spheres) continue;
            return result;
        } catch (const Standard_Failure&) { /* Retain the bicubic route when construction fails. */ }
        catch (const std::runtime_error&) { /* A recognized support alone does not prove a solid. */ }
    }
    return {};
}
}
