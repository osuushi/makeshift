#include "mesh-fit.h"
#include "offset-geometry.h"
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <Geom_BezierSurface.hxx>
#include <GeomLib_IsPlanarSurface.hxx>
#include <BRepTools.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Wire.hxx>
#include <stdexcept>

namespace mesh_fit {
TopoDS_Shape assemble(const Network& n, const Input& input) {
    // Fit allowance never becomes a sewing tolerance. Boundaries share the same controls.
    BRepBuilderAPI_Sewing sewing(1e-7);
    for (const auto& patch : n.patches) {
        TColgp_Array2OfPnt poles(1,4,1,4);
        for (int i = 0; i < 4; ++i) for (int j = 0; j < 4; ++j)
            poles.SetValue(i+1,j+1,gp_Pnt(n.controls[patch.controls[i*4+j]]*input.scale+input.origin));
        const Handle(Geom_BezierSurface) surface = new Geom_BezierSurface(poles);
        BRepBuilderAPI_MakeFace face(surface,1e-7);
        if (!face.IsDone()) throw std::runtime_error("Could not construct fitted surface face");
        const GeomLib_IsPlanarSurface planar(surface,1e-9);
        if (planar.IsPlanar()) {
            auto plane = planar.Plan();
            gp_Pnt p; gp_Vec du,dv; surface->D1(0.5,0.5,p,du,dv);
            if (plane.Axis().Direction().Dot(gp_Dir(du.Crossed(dv))) < 0) plane.UReverse();
            BRepBuilderAPI_MakeFace flat(plane,BRepTools::OuterWire(face.Face()),true);
            if (!flat.IsDone()) throw std::runtime_error("Could not preserve fitted planar face");
            sewing.Add(flat.Face());
        } else sewing.Add(face.Face());
    }
    sewing.Perform();
    const auto shell = sewing.SewedShape();
    if (shell.IsNull() || shell.ShapeType() != TopAbs_SHELL || sewing.NbFreeEdges() || sewing.NbMultipleEdges())
        throw std::runtime_error("Fitted surfaces do not form one closed manifold shell");
    BRepBuilderAPI_MakeSolid builder(TopoDS::Shell(shell));
    if (!builder.IsDone()) throw std::runtime_error("Could not form a fitted solid");
    auto solid = builder.Solid();
    if (!BRepLib::OrientClosedSolid(solid)) throw std::runtime_error("Could not orient fitted solid");
    offset_geometry::validSolid(solid,"Mesh reconstruction");
    TopTools_IndexedMapOfShape faces, edges, vertices;
    TopExp::MapShapes(solid,TopAbs_FACE,faces); TopExp::MapShapes(solid,TopAbs_EDGE,edges);
    TopExp::MapShapes(solid,TopAbs_VERTEX,vertices);
    if (faces.Extent() != int(n.patches.size()) || vertices.Extent() != int(n.layout.vertices.size()) ||
        edges.Extent() != int(n.patches.size()*2))
        throw std::runtime_error("Sewing changed the fitted quad layout topology");
    return solid;
}
}
