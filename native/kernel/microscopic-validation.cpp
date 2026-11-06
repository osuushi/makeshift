#include "microscopic-validation.h"
#include "geometry-policy.h"
#include "kernel.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include "erosion-coverage-cells.h"
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <TopExp_Explorer.hxx>
#include <cmath>
#include <stdexcept>

namespace {
bool convexPolyhedron(const TopoDS_Shape& shape) {
    return shape.ShapeType() == TopAbs_SOLID &&
        !erosion::coverage::convexPlanes(shape).empty();
}
void verticesInside(const TopoDS_Shape& source, const TopoDS_Shape& candidate) {
    // Distance to a convex set is convex. Its maximum over a polyhedron is
    // attained at a vertex; this bounds all face interiors and solid material.
    for (TopExp_Explorer v(candidate, TopAbs_VERTEX); v.More(); v.Next()) {
        BRepExtrema_DistShapeShape distance(v.Current(), source);
        if (!distance.IsDone() || distance.Value() > geometry_policy::minimumTopologyExtentMm)
            throw std::runtime_error("Microscopic topology repair exceeds one micron");
    }
}
void insideEnvelope(const TopoDS_Shape& source, const TopoDS_Shape& candidate) {
    BRepOffsetAPI_MakeOffsetShape offset;
    offset.PerformByJoin(source, geometry_policy::minimumTopologyExtentMm,
                         geometry_policy::boundaryDistanceMm);
    if (!offset.IsDone() || offset.Shape().IsNull())
        throw std::runtime_error("Could not bound microscopic topology repair");
    validate(offset.Shape());
    bool solid = false;
    for (TopExp_Explorer s(offset.Shape(), TopAbs_SOLID); s.More(); s.Next()) {
        offset_geometry::validSolid(s.Current(), "Microscopic repair envelope");
        solid = true;
    }
    if (!solid) throw std::runtime_error("Microscopic repair envelope is empty");
    BRepAlgoAPI_Cut outside;
    TopTools_ListOfShape arguments, tools;
    arguments.Append(candidate);
    tools.Append(offset.Shape());
    outside.SetArguments(arguments);
    outside.SetTools(tools);
    outside.SetNonDestructive(true);
    outside.Build();
    if (!outside.IsDone() || outside.HasErrors() || outside.HasWarnings())
        throw std::runtime_error("Could not verify microscopic topology repair");
    validate(outside.Shape());
    for (TopExp_Explorer s(outside.Shape(), TopAbs_SOLID); s.More(); s.Next())
        if (std::abs(volume(s.Current())) > geometry_policy::minimumSolidVolumeMm3)
            throw std::runtime_error("Microscopic topology repair exceeds one micron");
}
}
void validateMicroscopicRepair(const TopoDS_Shape& before, const TopoDS_Shape& after) {
    // Verify actual curve/surface agreement; enlarged entity tolerances must not
    // turn a failed reconnection into apparently valid geometry.
    offset_geometry::tightenGeneratedBoundaries(after, before, false);
    for (TopExp_Explorer s(after, TopAbs_SOLID); s.More(); s.Next())
        offset_geometry::validSolid(s.Current(), "Microscopic topology repair");
    if (convexPolyhedron(before) && convexPolyhedron(after)) {
        verticesInside(before, after);
        verticesInside(after, before);
        return;
    }
    // Mutual containment in fixed outward offsets bounds both added and removed
    // material, including the interior of a long face, without sparse sampling.
    insideEnvelope(before, after);
    insideEnvelope(after, before);
}
