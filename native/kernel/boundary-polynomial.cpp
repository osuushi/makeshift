#include "boundary-move.h"
#include "boundary-validation.h"
#include "offset-repair.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GeomConvert.hxx>
#include <GeomFill_BSplineCurves.hxx>
#include <array>

namespace boundary_move {
TopoDS_Face polynomialQuad(const TopoDS_Face& source,const std::vector<TopoDS_Edge>& edges) {
    if (edges.size() != 4) return {};
    std::array<Handle(Geom_BSplineCurve),4> curves;
    for (int i = 0; i < 4; ++i) {
        BRepAdaptor_Curve curve(edges[i]);
        if (curve.GetType() == GeomAbs_BezierCurve)
            curves[i] = GeomConvert::CurveToBSplineCurve(curve.Bezier());
        else if (curve.GetType() == GeomAbs_BSplineCurve)
            curves[i] = Handle(Geom_BSplineCurve)::DownCast(curve.BSpline()->Copy());
        else return {};
        if (curves[i]->IsRational()) return {};
        curves[i]->Segment(curve.FirstParameter(),curve.LastParameter());
        if (curves[i]->Degree() < 3) curves[i]->IncreaseDegree(3);
        if (edges[i].Orientation() == TopAbs_REVERSED) curves[i]->Reverse();
    }
    // Algebraic interpolation retains the exact polynomial rims, including
    // multi-span cubic boundaries produced by curved interior reconstruction.
    GeomFill_BSplineCurves filling(curves[0],curves[1],curves[2],curves[3],GeomFill_CoonsStyle);
    BRepBuilderAPI_MakeFace face(filling.Surface(),1e-7);
    require(face.IsDone(),"Cannot reconnect the polynomial boundary patch");
    offset_geometry::tightenGeneratedBoundaries(face.Face(),source,false);
    return face.Face();
}
}
