#include "prismatic-fillet.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRep_Tool.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Circ.hxx>
#include <algorithm>
#include <cmath>

namespace {
constexpr double tolerance = 1e-6;
struct Corner {
    gp_Pnt start, end;
    gp_Vec inwardA, inwardB;
    double reachA, reachB;
};

// The two straight cap boundaries establish how far the tangency points can
// travel without consuming another corner. Interior holes do not set that limit.
std::optional<std::pair<gp_Vec, double>> capBoundary(
        const TopoDS_Face& wall, const TopoDS_Vertex& vertex, const TopoDS_Edge& spine) {
    const auto point = BRep_Tool::Pnt(vertex);
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(wall, TopAbs_EDGE, edges);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (edge.IsSame(spine)) continue;
        TopoDS_Vertex a, b;
        TopExp::Vertices(edge, a, b);
        if (!a.IsSame(vertex) && !b.IsSame(vertex)) continue;
        if (BRepAdaptor_Curve(edge).GetType() != GeomAbs_Line) return std::nullopt;
        gp_Vec direction(point, BRep_Tool::Pnt(a.IsSame(vertex) ? b : a));
        const double length = direction.Magnitude();
        if (length <= tolerance) return std::nullopt;
        return std::pair{direction / length, length};
    }
    return std::nullopt;
}

std::optional<Corner> corner(const Operand& body, const TopoDS_Edge& edge) {
    if (BRepAdaptor_Curve(edge).GetType() != GeomAbs_Line) return std::nullopt;
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    if (!adjacency.Contains(edge) || adjacency.FindFromKey(edge).Extent() != 2) return std::nullopt;
    TopoDS_Vertex a, b;
    TopExp::Vertices(edge, a, b);
    Corner result{BRep_Tool::Pnt(a), BRep_Tool::Pnt(b), {}, {}, 0, 0};
    gp_Vec axis(result.start, result.end);
    if (axis.Magnitude() <= tolerance) return std::nullopt;
    axis.Normalize();
    int index = 0;
    for (TopTools_ListIteratorOfListOfShape it(adjacency.FindFromKey(edge)); it.More(); it.Next()) {
        const auto wall = TopoDS::Face(it.Value());
        if (BRepAdaptor_Surface(wall).GetType() != GeomAbs_Plane) return std::nullopt;
        const auto first = capBoundary(wall, a, edge), last = capBoundary(wall, b, edge);
        if (!first || !last || first->first.Dot(last->first) < 1 - 1e-10 ||
            std::abs(first->first.Dot(axis)) > 1e-10) return std::nullopt;
        (index == 0 ? result.inwardA : result.inwardB) = first->first;
        (index++ == 0 ? result.reachA : result.reachB) = std::min(first->second, last->second);
    }
    // End faces must actually be planar caps normal to the spine; matching
    // boundary directions alone do not establish a swept corner on curved ends.
    TopTools_IndexedDataMapOfShapeListOfShape vertexFaces;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_VERTEX, TopAbs_FACE, vertexFaces);
    for (const auto& vertex : {a, b}) {
        bool cap = false;
        for (TopTools_ListIteratorOfListOfShape it(vertexFaces.FindFromKey(vertex)); it.More(); it.Next()) {
            BRepAdaptor_Surface surface(TopoDS::Face(it.Value()));
            if (surface.GetType() == GeomAbs_Plane &&
                std::abs(surface.Plane().Axis().Direction().Dot(gp_Dir(axis))) > 1 - 1e-10) cap = true;
        }
        if (!cap) return std::nullopt;
    }
    const auto inward = result.inwardA + result.inwardB;
    if (inward.Magnitude() <= tolerance) return std::nullopt;
    const double probe = std::min({result.reachA, result.reachB, result.start.Distance(result.end)}) * 1e-4;
    const auto middle = result.start.Translated(gp_Vec(result.start, result.end) * 0.5);
    BRepClass3d_SolidClassifier classifier(body.shape, middle.Translated(inward.Normalized() * probe), 1e-7);
    if (classifier.State() != TopAbs_IN) return std::nullopt;
    return result;
}

TopoDS_Shape cutter(const Corner& corner, double radius) {
    const double cosine = std::clamp(corner.inwardA.Dot(corner.inwardB), -1.0, 1.0);
    const double half = std::acos(cosine) * 0.5;
    if (half < 1e-5 || half > M_PI / 2 - 1e-5) return {};
    const double setback = radius / std::tan(half);
    if (setback >= std::min(corner.reachA, corner.reachB) - tolerance) return {};
    const auto bisector = (corner.inwardA + corner.inwardB).Normalized();
    const auto a = corner.start.Translated(corner.inwardA * setback);
    const auto b = corner.start.Translated(corner.inwardB * setback);
    const auto center = corner.start.Translated(bisector * (radius / std::sin(half)));
    const gp_Circ circle(gp_Ax2(center, gp_Dir(corner.inwardB.Crossed(corner.inwardA)),
                               gp_Dir(gp_Vec(center, a))), radius);
    const auto arc = GC_MakeArcOfCircle(circle, 0, M_PI - 2 * half, true).Value();
    BRepBuilderAPI_MakeWire wire;
    wire.Add(BRepBuilderAPI_MakeEdge(corner.start, a));
    wire.Add(BRepBuilderAPI_MakeEdge(arc));
    wire.Add(BRepBuilderAPI_MakeEdge(b, corner.start));
    const auto face = BRepBuilderAPI_MakeFace(wire.Wire()).Face();
    return BRepPrimAPI_MakePrism(face, gp_Vec(corner.start, corner.end)).Shape();
}
}

std::optional<Result> prismaticFillet(const Operand& body, const std::vector<TopoDS_Edge>& edges,
                                     double radius) {
    // Meeting-edge blends require a joint corner construction. Keep that route
    // with the ordinary fillet builder rather than applying independent cuts.
    if (edges.size() != 1) return std::nullopt;
    try {
        const auto geometry = corner(body, edges.front());
        if (!geometry) return std::nullopt;
        const auto tool = cutter(*geometry, radius);
        if (tool.IsNull()) return std::nullopt;
        auto origins = body.entities;
        const auto shape = booleanShape(body.shape, tool, "subtract", origins);
        std::vector<Result> results;
        solids(results, shape, origins, {body.id});
        if (results.size() != 1) return std::nullopt;
        return results.front();
    } catch (const Standard_Failure&) {
        return std::nullopt;
    } catch (const std::runtime_error&) {
        return std::nullopt;
    }
}
