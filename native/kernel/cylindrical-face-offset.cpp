#include "calculation-failure.h"
#include "cylindrical-face-offset.h"
#include "boundary-move.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRep_Tool.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <algorithm>
#include <cmath>
#include <numbers>
#include <stdexcept>

namespace {
constexpr double tolerance = 1e-7;
constexpr const char* context = "Kernel produced invalid geometry: cylindrical offset";

bool roundBore(const TopoDS_Face& face, const gp_Cylinder& cylinder) {
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(face, TopAbs_EDGE, edges);
    int seams = 0, rims = 0;
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        const BRepAdaptor_Curve curve(edge);
        if (BRep_Tool::IsClosed(edge, face)) {
            // Boolean history can leave a piecewise seam: axial lines joined
            // by circular arcs. Both uses remain on this same cylinder.
            if (curve.GetType() == GeomAbs_Line) {
                if (!curve.Line().Direction().IsParallel(cylinder.Axis().Direction(), tolerance))
                    return false;
            } else if (curve.GetType() == GeomAbs_Circle) {
                if (!curve.Circle().Axis().IsCoaxial(cylinder.Axis(), tolerance, tolerance) ||
                    std::abs(curve.Circle().Radius() - cylinder.Radius()) > tolerance) return false;
            } else return false;
            ++seams;
        } else if (!BRep_Tool::IsClosed(edge) || curve.GetType() != GeomAbs_Circle ||
                   std::abs(curve.LastParameter() - curve.FirstParameter() - 2 * std::numbers::pi) >
                       tolerance) return false;
        else ++rims;
    }
    return seams > 0 && rims == 2;
}

gp_Trsf moveBoundary(const BRepAdaptor_Curve& curve, const gp_Cylinder& cylinder, double radius) {
    const double scale = radius / cylinder.Radius();
    gp_Trsf move;
    if (curve.GetType() == GeomAbs_Circle) {
        move.SetScale(curve.Circle().Location(), scale);
    } else {
        const gp_Vec fromAxis(cylinder.Location(), curve.Value(curve.FirstParameter()));
        const gp_Vec axis(cylinder.Axis().Direction());
        move.SetTranslation((fromAxis - axis * fromAxis.Dot(axis)) * (scale - 1));
    }
    return move;
}

boundary_move::Edit boreBoundaries(const Operand& body, const TopoDS_Face& face,
                                   const gp_Cylinder& cylinder, double radius) {
    boundary_move::Edit edit;
    edit.body = &body;
    TopExp::MapShapes(face, TopAbs_EDGE, edit.rigidEdges);
    TopExp::MapShapes(face, TopAbs_VERTEX, edit.movedVertices);
    std::vector<TopoDS_Vertex> vertices;
    for (int i = 1; i <= edit.movedVertices.Extent(); ++i) {
        const auto point = BRep_Tool::Pnt(TopoDS::Vertex(edit.movedVertices(i)));
        const gp_Vec fromAxis(cylinder.Location(), point), axis(cylinder.Axis().Direction());
        const auto radial = fromAxis - axis * fromAxis.Dot(axis);
        vertices.push_back(BRepBuilderAPI_MakeVertex(
            point.Translated(radial * (radius / cylinder.Radius() - 1))).Vertex());
    }
    TopExp::MapShapes(body.shape, TopAbs_EDGE, edit.sourceEdges);
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edit.sourceEdges(i).Oriented(TopAbs_FORWARD));
        if (edit.rigidEdges.Contains(edge)) {
            const auto move = moveBoundary(BRepAdaptor_Curve(edge), cylinder, radius);
            const auto moved = TopoDS::Edge(BRepBuilderAPI_Transform(edge, move, true).Shape());
            double first, last;
            const auto curve = BRep_Tool::Curve(moved, first, last);
            // Reuse one moved vertex per source endpoint. Independent edge
            // transforms otherwise split repeated segments of a periodic seam.
            const auto a = vertices.at(edit.movedVertices.FindIndex(TopExp::FirstVertex(edge)) - 1);
            const auto b = vertices.at(edit.movedVertices.FindIndex(TopExp::LastVertex(edge)) - 1);
            BRepBuilderAPI_MakeEdge rebuilt(curve, a, b, first, last);
            if (!rebuilt.IsDone()) throw std::runtime_error("Cannot reconnect the bore endpoints");
            edit.edges.push_back(rebuilt.Edge());
        } else {
            if (edit.affected(edge))
                throw std::runtime_error("Bore shares an endpoint with another boundary");
            edit.edges.push_back(TopoDS::Edge(BRepBuilderAPI_Copy(edge).Shape()));
        }
    }
    return edit;
}

