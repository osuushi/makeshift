#include "boolean-uv-self-tests.h"
#include "boolean-trims.h"
#include "boolean-torus-bounds.h"
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <ElSLib.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp.hxx>
#include <gp_Pln.hxx>
#include <cmath>
#include <stdexcept>

void boolean_uv::testTrimRegions() {
    const auto square = [](double x, double y, double size) {
        BRepBuilderAPI_MakePolygon polygon;
        polygon.Add(gp_Pnt(x,y,0)); polygon.Add(gp_Pnt(x+size,y,0));
        polygon.Add(gp_Pnt(x+size,y+size,0)); polygon.Add(gp_Pnt(x,y+size,0));
        polygon.Close(); return polygon.Wire();
    };
    const gp_Pln plane(gp::XOY());
    BRepBuilderAPI_MakeFace face(plane,square(-10,-10,20));
    face.Add(TopoDS::Wire(square(-3,-3,6).Reversed()));
    TrimRegion region(face.Face());
    if (!region.outside({-0.5,0.5,-0.5,0.5}))
        throw std::runtime_error("Trim hole interior was not excluded");
    if (region.outside({5,6,5,6}) || region.outside({2.9,3.1,-0.5,0.5}))
        throw std::runtime_error("Trim material or boundary cell was excluded");
    // A small material island misses the center and corners of this cell.
    TrimRegion island(BRepBuilderAPI_MakeFace(plane,square(0.2,0.2,0.01)).Face());
    if (island.outside({-1,1,-1,1}))
        throw std::runtime_error("Small trim island was incorrectly excluded");
}

void boolean_uv::testTorusBounds() {
    const double pi = std::acos(-1.0);
    const gp_Torus torus(gp_Ax3(gp_Pnt(17,-11,3),gp_Dir(1,2,3)),13,7);
    for (int i = 0; i < 80; ++i) {
        const double u = -2*pi+i*pi/17, v = -2*pi+i*pi/23;
        const std::array<double,4> uv{u,u+pi/(i%7+1),v,v+pi/(i%11+1)};
        Bnd_Box box; boundTorus(torus,uv,0,box);
        for (int a = 0; a <= 20; ++a) for (int b = 0; b <= 20; ++b)
            if (box.IsOut(ElSLib::Value(u+(uv[1]-u)*a/20,v+(uv[3]-v)*b/20,torus)))
                throw std::runtime_error("Torus interval enclosure missed a sampled point");
    }
}
