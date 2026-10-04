#include "extrude-twist-curves.h"
#include "circular-rim.h"
#include <Approx_CurvilinearParameter.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <Geom_BSplineCurve.hxx>
#include <TopExp.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

std::optional<gp_Pnt> twistCircleCenter(const TopoDS_Wire& wire) {
    BRepTools_WireExplorer e(wire);
    if (!e.More()) return {};
    const auto circle = circularRim(e.Current());
    if (!circle) return {};
    e.Next();
    if (e.More()) return {};
    return circle->Location();
}

TopoDS_Wire twistLoftSection(const TopoDS_Wire& wire) {
    // ThruSections approximates conics before lofting. Supplying the exact
    // rational circle avoids its high-degree polynomial full-circle fit.
    return twistCircleCenter(wire)
        ? TopoDS::Wire(BRepBuilderAPI_NurbsConvert(wire, true).Shape()) : wire;
}

TopoDS_Wire twistSectionParameters(const TopoDS_Wire& wire) {
    // MakeDraft's section curves do not share the original Bézier parameter
    // speed. Curvilinear parameters avoid an artificial discontinuity at the
    // source when lofting those geometrically continuing curves.
    BRepBuilderAPI_MakeWire result;
    const auto copy = TopoDS::Wire(BRepBuilderAPI_Copy(wire).Shape());
    for (BRepTools_WireExplorer e(copy); e.More(); e.Next()) {
        Handle(BRepAdaptor_Curve) curve = new BRepAdaptor_Curve(e.Current());
        Approx_CurvilinearParameter approximation(curve, 1e-6, GeomAbs_C1, 14, 200);
        if (!approximation.IsDone() || approximation.MaxError3d() > 1e-5)
            throw std::runtime_error("Twisted draft boundary cannot meet parameterization accuracy");
        const auto geometry = approximation.Curve3d();
        if (e.Current().Orientation() == TopAbs_REVERSED) geometry->Reverse();
        // Keep the section's shared vertices and existing draft tolerances;
        // independently constructed endpoints would lose its sewn junctions.
        result.Add(BRepBuilderAPI_MakeEdge(geometry, TopExp::FirstVertex(e.Current(), true),
            TopExp::LastVertex(e.Current(), true), geometry->FirstParameter(), geometry->LastParameter()));
    }
    if (!result.IsDone()) throw std::runtime_error("Cannot connect twisted draft section edges");
    return result.Wire();
}
