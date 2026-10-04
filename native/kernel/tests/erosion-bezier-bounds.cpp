#include "erosion-distance-bounds.h"
#include "erosion-bezier-bounds.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <Geom_BezierSurface.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GeomConvert.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

namespace {
void verify(const Handle(Geom_Surface)& surface) {
    const auto source = BRepBuilderAPI_MakeFace(surface,.13,.87,.21,.93,1e-7).Face();
    gp_Trsf rotation; rotation.SetRotation(gp_Ax1(gp_Pnt(),gp_Dir(1,2,3)),.7);
    rotation.SetTranslationPart(gp_Vec(25,-18,31));
    for (bool copy : {false,true}) {
        const auto face = TopoDS::Face(BRepBuilderAPI_Transform(source,rotation,copy).Shape());
        erosion::BoundaryDistance bounds(face);
        BRepAdaptor_Surface actual(face);
        erosion::BezierBounds hulls(actual);
        if (hulls.lower({100,100,100}) < 100)
            throw std::runtime_error("Polynomial surface bounds were not constructed");
        for (int i = 0; i < 30; ++i) {
            const double u = .13+.74*((i*7)%29)/29, v = .21+.72*((i*11)%29)/29;
            const auto onSurface = actual.Value(u,v);
            const gp_Pnt point = onSurface.Translated(gp_Vec(.4,-.9,(i-15)*.21));
            BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(point).Shape(),face);
            if (!distance.IsDone() || bounds.lower(point) > distance.Value()+1e-6 ||
                bounds.upper(point) < distance.Value()-1e-6)
                throw std::runtime_error("Transformed trimmed polynomial distance bounds are not conservative");
            std::array<gp_Pnt,8> corners;
            for (int j = 0; j < 8; ++j) corners[j] = onSurface.Translated(gp_Vec(
                j&1 ? .001 : -.001,j&2 ? .001 : -.001,j&4 ? .001 : -.001));
            if (!bounds.crosses(corners))
                throw std::runtime_error("Polynomial bounds missed an actual surface crossing");
        }
    }
}
Handle(Geom_BSplineSurface) periodicSurface() {
    TColgp_Array2OfPnt poles(1,16,1,5);
    for (int i = 0; i < 16; ++i) for (int j = 0; j < 5; ++j) {
        const double angle = 2*std::acos(-1.0)*i/16, radius = 3+.3*std::sin(j*1.2);
        poles.SetValue(i+1,j+1,gp_Pnt(radius*std::cos(angle),radius*std::sin(angle),j*2));
    }
    TColStd_Array1OfReal u(1,17), v(1,3);
    TColStd_Array1OfInteger um(1,17), vm(1,3);
    for (int i = 1; i <= 17; ++i) { u(i) = double(i-1)/16; um(i) = 1; }
    for (int i = 1; i <= 3; ++i) { v(i) = double(i-1)/2; vm(i) = i == 2 ? 1 : 4; }
    return new Geom_BSplineSurface(poles,u,v,um,vm,3,3,true,false);
}
}
void bezierDistanceBounds() {
    TColgp_Array2OfPnt poles(1,4,1,4);
    for (int u = 1; u <= 4; ++u) for (int v = 1; v <= 4; ++v)
        poles.SetValue(u,v,gp_Pnt(u*2,v*3,2*std::sin(u*1.2)*std::cos(v*.8)));
    Handle(Geom_BezierSurface) surface = new Geom_BezierSurface(poles);
    verify(surface);
    auto spline = GeomConvert::SurfaceToBSplineSurface(surface);
    spline->InsertUKnot(.35,1,1e-12);
    spline->InsertUKnot(.72,1,1e-12);
    spline->InsertVKnot(.43,1,1e-12);
    verify(spline);
    verify(periodicSurface());
}
