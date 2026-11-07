#include "linear-cap-offset.h"
#include "offset-continuation.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include "boundary-move.h"
#include "boundary-validation.h"
#include "scale-transform.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRep_Tool.hxx>
#include <Standard_Failure.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BezierCurve.hxx>
#include <algorithm>

namespace {
using boundary_move::require;
bool continues(const TopoDS_Face& face, const gp_Vec& direction) {
    const BRepAdaptor_Surface surface(face);
    if (surface.GetType() == GeomAbs_Plane)
        return std::abs(direction.Dot(gp_Vec(surface.Plane().Axis().Direction()))) < 1e-10;
    const auto axis = offsetGenerator(face);
    return axis && axis->IsParallel(direction, 1e-10);
}
// Follow the same infinite supports across periodic seams and previous trims.
TopTools_IndexedMapOfShape neighborhood(const Operand& body, const TopoDS_Face& cap,
                                      const gp_Vec& direction) {
    TopTools_IndexedMapOfShape selected, edges;
    selected.Add(cap); TopExp::MapShapes(cap, TopAbs_EDGE, edges);
    bool changed = true;
    while (changed) {
        changed = false;
        for (const auto& face : boundary_move::faces(body.shape)) {
            if (selected.Contains(face) || !continues(face, direction)) continue;
            bool adjacent = false;
            for (TopExp_Explorer it(face, TopAbs_EDGE); it.More(); it.Next()) adjacent |= edges.Contains(it.Current());
            if (!adjacent) continue;
            selected.Add(face); TopExp::MapShapes(face, TopAbs_EDGE, edges); changed = true;
        }
    }
    require(selected.Extent() > 1, "Cap has no continuing walls");
    return selected;
}
double fixedLevel(const Operand& body, const TopTools_IndexedMapOfShape& selected, const gp_Vec& normal) {
    TopTools_IndexedMapOfShape movingEdges, fixedEdges;
    for (int i = 1; i <= selected.Extent(); ++i) TopExp::MapShapes(selected(i), TopAbs_EDGE, movingEdges);
    for (const auto& face : boundary_move::faces(body.shape))
        if (!selected.Contains(face)) TopExp::MapShapes(face, TopAbs_EDGE, fixedEdges);
    std::optional<double> level;
    for (int i = 1; i <= fixedEdges.Extent(); ++i) {
        if (!movingEdges.Contains(fixedEdges(i))) continue;
        const BRepAdaptor_Curve curve(TopoDS::Edge(fixedEdges(i)));
        const auto check = [&](const gp_Pnt& p) {
            const double at = gp_Vec(p.XYZ()).Dot(normal);
            require(!level || std::abs(at - *level) < 1e-7, "Continuation has no common stationary rim plane");
            level = at;
        };
        // A plane contains a polynomial/rational curve when it contains every
        // control point. Do not infer a stationary rim from sampled endpoints.
        if (curve.GetType() == GeomAbs_BSplineCurve) {
            const auto spline = curve.BSpline();
            for (int j = 1; j <= spline->NbPoles(); ++j) check(spline->Pole(j));
        } else if (curve.GetType() == GeomAbs_BezierCurve) {
            const auto bezier = curve.Bezier();
            for (int j = 1; j <= bezier->NbPoles(); ++j) check(bezier->Pole(j));
        } else if (curve.GetType() == GeomAbs_Line) {
            check(curve.Value(curve.FirstParameter())); check(curve.Value(curve.LastParameter()));
        } else if (curve.GetType() == GeomAbs_Circle || curve.GetType() == GeomAbs_Ellipse) {
            const auto axis = curve.GetType() == GeomAbs_Circle ? curve.Circle().Axis() : curve.Ellipse().Axis();
            require(axis.Direction().IsParallel(gp_Dir(normal), 1e-10), "Stationary conic is not parallel to the cap");
            check(axis.Location());
        } else require(false, "Unsupported stationary rim curve");
    }
    require(level.has_value(), "Continuation has no stationary rim");
    return *level;
}
int capVolumeAxis(const TopTools_IndexedMapOfShape& faces, const gp_Vec& normal) {
    bool highDegree = false;
    for (int i = 1; i <= faces.Extent(); ++i) {
        const BRepAdaptor_Surface surface(TopoDS::Face(faces(i)));
        highDegree |= surface.GetType() == GeomAbs_BSplineSurface &&
            (surface.UDegree() > 2 || surface.VDegree() > 2);
    }
    // Keep the ordinary direction choice for rational conics. High-degree
    // approximated rims retain their cap-direction integration reference.
    if (!highDegree) return -1;
    int axis = 1;
    for (int i = 2; i <= 3; ++i) if (std::abs(normal.Coord(i)) > std::abs(normal.Coord(axis))) axis = i;
    return axis - 1;
}
Result extend(const Operand& body, const TopoDS_Face& cap, double distance) {
    TopTools_IndexedMapOfShape capEdges; TopExp::MapShapes(cap, TopAbs_EDGE, capEdges);
    bool freeformRim = false;
    for (const auto& face : boundary_move::faces(body.shape)) {
        const auto type = BRepAdaptor_Surface(face).GetType();
        if (type != GeomAbs_BSplineSurface && type != GeomAbs_SurfaceOfExtrusion) continue;
        for (TopExp_Explorer it(face, TopAbs_EDGE); it.More(); it.Next())
            freeformRim |= capEdges.Contains(it.Current());
    }
    // Analytic caps retain the ordinary offset path and its support frames.
    require(freeformRim, "Cap already has analytic offset supports");
    const auto travel = offsetContinuation(body.shape, cap, distance);
    const gp_Vec direction{gp_Dir(travel)};
    const auto selected = neighborhood(body, cap, direction);
    const auto plane = BRepAdaptor_Surface(cap).Plane();
    const gp_Vec normal(plane.Axis().Direction());
    const double base = fixedLevel(body, selected, normal);
    const double height = gp_Vec(plane.Location().XYZ()).Dot(normal) - base;
    require(std::abs(height) > 1e-7, "Continuation has zero height");
    gp_GTrsf transform;
    for (int r = 1; r <= 3; ++r) {
        for (int c = 1; c <= 3; ++c)
            transform.SetValue(r, c, (r == c ? 1.0 : 0.0) + travel.Coord(r) * normal.Coord(c) / height);
        transform.SetValue(r, 4, -travel.Coord(r) * base / height);
    }
    require(transform.VectorialPart().Determinant() > 1e-8, "Continuation collapses or inverts the walls");
    // An affine map along a certified generator changes only the trim of each
    // wall support. A shared map preserves seams without adding a join ring.
    BRepBuilderAPI_GTransform operation(body.shape, transform, true);
    require(operation.IsDone(), "Cannot extend wall trims");
    const auto supports = affineSupports(body.shape, transform, operation);
    gp_Trsf translation; translation.SetTranslation(travel);
    BRepBuilderAPI_Transform translated(cap, translation, true);
    TopTools_IndexedMapOfShape rimEdges; TopExp::MapShapes(cap, TopAbs_EDGE, rimEdges);
    bool analyticRim = true;
    for (int i = 1; i <= rimEdges.Extent(); ++i) {
        const auto kind = BRepAdaptor_Curve(TopoDS::Edge(rimEdges(i))).GetType();
        analyticRim &= kind == GeomAbs_Line || kind == GeomAbs_Circle || kind == GeomAbs_Ellipse;
    }
    std::vector<SourceEntity> replacements;
    TopTools_IndexedMapOfShape movingEdges;
    for (const auto& source : body.entities) {
        if (source.shape.ShapeType() != TopAbs_FACE || !selected.Contains(source.shape)) continue;
        replacements.push_back({source.id, source.shape.IsSame(cap) && analyticRim ? translated.Shape()
            : supports->Apply(operation.ModifiedShape(source.shape))});
        TopExp::MapShapes(source.shape, TopAbs_EDGE, movingEdges);
    }
    boundary_move::Edit edit; edit.body = &body;
    TopExp::MapShapes(body.shape, TopAbs_EDGE, edit.sourceEdges);
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i) {
        const auto edge = edit.sourceEdges(i).Oriented(TopAbs_FORWARD);
        edit.edges.push_back(TopoDS::Edge(analyticRim && rimEdges.Contains(edge) ? translated.ModifiedShape(edge)
            : movingEdges.Contains(edge) ? supports->Apply(operation.ModifiedShape(edge))
            : BRepBuilderAPI_Copy(edge).Shape()));
    }
    auto result = boundary_move::reconstruct(edit, replacements);
    for (const auto& source : body.entities) {
        if (!source.shape.IsSame(cap)) continue;
        const auto next = std::find_if(result.predecessors.begin(), result.predecessors.end(), [&](const auto& e) { return e.id == source.id; });
        require(next != result.predecessors.end(), "Continuation lost cap correspondence");
        const auto moved = TopoDS::Face(next->shape);
        offset_geometry::checkParallel(cap, moved, distance, "Linear cap offset", true);
        result.selectedFaces.push_back(moved);
    }
    offset_geometry::tightenGeneratedBoundaries(result.shape, body.shape, false);
    offset_geometry::validSolid(result.shape, "Linear cap offset");
    result.exactVolume = checkOffsetVolume(body.shape, result.shape, distance, {}, capVolumeAxis(selected, normal));
    return result;
}
}
std::optional<Result> linearCapOffset(const Operand& body, const std::vector<TopoDS_Face>& faces, double distance) {
    if (faces.size() != 1 || BRepAdaptor_Surface(faces[0]).GetType() != GeomAbs_Plane || std::abs(distance) < 1e-10) return std::nullopt;
    try { return extend(body, faces[0], distance); }
    catch (const Standard_Failure&) { return std::nullopt; }
    catch (const std::runtime_error&) { return std::nullopt; }
}
