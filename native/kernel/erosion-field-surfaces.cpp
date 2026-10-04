#include "erosion-field-planar.h"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <GeomAPI_Interpolate.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <TColgp_HArray1OfPnt.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TColStd_HArray1OfReal.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <stdexcept>

namespace erosion::sections {
namespace {
Handle(Geom_BSplineSurface) periodicSurface(const std::vector<Loops>& rows,size_t ring) {
    const int around = int(rows[0][ring].size()), along = int(rows.size());
    TColgp_Array2OfPnt poles(1,around,1,along);
    for (int u = 0; u < around; ++u) for (int v = 0; v < along; ++v)
        poles(u+1,v+1) = gp_Pnt(rows[v][ring][u]);
    TColStd_Array1OfReal uk(1,around+1), vk(1,along+1);
    TColStd_Array1OfInteger um(1,around+1), vm(1,along+1);
    for (int u = 1; u <= around+1; ++u) { uk(u) = double(u-1)/around; um(u) = 1; }
    for (int v = 1; v <= along+1; ++v) { vk(v) = double(v-1)/along; vm(v) = 1; }
    // Convex longitudinal weights avoid interpolation overshoot at thin necks.
    // This remains an approximation, measured against the unfiltered mesh.
    return new Geom_BSplineSurface(poles,uk,vk,um,vm,3,3,true,true);
}
Handle(Geom_BSplineSurface) surface(const std::vector<Loops>& rows,size_t ring,double spacing,bool periodic) {
    if (periodic) return periodicSurface(rows,ring);
    const int around = int(rows[0][ring].size()), along = int(rows.size());
    std::vector<Handle(Geom_BSplineCurve)> curves;
    for (int i = 0; i < around; ++i) {
        Handle(TColgp_HArray1OfPnt) points = new TColgp_HArray1OfPnt(1,along);
        Handle(TColStd_HArray1OfReal) parameters = new TColStd_HArray1OfReal(1,along);
        for (int j = 0; j < along; ++j) {
            points->SetValue(j+1,gp_Pnt(rows[j][ring][i]));
            parameters->SetValue(j+1,double(j)/(along-1));
        }
        GeomAPI_Interpolate interpolate(points,parameters,false,1e-9);
        interpolate.Perform();
        if (!interpolate.IsDone()) throw std::runtime_error("Could not interpolate erosion sections");
        curves.push_back(interpolate.Curve());
    }
    TColgp_Array2OfPnt poles(1,around,1,curves[0]->NbPoles());
    for (int i = 0; i < around; ++i) for (int j = 1; j <= curves[i]->NbPoles(); ++j)
        poles(i+1,j) = curves[i]->Pole(j);
    TColStd_Array1OfReal uk(1,around+1), vk(1,curves[0]->NbKnots());
    TColStd_Array1OfInteger um(1,around+1), vm(1,curves[0]->NbKnots());
    for (int i = 1; i <= around+1; ++i) { uk(i) = double(i-1)/around; um(i) = 1; }
    curves[0]->Knots(vk); curves[0]->Multiplicities(vm);
    Handle(Geom_BSplineSurface) result = new Geom_BSplineSurface(poles,uk,vk,um,vm,3,3,true,false);
    // Remove redundant height knots on straight walls. This is only a proposal;
    // final geometry is independently validated as a closed solid.
    for (int i = result->NbVKnots()-1; i > 1; --i) result->RemoveVKnot(i,0,spacing/100);
    return result;
}
std::array<TopoDS_Wire,2> addSide(BRepBuilderAPI_Sewing& sewing,const Handle(Geom_BSplineSurface)& surface,int vertical) {
    std::array<BRepBuilderAPI_MakeWire,2> caps;
    for (int u = 0; u < 8; ++u) {
        auto strip = Handle(Geom_BSplineSurface)::DownCast(surface->Copy());
        strip->Segment(double(u)/8,double(u+1)/8,0,1);
        for (int v = 0; v < vertical; ++v) {
            auto patch = Handle(Geom_BSplineSurface)::DownCast(strip->Copy());
            patch->Segment(double(u)/8,double(u+1)/8,double(v)/vertical,double(v+1)/vertical);
            sewing.Add(BRepBuilderAPI_MakeFace(patch,1e-7).Face());
        }
        for (int end : {0,1}) caps[end].Add(BRepBuilderAPI_MakeEdge(strip->VIso(end)).Edge());
    }
    return {caps[0].Wire(),caps[1].Wire()};
}
}
TopoDS_Shape solid(const std::vector<Loops>& rows,const std::array<mesh_fit::V,2>& capNormals,double spacing,int maxFaces,bool periodic) {
    BRepBuilderAPI_Sewing sewing(1e-7);
    std::vector<std::array<TopoDS_Wire,2>> rings;
    const int vertical = std::min(4,(maxFaces-2)/(8*int(rows[0].size())));
    if (vertical < 1) throw std::runtime_error("CAD face budget cannot preserve these section loops");
    for (size_t ring = 0; ring < rows[0].size(); ++ring)
        rings.push_back(addSide(sewing,surface(rows,ring,spacing,periodic),vertical));
    for (int end = 0; !periodic && end < 2; ++end) {
        const gp_Pln plane{gp_Pnt(rows[end ? rows.size()-1 : 0][0][0]),gp_Dir(capNormals[end])};
        BRepBuilderAPI_MakeFace cap(plane,rings[0][end],true);
        for (size_t ring = 1; ring < rings.size(); ++ring)
            cap.Add(TopoDS::Wire(rings[ring][end].Reversed()));
        if (!cap.IsDone()) throw std::runtime_error("Could not cap erosion sections");
        sewing.Add(cap.Face());
    }
    sewing.Perform();
    if (sewing.NbFreeEdges() || sewing.NbMultipleEdges() || sewing.SewedShape().ShapeType() != TopAbs_SHELL)
        throw std::runtime_error("Erosion sections do not form a closed surface");
    auto result = BRepBuilderAPI_MakeSolid(TopoDS::Shell(sewing.SewedShape())).Solid();
    if (!BRepLib::OrientClosedSolid(result)) throw std::runtime_error("Cannot orient erosion section surface");
    return result;
}
}
