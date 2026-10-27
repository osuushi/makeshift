#include "edge-finish-construction.h"
#include "edge-finish-validation.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepPrimAPI_MakeHalfSpace.hxx>
#include <Bnd_Box.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
double solidVolume(const TopoDS_Shape& shape) {
    double result = 0;
    for (TopExp_Explorer s(shape, TopAbs_SOLID); s.More(); s.Next()) result += volume(s.Current());
    return result;
}
struct Rim {
    TopoDS_Face support;
    std::vector<TopoDS_Edge> edges;
};
std::vector<Rim> planarRims(const TopoDS_Shape& shape, const std::vector<TopoDS_Edge>& edges) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    std::vector<Rim> result;
    for (const auto& edge : edges) {
        TopTools_IndexedMapOfShape planes;
        for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edge)); f.More(); f.Next())
            if (BRepAdaptor_Surface(TopoDS::Face(f.Value())).GetType() == GeomAbs_Plane) planes.Add(f.Value());
        // Two planar supports do not define an unambiguous end section.
        if (planes.Extent() != 1) throw std::runtime_error("Cannot isolate this edge finish");
        const auto support = TopoDS::Face(planes(1));
        auto rim = std::find_if(result.begin(), result.end(), [&](const auto& r) { return r.support.IsSame(support); });
        if (rim == result.end()) { result.push_back({support, {edge}}); }
        else rim->edges.push_back(edge);
    }
    return result;
}
TopoDS_Face sectionPlane(const TopoDS_Shape& body, const TopoDS_Face& support) {
    const auto plane = BRepAdaptor_Surface(support).Plane();
    auto normal = gp_Dir(gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection())));
    if (support.Orientation() == TopAbs_REVERSED) normal.Reverse();
    // Bound in the support's frame, not the world AABB: rotated rims behave identically.
    gp_Trsf toPlane;
    toPlane.SetTransformation(gp_Ax3(plane.Location(), normal));
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(body, toPlane, false).Shape(), bounds, false, false);
    double x0, y0, z0, x1, y1, z1;
    bounds.Get(x0, y0, z0, x1, y1, z1);
    const double tolerance = geometry_policy::boundaryDistanceMm;
    if (z1 > tolerance || z0 >= -2*tolerance)
        throw std::runtime_error("Selected plane is not an exterior rim support");
    return BRepBuilderAPI_MakeFace(gp_Pln(plane.Location().Translated(gp_Vec(normal)*(z0/2)), normal)).Face();
}
std::vector<TopoDS_Edge> continuingEdges(const Operand& body, const TopoDS_Shape& part,
                                      const std::vector<SourceEntity>& origins, const std::vector<TopoDS_Edge>& selected) {
    TopTools_IndexedMapOfShape current;
    TopExp::MapShapes(part, TopAbs_EDGE, current);
    std::vector<TopoDS_Edge> result;
    for (const auto& edge : selected) {
        const auto source = std::find_if(body.entities.begin(), body.entities.end(),
                                       [&](const auto& e) { return e.shape.IsSame(edge); });
        if (source == body.entities.end()) throw std::runtime_error("Selected rim has no identity");
        TopTools_IndexedMapOfShape images;
        for (const auto& origin : origins)
            if (origin.id == source->id && current.Contains(origin.shape)) images.Add(origin.shape);
        if (images.Extent() != 1) throw std::runtime_error("Section changed the selected rim");
        result.push_back(TopoDS::Edge(images(1)));
    }
    return result;
}
Result rimRemoval(const Operand& body, const Rim& rim, double radius, bool chamfer,
                  const std::vector<SourceEntity>& continuingBlends) {
    const auto section = sectionPlane(body.shape, rim.support);
    const auto reference = BRepAdaptor_Surface(rim.support).Plane().Location();
    const auto half = BRepPrimAPI_MakeHalfSpace(section, reference).Solid();
    auto origins = body.entities;
    const auto part = booleanShape(body.shape, half, "intersect", origins);
    const auto edges = continuingEdges(body, part, origins, rim.edges);
    std::vector<SourceEntity> blends;
    for (const auto& blend : continuingBlends)
        for (size_t i = 0; i < edges.size(); ++i)
            if (blend.shape.IsSame(rim.edges[i])) { blends.push_back({blend.id, edges[i]}); break; }
    const auto finished = constructEdgeFinishOnSupports({body.id, part, origins}, edges, radius, chamfer, blends);
    validateFinishManifold(finished.shape);
    std::vector<SourceEntity> unused;
    const auto added = booleanShape(finished.shape, part, "subtract", unused);
    if (TopExp_Explorer(added, TopAbs_SOLID).More())
        throw std::runtime_error("Local rim construction must only remove material");
    auto cutOrigins = finished.predecessors;
    const auto removed = booleanShape(part, finished.shape, "subtract", cutOrigins);
    if (!TopExp_Explorer(removed, TopAbs_SOLID).More())
        throw std::runtime_error("Local rim construction removed no material");
    validateFinishManifold(removed);
    BRepExtrema_DistShapeShape clearance(removed, section);
    if (!clearance.IsDone() || clearance.Value() <= geometry_policy::boundaryDistanceMm)
        throw std::runtime_error("Edge finish reached its temporary section boundary");
    return {removed, std::move(cutOrigins), {body.id}};
}
}

Result constructLocalEdgeFinish(const Operand& body, const std::vector<TopoDS_Edge>& edges,
                                double radius, bool chamfer, const std::vector<SourceEntity>& continuingBlends) {
    // OCCT can couple distant rims through their common side faces. Calculate
    // each end locally, then transfer only its removed material to the original.
    // This cannot fill a source hole or replace an existing opposite-end finish.
    Result result{body.shape, body.entities, {body.id}};
    std::vector<TopoDS_Shape> cuts;
    const double originalVolume = solidVolume(body.shape);
    double removedVolume = 0;
    for (const auto& rim : planarRims(body.shape, edges)) {
        const auto cut = rimRemoval(body, rim, radius, chamfer, continuingBlends);
        for (const auto& previous : cuts) {
            std::vector<SourceEntity> unused;
            const auto overlap = booleanShape(previous, cut.shape, "intersect", unused);
            if (TopExp_Explorer(overlap, TopAbs_SOLID).More())
                throw std::runtime_error("Local edge finishes interact; they require a joint construction");
        }
        result.predecessors.insert(result.predecessors.end(), cut.predecessors.begin(), cut.predecessors.end());
        result.shape = booleanShape(result.shape, cut.shape, "subtract", result.predecessors);
        cuts.push_back(cut.shape);
        removedVolume += solidVolume(cut.shape);
    }
    validateFinishManifold(result.shape);
    // Boolean validity alone does not establish that material was conserved.
    if (std::abs(solidVolume(result.shape) + removedVolume - originalVolume) >
        1e-7 * std::max(1.0, originalVolume))
        throw std::runtime_error("Local edge finish did not preserve source material");
    return result;
}
