#include "edge-finish-inspection.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_SurfaceOfLinearExtrusion.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>
#include <vector>

namespace {
bool convertExtrusion(const TopoDS_Face& face) {
    TopLoc_Location location;
    const auto surface = BRep_Tool::Surface(face, location);
    const auto extrusion = Handle(Geom_SurfaceOfLinearExtrusion)::DownCast(surface);
    if (extrusion.IsNull()) return false;
    const auto curve = Handle(Geom_BezierCurve)::DownCast(extrusion->BasisCurve());
    if (curve.IsNull() || curve->IsRational()) return false;
    double u0, u1, v0, v1;
    BRepTools::UVBounds(face, u0, u1, v0, v1);
    if (!std::isfinite(v0) || !std::isfinite(v1) || v1 <= v0) return false;

    // Exact tensor product, retaining both original parameter coordinates.
    // Generic trimmed-surface conversion can reparameterize the Bezier curve.
    TColgp_Array2OfPnt poles(1, curve->NbPoles(), 1, 2);
    for (int i = 1; i <= curve->NbPoles(); ++i) {
        poles(i, 1) = curve->Pole(i).Translated(gp_Vec(extrusion->Direction()) * v0);
        poles(i, 2) = curve->Pole(i).Translated(gp_Vec(extrusion->Direction()) * v1);
    }
    TColStd_Array1OfReal uk(1, 2), vk(1, 2);
    uk(1) = 0; uk(2) = 1; vk(1) = v0; vk(2) = v1;
    TColStd_Array1OfInteger um(1, 2), vm(1, 2);
    um.Init(curve->Degree() + 1); vm.Init(2);
    Handle(Geom_BSplineSurface) spline = new Geom_BSplineSurface(
        poles, uk, vk, um, vm, curve->Degree(), 1);
    std::vector<std::pair<TopoDS_Edge, Handle(Geom2d_Curve)>> pcurves;
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current());
        if (BRep_Tool::IsClosed(edge, face)) return false;
        double first, last;
        const auto pcurve = BRep_Tool::CurveOnSurface(edge, face, first, last);
        if (pcurve.IsNull()) return false;
        pcurves.emplace_back(edge, pcurve);
    }
    BRep_Builder builder;
    builder.UpdateFace(face, spline, location, BRep_Tool::Tolerance(face));
    for (const auto& [edge, pcurve] : pcurves)
        builder.UpdateEdge(edge, pcurve, face, BRep_Tool::Tolerance(edge));
    return true;
}
}

TopoDS_Shape finishInspectionCopy(const TopoDS_Shape& shape) {
    const auto copy = BRepBuilderAPI_Copy(shape, true, false).Shape();
    bool changed = false;
    for (TopExp_Explorer f(copy, TopAbs_FACE); f.More(); f.Next())
        changed |= convertExtrusion(TopoDS::Face(f.Current()));
    if (!changed || !BRepCheck_Analyzer(copy, true, false, true).IsValid())
        throw std::runtime_error("Cannot verify edge-finish intersections");
    return copy;
}
