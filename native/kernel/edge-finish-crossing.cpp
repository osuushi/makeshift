#include "edge-finish-construction.h"
#include "edge-finish-validation.h"
#include "geometry-policy.h"
#include "microscopic-validation.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepTools.hxx>
#include <Bnd_Box.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Lin.hxx>
#include <algorithm>
#include <cmath>
#include <set>
#include <stdexcept>

namespace {
TopoDS_Face shelfSupport(const TopoDS_Shape& shape, const std::vector<TopoDS_Edge>& edges) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_MapOfShape common;
    for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edges.front())); f.More(); f.Next())
        if (BRepAdaptor_Surface(TopoDS::Face(f.Value())).GetType() == GeomAbs_Plane) common.Add(f.Value());
    for (const auto& edge : edges) {
        TopTools_MapOfShape next;
        for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edge)); f.More(); f.Next())
            if (common.Contains(f.Value())) next.Add(f.Value());
        common = next;
    }
    if (common.Extent() != 1) throw std::runtime_error("No common planar shelf support");
    return TopoDS::Face(TopTools_MapOfShape::Iterator(common).Key());
}
bool sameExtrudedSupport(const TopoDS_Face& source, const TopoDS_Edge& edge, const gp_Vec& vector) {
    const BRepAdaptor_Surface a(source);
    const BRepAdaptor_Curve b(edge);
    const double budget = geometry_policy::parameterCorrespondenceMm;
    if (a.GetType() == GeomAbs_Plane && b.GetType() == GeomAbs_Line)
        return a.Plane().Axis().Direction().IsNormal(b.Line().Direction(), 1e-12) &&
            a.Plane().Axis().Direction().IsNormal(gp_Dir(vector), 1e-12) &&
            a.Plane().Distance(b.Line().Location()) <= budget;
    if (a.GetType() == GeomAbs_Cylinder && b.GetType() == GeomAbs_Circle)
        return a.Cylinder().Axis().IsParallel(b.Circle().Axis(), 1e-12) &&
            gp_Lin(a.Cylinder().Axis()).Distance(b.Circle().Location()) <= budget &&
            a.Cylinder().Axis().Direction().IsParallel(gp_Dir(vector), 1e-12) &&
            std::abs(a.Cylinder().Radius() - b.Circle().Radius()) <= budget;
    return false;
}
void checkSupportSpan(const TopoDS_Face& face, const TopoDS_Edge& spine, const gp_Vec& vector, double size) {
    const BRepAdaptor_Curve selected(spine);
    const auto origin = selected.Value(selected.FirstParameter());
    const gp_Dir direction(vector);
    double extent = 0;
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
        const BRepAdaptor_Curve curve(TopoDS::Edge(e.Current()));
        if (curve.GetType() == GeomAbs_Line && curve.Line().Direction().IsParallel(direction, 1e-12)) continue;
        const bool transverse = (curve.GetType() == GeomAbs_Line && curve.Line().Direction().IsNormal(direction, 1e-12)) ||
            (curve.GetType() == GeomAbs_Circle && curve.Circle().Axis().Direction().IsParallel(direction, 1e-12));
        if (!transverse) throw std::runtime_error("Cannot bound the edge finish's supporting wall");
        const double height = gp_Vec(origin, curve.Value(curve.FirstParameter())).Dot(gp_Vec(direction));
        if (std::abs(height) <= geometry_policy::parameterCorrespondenceMm) continue;
        if (height < size - geometry_policy::parameterCorrespondenceMm ||
            (extent && std::abs(extent-height) > geometry_policy::parameterCorrespondenceMm))
            throw std::runtime_error("Edge finish would cross the end of its supporting wall");
        extent = height;
    }
    if (!extent) throw std::runtime_error("Cannot bound the edge finish's supporting wall");
}
struct ShelfCarrier {
    Operand body;
    std::vector<TopoDS_Edge> edges;
    std::vector<Result> cores;
    std::vector<SourceEntity> blends;
    std::set<std::string> consumedEdges;
    bool adding = false;
};
void appendSides(const Operand& body, const TopoDS_Face& shelf, const BRepBuilderAPI_Copy& copy,
                 const TopoDS_Wire& wire, BRepPrimAPI_MakePrism& prism, const gp_Vec& vector,
                 std::vector<SourceEntity>& origins, double size = 0) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    for (TopExp_Explorer e(wire, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current());
        const auto generated = prism.Generated(copy.ModifiedShape(edge));
        if (generated.Size() != 1 || generated.First().ShapeType() != TopAbs_FACE)
            throw std::runtime_error("Cannot continue the shelf boundary support");
        const auto side = TopoDS::Face(generated.First());
        for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edge)); f.More(); f.Next()) {
            if (f.Value().IsSame(shelf)) continue;
            // Certify the extrusion against the exact source support. A tapered
            // or freeform wall must not be replaced by a vertical approximation.
            if (!sameExtrudedSupport(TopoDS::Face(f.Value()), edge, vector))
                throw std::runtime_error("Cannot extend the selected edge finish supports");
            if (size) checkSupportSpan(TopoDS::Face(f.Value()), edge, vector, size);
            for (const auto& source : body.entities)
                if (source.shape.IsSame(f.Value())) origins.push_back({source.id, side});
        }
    }
}
TopoDS_Face carrierFace(const TopoDS_Face& shelf, BRepBuilderAPI_Copy& copy, bool adding, double margin) {
    const auto plane = BRepAdaptor_Surface(shelf).Plane();
    const auto outer = BRepTools::OuterWire(shelf);
    if (!adding) return BRepBuilderAPI_MakeFace(plane, TopoDS::Wire(copy.ModifiedShape(outer)), true).Face();
    double u0, u1, v0, v1;
    BRepTools::UVBounds(shelf, u0, u1, v0, v1);
    BRepBuilderAPI_MakeFace face(plane, u0-margin, u1+margin, v0-margin, v1+margin);
    for (TopExp_Explorer w(shelf, TopAbs_WIRE); w.More(); w.Next()) {
        if (w.Current().IsSame(outer)) continue;
        // A bounded complement lets a concave finish use the same convex
        // construction as a cut, without the shelf's outer loop limiting it.
        const auto inside = BRepBuilderAPI_MakeFace(plane, TopoDS::Wire(copy.ModifiedShape(w.Current())), true).Face();
        face.Add(TopoDS::Wire(BRepTools::OuterWire(inside).Reversed()));
    }
    return face.Face();
}
void appendCore(ShelfCarrier& result, const Operand& body, const TopoDS_Face& shelf,
                BRepBuilderAPI_Copy& copy, const TopoDS_Wire& wire, const gp_Vec& vector) {
    const auto plane = BRepAdaptor_Surface(shelf).Plane();
    const auto face = BRepBuilderAPI_MakeFace(plane, TopoDS::Wire(copy.ModifiedShape(wire)), true).Face();
    BRepPrimAPI_MakePrism prism(face, vector, false, true);
    Result core{prism.Shape(), {}, {}};
    appendSides(body, shelf, copy, wire, prism, vector, core.predecessors);
    for (TopExp_Explorer e(wire, TopAbs_EDGE); e.More(); e.Next())
        for (const auto& entity : body.entities)
            if (entity.shape.IsSame(e.Current())) result.consumedEdges.insert(entity.id);
    result.cores.push_back(std::move(core));
}
ShelfCarrier carrierFor(const Operand& body, const TopoDS_Face& shelf, const std::vector<TopoDS_Edge>& edges,
                        double size, const std::vector<SourceEntity>& continuingBlends) {
    // No construction or tolerance adjustment may mutate a surviving source edge.
    BRepBuilderAPI_Copy copy(shelf, true, false);
    const auto outer = BRepTools::OuterWire(shelf);
    TopTools_IndexedMapOfShape outerEdges, sourceEdges;
    TopExp::MapShapes(outer, TopAbs_EDGE, outerEdges);
    TopExp::MapShapes(shelf, TopAbs_EDGE, sourceEdges);
    const bool adding = !outerEdges.Contains(edges.front());
    for (const auto& edge : edges)
        if (!sourceEdges.Contains(edge) || outerEdges.Contains(edge) == adding)
            throw std::runtime_error("Crossing finish requires consistent shelf edges");
    const auto plane = BRepAdaptor_Surface(shelf).Plane();
    auto normal = gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection()));
    if (shelf.Orientation() == TopAbs_REVERSED) normal.Reverse();
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(body.shape, bounds, false, false);
    const double depth = std::max(2 * size, 2 * std::sqrt(bounds.SquareExtent()));
    const auto vector = normal * (adding ? depth : -depth);
    BRepPrimAPI_MakePrism prism(carrierFace(shelf, copy, adding, depth), vector, false, true);
    ShelfCarrier result{{body.id, prism.Shape(), {}}, {}, {}, {}, {}, adding};
    TopTools_IndexedMapOfShape boundary;
    TopExp::MapShapes(prism.FirstShape(), TopAbs_EDGE, boundary);
    for (const auto& source : body.entities) {
        if (source.shape.IsSame(shelf)) result.body.entities.push_back({source.id, prism.FirstShape()});
        if (sourceEdges.Contains(source.shape)) {
            const auto copied = copy.ModifiedShape(source.shape);
            if (boundary.Contains(copied)) result.body.entities.push_back({source.id, copied});
        }
    }
    for (const auto& edge : edges) {
        const auto copied = copy.ModifiedShape(edge);
        if (!boundary.Contains(copied)) throw std::runtime_error("Cannot map the shelf finish edge");
        result.edges.push_back(TopoDS::Edge(copied));
        for (const auto& blend : continuingBlends)
            if (blend.shape.IsSame(edge)) result.blends.push_back({blend.id, copied});
    }
    bool inner = false;
    for (TopExp_Explorer w(shelf, TopAbs_WIRE); w.More(); w.Next()) {
        const bool exterior = w.Current().IsSame(outer);
        inner |= !exterior;
        if (exterior != adding) appendSides(body, shelf, copy, TopoDS::Wire(w.Current()), prism, vector, result.body.entities, size);
        else appendCore(result, body, shelf, copy, TopoDS::Wire(w.Current()), vector);
    }
    if (!inner) throw std::runtime_error("No intervening shelf boundary");
    return result;
}
Result cutFinish(const Operand& body, const ShelfCarrier& carrier, double size, bool chamfer) {
    const auto finished = constructEdgeFinishOnSupports(carrier.body, carrier.edges, size, chamfer, carrier.blends);
    auto cutOrigins = finished.predecessors;
    auto removed = booleanShape(carrier.body.shape, finished.shape, "subtract", cutOrigins);
    // Clip the finish against the opposite wall's exact continuation: preserve
    // inner material on cuts and the outer material boundary on concave fills.
    for (const auto& core : carrier.cores) {
        cutOrigins.insert(cutOrigins.end(), core.predecessors.begin(), core.predecessors.end());
        removed = booleanShape(removed, core.shape, carrier.adding ? "intersect" : "subtract", cutOrigins);
    }
    auto mapped = body.entities;
    mapped.insert(mapped.end(), cutOrigins.begin(), cutOrigins.end());
    Result result{booleanShape(body.shape, removed, carrier.adding ? "union" : "subtract", mapped), {}, {body.id}};
    result.predecessors = std::move(mapped);
    TopTools_IndexedMapOfShape current;
    TopExp::MapShapes(result.shape, TopAbs_EDGE, current);
    TopTools_MapOfShape eligible;
    for (const auto& origin : result.predecessors)
        if (carrier.consumedEdges.count(origin.id) && current.Contains(origin.shape)) eligible.Add(origin.shape);
    // A consumed loop may leave an artificial split between an original wall
    // and its continuation. Join only at that loop; preserve remote subdivisions.
    if (!eligible.IsEmpty()) result = cleanupEdges({body.id, result.shape, result.predecessors}, eligible);
    // Legacy operands may retain conservative tolerance metadata at untouched
    // vertices. Verify actual agreement on a private copy before tightening that
    // metadata; never modify a shared source vertex or move its position.
    BRepBuilderAPI_Copy copy(result.shape, true, false);
    TopTools_IndexedMapOfShape topology;
    TopExp::MapShapes(result.shape, topology);
    std::vector<SourceEntity> copied;
    for (const auto& origin : result.predecessors)
        if (topology.Contains(origin.shape)) copied.push_back({origin.id, copy.ModifiedShape(origin.shape)});
    result.shape = copy.Shape();
    result.predecessors = std::move(copied);
    result.exactVolume.reset();
    result.exactBounds.reset();
    validateFinishManifold(result.shape);
    offset_geometry::tightenGeneratedBoundaries(result.shape, body.shape, false);
    for (TopExp_Explorer s(result.shape, TopAbs_SOLID); s.More(); s.Next())
        offset_geometry::validSolid(s.Current(), "Crossing edge finish");
    return result;
}
double boundarySize(const TopoDS_Face& shelf, const std::vector<TopoDS_Edge>& edges, double requested) {
    const auto outer = BRepTools::OuterWire(shelf);
    TopTools_IndexedMapOfShape outerEdges;
    TopExp::MapShapes(outer, TopAbs_EDGE, outerEdges);
    const bool adding = !outerEdges.Contains(edges.front());
    double result = requested, correction = geometry_policy::minimumTopologyExtentMm;
    for (TopExp_Explorer w(shelf, TopAbs_WIRE); w.More(); w.Next()) {
        if (w.Current().IsSame(outer) != adding) continue;
        for (const auto& edge : edges) {
            BRepExtrema_DistShapeShape distance(edge, w.Current());
            if (!distance.IsDone()) throw std::runtime_error("Cannot measure the disappearing finish boundary");
            const double delta = std::abs(distance.Value() - requested);
            if (distance.Value() >= geometry_policy::minimumFinishMm && delta < correction) {
                result = distance.Value();
                correction = delta;
            }
        }
    }
    return result;
}
}

Result constructCrossingEdgeFinish(const Operand& body, const std::vector<TopoDS_Edge>& edges,
                                  double size, bool chamfer, const std::vector<SourceEntity>& continuingBlends) {
    const auto shelf = shelfSupport(body.shape, edges);
    const double normalized = boundarySize(shelf, edges, size);
    const auto carrier = carrierFor(body, shelf, edges, std::max(size, normalized), continuingBlends);
    auto result = cutFinish(body, carrier, normalized, chamfer);
    if (std::abs(normalized - size) > geometry_policy::parameterCorrespondenceMm) {
        const auto requested = cutFinish(body, carrier, size, chamfer);
        // A nearby contact is not a nearest-feasible search: the complete solids
        // must satisfy the existing mutual one-micron material bound.
        validateMicroscopicRepair(requested.shape, result.shape);
    }
    return result;
}
