#include "conical-cap-offset.h"
#include "boundary-move.h"
#include "boundary-validation.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRep_Tool.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BezierCurve.hxx>
#include <GeomConvert.hxx>
#include <Geom_ConicalSurface.hxx>
#include <gp_Lin.hxx>

namespace {
using boundary_move::require;
struct Rim { TopoDS_Edge source; gp_Circ next; };
bool straight(const TopoDS_Edge& edge) {
    const BRepAdaptor_Curve curve(edge);
    if (curve.GetType() == GeomAbs_Line) return true;
    if (curve.GetType() != GeomAbs_BSplineCurve && curve.GetType() != GeomAbs_BezierCurve) return false;
    const auto spline = curve.GetType() == GeomAbs_BSplineCurve ? curve.BSpline() : GeomConvert::CurveToBSplineCurve(curve.Bezier());
    const auto a = curve.Value(curve.FirstParameter()), b = curve.Value(curve.LastParameter());
    if (a.Distance(b) < 1e-7) return false;
    const gp_Lin line(a, gp_Dir(gp_Vec(a, b)));
    for (int i = 1; i <= spline->NbPoles(); ++i)
        if (line.Distance(spline->Pole(i)) > 1e-9) return false;
    return true;
}
void rebuildEdges(boundary_move::Edit& edit, const std::vector<Rim>& rims) {
    const auto moved = [&](const TopoDS_Vertex& vertex) {
        const auto p = BRep_Tool::Pnt(vertex);
        if (!edit.movedVertices.Contains(vertex)) return p;
        for (const auto& rim : rims) {
            if (!TopExp::FirstVertex(rim.source).IsSame(vertex)) continue;
            const auto old = BRepAdaptor_Curve(rim.source).Circle();
            return rim.next.Location().Translated(gp_Vec(old.Location(), p) * (rim.next.Radius() / old.Radius()));
        }
        throw std::runtime_error("Cap vertex has no continuing rim");
    };
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edit.sourceEdges(i).Oriented(TopAbs_FORWARD));
        const auto rim = std::find_if(rims.begin(), rims.end(), [&](const auto& r) { return r.source.IsSame(edge); });
        if (rim != rims.end()) edit.edges.push_back(BRepBuilderAPI_MakeEdge(rim->next).Edge());
        else if (edit.affected(edge)) {
            require(straight(edge), "Unsupported cap connector");
            edit.edges.push_back(BRepBuilderAPI_MakeEdge(moved(TopExp::FirstVertex(edge)), moved(TopExp::LastVertex(edge))).Edge());
        } else edit.edges.push_back(TopoDS::Edge(BRepBuilderAPI_Copy(edge).Shape()));
    }
}
Result extend(const Operand& body, const TopoDS_Face& cap, double distance) {
    const auto plane = BRepAdaptor_Surface(cap).Plane();
    auto normal = gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection()));
    if (cap.Orientation() == TopAbs_REVERSED) normal.Reverse();
    const auto travel = normal * distance;
    boundary_move::Edit edit;
    edit.body = &body;
    TopExp::MapShapes(cap, TopAbs_EDGE, edit.rigidEdges);
    TopExp::MapShapes(cap, TopAbs_VERTEX, edit.movedVertices);
    TopExp::MapShapes(body.shape, TopAbs_EDGE, edit.sourceEdges);
    std::vector<Rim> rims;
    std::vector<SourceEntity> replacements;
    for (int i = 1; i <= edit.rigidEdges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edit.rigidEdges(i));
        const BRepAdaptor_Curve curve(edge);
        require(curve.GetType() == GeomAbs_Circle && BRep_Tool::IsClosed(edge), "Cap requires complete circular rims");
        const SourceEntity* wall = nullptr;
        for (const auto& entity : body.entities) {
            if (entity.shape.ShapeType() != TopAbs_FACE || entity.shape.IsSame(cap)) continue;
            TopTools_IndexedMapOfShape edges; TopExp::MapShapes(entity.shape, TopAbs_EDGE, edges);
            if (!edges.Contains(edge)) continue;
            require(!wall && edges.Extent() == 3, "Cap requires a single uninterrupted wall at each rim");
            wall = &entity;
        }
        require(wall, "Cap rim has no adjoining wall");
        const auto face = TopoDS::Face(wall->shape);
        const BRepAdaptor_Surface support(face);
        require(support.GetType() == GeomAbs_Cone, "Cap continuation requires conical supports");
        const auto cone = support.Cone();
        require(cone.Axis().IsParallel(plane.Axis(), 1e-10), "Cap must be perpendicular to its cone");
        auto circle = curve.Circle();
        const double axial = travel.Dot(gp_Vec(cone.Axis().Direction()));
        circle.SetRadius(circle.Radius() + axial * std::tan(cone.SemiAngle()));
        require(circle.Radius() > 1e-7, "Cap continuation crosses the cone apex");
        circle.Translate(travel);
        rims.push_back({edge, circle});
        double low = support.FirstVParameter(), high = support.LastVParameter();
        const double atLow = plane.Distance(support.Value(support.FirstUParameter(), low));
        const double atHigh = plane.Distance(support.Value(support.FirstUParameter(), high));
        if (atLow < atHigh) low += axial / std::cos(cone.SemiAngle());
        else high += axial / std::cos(cone.SemiAngle());
        require(high - low > 1e-7, "Cap continuation collapses the wall");
        // Reuse the infinite analytic support, not an old rectangular trim that
        // would clamp the continuing seam to the original cap.
        BRepBuilderAPI_MakeFace replacement(new Geom_ConicalSurface(cone), support.FirstUParameter(),
            support.LastUParameter(), low, high, 1e-7);
        require(replacement.IsDone(), "Cannot continue the conical support");
        replacements.push_back({wall->id, replacement.Face()});
    }
    rebuildEdges(edit, rims);
    auto result = boundary_move::reconstruct(edit, replacements);
    for (const auto& entity : body.entities) {
        if (entity.shape.ShapeType() != TopAbs_FACE) continue;
        const auto next = std::find_if(result.predecessors.begin(), result.predecessors.end(), [&](const auto& e) { return e.id == entity.id; });
        require(next != result.predecessors.end(), "Cap continuation lost face correspondence");
        const auto face = TopoDS::Face(next->shape);
        if (entity.shape.IsSame(cap)) {
            offset_geometry::checkParallel(cap, face, distance, "Conical cap offset", true);
            result.selectedFaces.push_back(face);
        } else checkUnselectedSupport(TopoDS::Face(entity.shape), face);
    }
    offset_geometry::validSolid(result.shape, "Conical cap offset");
    checkOffsetVolume(body.shape, result.shape, distance);
    return result;
}
}
std::optional<Result> conicalCapOffset(const Operand& body, const std::vector<TopoDS_Face>& faces, double distance) {
    if (faces.size() != 1 || BRepAdaptor_Surface(faces[0]).GetType() != GeomAbs_Plane) return std::nullopt;
    try { return extend(body, faces[0], distance); }
    catch (const Standard_Failure&) { return std::nullopt; }
    catch (const std::runtime_error&) { return std::nullopt; }
}