Result rebuildBore(const Operand& body, const TopoDS_Face& bore,
                   gp_Cylinder cylinder, double distance) {
    const double direction = (bore.Orientation() == TopAbs_FORWARD) == cylinder.Direct() ? 1 : -1;
    const double radius = cylinder.Radius() + direction * distance;
    if (radius <= tolerance) throw GeometricFailure("Offset would collapse the cylindrical face");
    const auto edit = boreBoundaries(body, bore, cylinder, radius);
    std::string boreId;
    std::vector<const SourceEntity*> adjacentPlanes;
    for (const auto& entity : body.entities) {
        if (entity.shape.IsSame(bore)) boreId = entity.id;
        else if (entity.shape.ShapeType() == TopAbs_FACE && edit.affected(entity.shape)) {
            const BRepAdaptor_Surface neighbor(TopoDS::Face(entity.shape));
            if (neighbor.GetType() != GeomAbs_Plane ||
                !neighbor.Plane().Axis().IsParallel(cylinder.Axis(), tolerance))
                throw std::runtime_error("Bore ends are not planar and perpendicular");
            adjacentPlanes.push_back(&entity);
        }
    }
    if (boreId.empty() || adjacentPlanes.size() != 2)
        throw std::runtime_error("Bore does not have two continuing end faces");
    const double oldRadius = cylinder.Radius();
    cylinder.SetRadius(radius);
    const auto replacement = boundary_move::cylinderFace(
        TopoDS::Face(bore.Oriented(TopAbs_FORWARD)), edit, cylinder);
    if (replacement.IsNull()) throw std::runtime_error("Cannot rebuild the exact bore support");
    auto result = boundary_move::reconstruct(edit, {{boreId, replacement}});
    TopTools_IndexedMapOfShape continuingFaces;
    TopExp::MapShapes(result.shape, TopAbs_FACE, continuingFaces);
    const auto continuedFace = [&](const std::string& id) {
        const auto match = std::find_if(result.predecessors.begin(), result.predecessors.end(),
            [&](const auto& entity) { return entity.id == id; });
        if (match == result.predecessors.end())
            throw std::runtime_error("Cylindrical offset lost a continuing face");
        // Sewing correspondence identifies the face; the closed solid owns its
        // orientation, including reversed walls on direct cylinder supports.
        return TopoDS::Face(continuingFaces(continuingFaces.FindIndex(match->shape)));
    };
    const auto face = continuedFace(boreId);
    offset_geometry::checkParallel(bore, face, distance, context, true);
    for (const auto* plane : adjacentPlanes)
        checkUnselectedSupport(TopoDS::Face(plane->shape), continuedFace(plane->id));
    offset_geometry::validSolid(result.shape, context);

    const BRepAdaptor_Surface source(bore);
    const double depth = source.LastVParameter() - source.FirstVParameter();
    const double change = std::numbers::pi * depth * distance * (oldRadius + radius);
    const double before = volume(body.shape), after = volume(result.shape);
    if (std::abs(after - before - change) > 1e-7 + before * 1e-9)
        throw std::runtime_error("Cylindrical offset changed material outside the bore");
    result.selectedFaces.push_back(face);
    result.exactVolume = after;
    return result;
}
}

std::optional<Result> cylindricalFaceOffset(const Operand& body,
        const std::vector<TopoDS_Face>& selected, double distance) {
    if (selected.size() != 1) return std::nullopt;
    const auto bore = selected.front();
    try {
        const BRepAdaptor_Surface surface(bore);
        if (surface.GetType() != GeomAbs_Cylinder) return std::nullopt;
        const auto cylinder = surface.Cylinder();
        if (!roundBore(bore, cylinder)) return std::nullopt;
        // Reconnect only the rims of this cylindrical wall. Whole-body offset
        // construction can discard unrelated cavities on the same cylinder axis.
        return rebuildBore(body, bore, cylinder, distance);
    } catch (const Standard_Failure&) {
        return std::nullopt;
    } catch (const std::runtime_error&) {
        return std::nullopt;
    }
}
