#include "edge-finish-construction.h"
#include "timing.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepLib.hxx>
#include <BRepLib_CheckCurveOnSurface.hxx>
#include <BRepTools_History.hxx>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <Geom_Curve.hxx>
#include <ShapeBuild_ReShape.hxx>
#include <ShapeFix_ShapeTolerance.hxx>
#include <ShapeUpgrade_ShapeDivideClosed.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <set>
#include <stdexcept>

namespace {
void refineCurves(const TopoDS_Shape& shape, double tolerance) {
    TopTools_MapOfShape visited;
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current());
        if (!visited.Add(edge) || BRep_Tool::Degenerated(edge)) continue;
        const bool rebuild = BRep_Tool::Tolerance(edge) > tolerance;
        // The divider constructs missing 3D curves at a 1e-5 mm floor. Rebuild
        // from its exact pcurves at source precision instead of accepting that
        // enlarged tolerance or merely relabeling the approximate curve.
        if (rebuild) {
            BRep_Builder().UpdateEdge(edge, Handle(Geom_Curve)(), tolerance);
            if (!BRepLib::BuildCurve3d(edge, tolerance * 0.1))
                throw std::runtime_error("Cannot rebuild the blend partition curve");
        }
        if (rebuild || !BRep_Tool::SameRange(edge) || !BRep_Tool::SameParameter(edge)) {
            BRepLib::SameRange(edge, tolerance * 0.1);
            BRepLib::SameParameter(edge, tolerance, true);
        }
    }
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next())
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (BRep_Tool::Degenerated(edge)) continue;
            BRepLib_CheckCurveOnSurface check(edge, TopoDS::Face(f.Current()));
            check.Perform();
            if (!BRep_Tool::SameParameter(edge) || !check.IsDone() ||
                !std::isfinite(check.MaxDistance()) || check.MaxDistance() > tolerance)
                throw std::runtime_error("Blend partition exceeded source precision");
        }
    ShapeFix_ShapeTolerance().LimitTolerance(shape, 0, tolerance);
    validate(shape);
}
TopoDS_Shape partition(const TopoDS_Shape& source, std::vector<SourceEntity>& origins) {
    TopTools_MapOfShape selected, original;
    double tolerance = 1e-7;
    TopExp::MapShapes(source, original);
    for (TopExp_Explorer f(source, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        tolerance = std::max(tolerance, BRep_Tool::Tolerance(face));
        // Intersections between periodic rounds can otherwise classify a closed
        // patch on the wrong side and leave a reversed cap across an opening.
        if (BRepAdaptor_Surface(face).GetType() != GeomAbs_Torus) continue;
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
            if (BRep_Tool::IsClosed(TopoDS::Edge(e.Current()), face)) { selected.Add(face); break; }
    }
    if (selected.IsEmpty()) return source;
    for (TopExp_Explorer e(source, TopAbs_EDGE); e.More(); e.Next())
        tolerance = std::max(tolerance, BRep_Tool::Tolerance(TopoDS::Edge(e.Current())));
    for (TopExp_Explorer v(source, TopAbs_VERTEX); v.More(); v.Next())
        tolerance = std::max(tolerance, BRep_Tool::Tolerance(TopoDS::Vertex(v.Current())));
    BRepBuilderAPI_Copy copy(source, true, false);
    ShapeUpgrade_ShapeDivideClosed split(copy.Shape());
    split.SetNbSplitPoints(1);
    split.SetPrecision(1e-7);
    split.SetMinTolerance(1e-7);
    split.SetMaxTolerance(tolerance);
    split.Perform();
    if (split.Status(ShapeExtend_FAIL)) throw std::runtime_error("Cannot partition the blend boundary");
    const auto context = split.GetContext();
    const auto shape = split.Result();
    refineCurves(shape, tolerance);
    std::vector<SourceEntity> mapped;
    for (const auto& origin : origins) {
        if (!original.Contains(origin.shape)) { mapped.push_back(origin); continue; }
        const auto replacement = context->Apply(copy.ModifiedShape(origin.shape));
        if (replacement.ShapeType() == origin.shape.ShapeType()) mapped.push_back({origin.id, replacement});
        else for (TopExp_Explorer p(replacement, origin.shape.ShapeType()); p.More(); p.Next())
            mapped.push_back({origin.id, p.Current()});
    }
    origins = std::move(mapped);
    return shape;
}
}

TopoDS_Shape trimEdgeFinish(const TopoDS_Shape& finished, const TopoDS_Shape& interruptions,
                           std::vector<SourceEntity>& origins) {
    KernelTiming timing("edge-finish-trim");
    TopTools_MapOfShape originalSeams;
    for (const auto& source : {finished, interruptions})
        for (TopExp_Explorer f(source, TopAbs_FACE); f.More(); f.Next())
            for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next())
                if (BRep_Tool::IsClosed(TopoDS::Edge(e.Current()), TopoDS::Face(f.Current()))) originalSeams.Add(e.Current());
    std::set<std::string> seamIds;
    for (const auto& origin : origins)
        if (originalSeams.Contains(origin.shape)) seamIds.insert(origin.id);
    const auto a = partition(finished, origins);
    timing.phase("finish-partition");
    const auto b = partition(interruptions, origins);
    timing.phase("cavity-partition");
    const auto trimmed = booleanShape(a, b, "subtract", origins);
    timing.phase("cut");
    // Remove temporary seams while retaining exact analytic surfaces and history.
    ShapeUpgrade_UnifySameDomain unify(trimmed, true, true, false);
    unify.SetSafeInputMode(true);
    TopTools_MapOfShape seams;
    for (TopExp_Explorer f(trimmed, TopAbs_FACE); f.More(); f.Next())
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next())
            if (BRep_Tool::IsClosed(TopoDS::Edge(e.Current()), TopoDS::Face(f.Current()))) seams.Add(e.Current());
    for (const auto& origin : origins)
        if (origin.shape.ShapeType() == TopAbs_EDGE && !seamIds.count(origin.id) && !seams.Contains(origin.shape))
            unify.KeepShape(origin.shape);
    unify.Build();
    validate(unify.Shape());
    timing.phase("unify");
    const auto history = unify.History();
    std::vector<SourceEntity> mapped;
    for (const auto& origin : origins) {
        if (!history->IsRemoved(origin.shape)) mapped.push_back(origin);
        for (TopTools_ListIteratorOfListOfShape i(history->Modified(origin.shape)); i.More(); i.Next())
            if (i.Value().ShapeType() == origin.shape.ShapeType()) mapped.push_back({origin.id, i.Value()});
    }
    origins = std::move(mapped);
    return unify.Shape();
}
