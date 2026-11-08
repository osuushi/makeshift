#include "calculation-failure.h"
#include "boolean-periodic.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRep_Tool.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <ShapeBuild_ReShape.hxx>
#include <ShapeUpgrade_ClosedFaceDivide.hxx>
#include <ShapeUpgrade_WireDivide.hxx>
#include <ShapeFix_ShapeTolerance.hxx>
#include <BRepLib_CheckCurveOnSurface.hxx>
#include <TopExp_Explorer.hxx>
#include <TopExp.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
double preciseVolume(const TopoDS_Shape& shape) {
    GProp_GProps properties;
    BRepGProp::VolumeProperties(shape, properties, 1e-10);
    const double result = std::abs(properties.Mass());
    if (!std::isfinite(result)) throw std::runtime_error("Non-finite periodic solid volume");
    return result;
}
double tolerance(const TopoDS_Shape& shape) {
    double maximum = 1e-7;
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next())
        maximum = std::max(maximum, BRep_Tool::Tolerance(TopoDS::Face(f.Current())));
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next())
        maximum = std::max(maximum, BRep_Tool::Tolerance(TopoDS::Edge(e.Current())));
    for (TopExp_Explorer v(shape, TopAbs_VERTEX); v.More(); v.Next())
        maximum = std::max(maximum, BRep_Tool::Tolerance(TopoDS::Vertex(v.Current())));
    return maximum;
}
TopTools_MapOfShape failedCylinders(const TopoDS_Shape& source,
                                  BRepAlgoAPI_BooleanOperation& failed) {
    TopTools_MapOfShape invalid, selected;
    for (TopExp_Explorer f(failed.Shape(), TopAbs_FACE); f.More(); f.Next()) {
        if (BRepCheck_Analyzer(f.Current()).IsValid()) continue;
        if (BRepAdaptor_Surface(TopoDS::Face(f.Current())).GetType() != GeomAbs_Cylinder)
            return {};
        invalid.Add(f.Current());
    }
    for (TopExp_Explorer f(source, TopAbs_FACE); f.More(); f.Next()) {
        if (BRepAdaptor_Surface(TopoDS::Face(f.Current())).GetType() != GeomAbs_Cylinder) continue;
        if (invalid.Contains(f.Current())) selected.Add(f.Current());
        for (TopTools_ListIteratorOfListOfShape m(failed.Modified(f.Current())); m.More(); m.Next())
            if (invalid.Contains(m.Value())) selected.Add(f.Current());
    }
    return selected;
}
}

TopoDS_Shape splitFailedCutFaces(const TopoDS_Shape& source,
                                BRepAlgoAPI_BooleanOperation& failed,
                                std::vector<SourceEntity>& origins) {
    const auto selected = failedCylinders(source, failed);
    if (selected.IsEmpty()) throw InvalidGeometryFailure("Kernel produced invalid geometry");
    // A tangential opening at a periodic face boundary can leave the Boolean's
    // wires open in UV. Partition only implicated source cylinders, keeping
    // their exact supports, then let the Boolean rebuild the requested cut.
    BRepBuilderAPI_Copy copy(source, true, false);
    Handle(ShapeBuild_ReShape) context = new ShapeBuild_ReShape;
    const double limit = tolerance(source);
    for (TopTools_MapOfShape::Iterator f(selected); f.More(); f.Next()) {
        const auto face = TopoDS::Face(copy.ModifiedShape(f.Key()).Oriented(TopAbs_FORWARD));
        ShapeUpgrade_ClosedFaceDivide split(face);
        split.SetContext(context);
        split.SetNbSplitPoints(1);
        split.SetPrecision(1e-7);
        split.SetMinTolerance(1e-7);
        split.SetMaxTolerance(limit);
        split.GetWireDivideTool()->SetMinTolerance(1e-7);
        if (!split.Perform() || split.Status(ShapeExtend_FAIL))
            throw std::runtime_error("Cannot partition the periodic Boolean boundary");
        context->Replace(face, split.Result());
    }
    const auto prepared = context->Apply(copy.Shape());
    for (TopExp_Explorer f(prepared, TopAbs_FACE); f.More(); f.Next())
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (BRep_Tool::Tolerance(edge) <= limit) continue;
            if (!BRep_Tool::SameParameter(edge))
                throw std::runtime_error("Periodic Boolean boundary has inconsistent parameters");
            BRepLib_CheckCurveOnSurface check(edge, TopoDS::Face(f.Current()));
            check.Perform();
            if (!check.IsDone() || !std::isfinite(check.MaxDistance()) || check.MaxDistance() > limit)
                throw std::runtime_error("Periodic Boolean boundary exceeded source precision");
        }
    // The divider initializes some new edge tolerances to 1e-5. Require the
    // source precision instead, and verify curve/surface agreement with OCCT's
    // full SameParameter distance check before using the prepared operand.
    ShapeFix_ShapeTolerance().LimitTolerance(prepared, 0, limit);
    if (!BRepCheck_Analyzer(prepared).IsValid())
        throw std::runtime_error("Periodic Boolean preparation exceeded source precision");
    const double sourceVolume = preciseVolume(source);
    if (tolerance(prepared) > limit * (1 + 1e-6) ||
        std::abs(preciseVolume(prepared) - sourceVolume) > 1e-7 * std::max(1.0, sourceVolume))
        throw std::runtime_error("Periodic Boolean preparation changed source geometry");
    std::vector<SourceEntity> mapped;
    TopTools_MapOfShape sourceShapes;
    TopExp::MapShapes(source, sourceShapes);
    for (const auto& origin : origins) {
        if (!sourceShapes.Contains(origin.shape)) { mapped.push_back(origin); continue; }
        const auto replacement = context->Apply(copy.ModifiedShape(origin.shape));
        if (replacement.ShapeType() == origin.shape.ShapeType())
            mapped.push_back({origin.id, replacement});
        else for (TopExp_Explorer part(replacement, origin.shape.ShapeType()); part.More(); part.Next())
            mapped.push_back({origin.id, part.Current()});
    }
    origins = std::move(mapped);
    return prepared;
}
