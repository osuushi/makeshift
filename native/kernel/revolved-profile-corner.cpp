#include "revolved-profile.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRep_Tool.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <numbers>
#include <stdexcept>

namespace revolved_profile {
namespace {
constexpr double tolerance = Precision::Confusion();
constexpr double angleTolerance = geometry_policy::fullCircleAngleRad;
using Adjacency = TopTools_IndexedDataMapOfShapeListOfShape;

std::vector<TopoDS_Face> adjacentFaces(const TopoDS_Shape& face, const Adjacency& adjacency) {
    TopTools_MapOfShape seen;
    seen.Add(face);
    std::vector<TopoDS_Face> result;
    for (TopExp_Explorer edges(face, TopAbs_EDGE); edges.More(); edges.Next())
        for (const auto& neighbor : adjacency.FindFromKey(edges.Current()))
            if (seen.Add(neighbor)) result.push_back(TopoDS::Face(neighbor));
    return result;
}

bool partialTurn(const BRepAdaptor_Surface& surface) {
    return surface.LastUParameter() - surface.FirstUParameter() < std::numbers::pi + angleTolerance;
}

std::vector<SourceEntity> connectedSides(const Operand& body, const SourceEntity& seed,
                                         const gp_Ax1& axis, const Adjacency& adjacency) {
    std::vector<SourceEntity> sides{seed};
    TopTools_MapOfShape seen;
    seen.Add(seed.shape);
    for (std::size_t i = 0; i < sides.size(); ++i) {
        for (const auto& neighbor : adjacentFaces(sides[i].shape, adjacency)) {
            if (!seen.Add(neighbor)) continue;
            const BRepAdaptor_Surface surface(neighbor);
            const auto candidate = rotationAxis(surface);
            if (!candidate || !coaxial(*candidate, axis) || !partialTurn(surface)) continue;
            const auto source = std::ranges::find_if(body.entities, [&](const auto& e) {
                return e.shape.IsSame(neighbor);
            });
            if (source != body.entities.end()) sides.push_back(*source);
        }
    }
    return sides;
}

struct SidePlane {
    gp_Dir normal;
    double distance;
};

std::optional<SidePlane> sidePlane(const TopoDS_Face& face, const gp_Ax1& axis) {
    const BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Plane) return std::nullopt;
    const auto plane = surface.Plane().Position();
    auto normal = plane.XDirection().Crossed(plane.YDirection());
    if (!normal.IsNormal(axis.Direction(), Precision::Angular())) return std::nullopt;
    if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
    return SidePlane{normal, gp_Vec(axis.Location(), plane.Location()).Dot(gp_Vec(normal))};
}

struct Limits {
    std::vector<SidePlane> sides;
    std::vector<double> stations;
};

Limits neighboringLimits(const std::vector<SourceEntity>& sides, const gp_Ax1& axis,
                         const Adjacency& adjacency) {
    Limits limits;
    const auto addPlane = [&](const SidePlane& side) {
        if (side.distance <= tolerance) return;
        if (std::ranges::none_of(limits.sides, [&](const auto& other) {
                return side.normal.IsEqual(other.normal, Precision::Angular()) &&
                    std::abs(side.distance - other.distance) <= tolerance;
            })) limits.sides.push_back(side);
    };
    for (const auto& side : sides) {
        for (const auto& neighbor : adjacentFaces(side.shape, adjacency)) {
            const BRepAdaptor_Surface surface(neighbor);
            if (surface.GetType() != GeomAbs_Plane) continue;
            const auto plane = surface.Plane();
            if (plane.Axis().IsParallel(axis, Precision::Angular())) {
                const double station = gp_Vec(axis.Location(), plane.Location()).Dot(gp_Vec(axis.Direction()));
                if (std::ranges::none_of(limits.stations, [&](double other) {
                        return std::abs(station - other) <= tolerance;
                    })) limits.stations.push_back(station);
            } else if (const auto support = sidePlane(neighbor, axis)) {
                addPlane(*support);
                if (std::abs(support->distance) > tolerance) continue;
                // A reduced radius exposes a join on a plane through the axis.
                // Its outer edge still meets the stationary side plane.
                for (const auto& next : adjacentFaces(neighbor, adjacency))
                    if (const auto wall = sidePlane(next, axis);
                        wall && wall->normal.IsNormal(support->normal, Precision::Angular()))
                        addPlane(*wall);
            }
        }
    }
    return limits;
}

bool insideSector(const SourceEntity& side, const gp_Ax1& axis, const SidePlane& a, const SidePlane& b) {
    const BRepAdaptor_Surface surface(TopoDS::Face(side.shape));
    const double first = surface.FirstUParameter(), last = surface.LastUParameter();
    const double v = (surface.FirstVParameter() + surface.LastVParameter()) / 2;
    // The UV trim can include the position tolerance of the incident edges.
    const double boundaryTolerance = tolerance + BRep_Tool::MaxTolerance(side.shape, TopAbs_EDGE);
    const gp_Vec axial(axis.Direction());
    for (const double u : {first, (first + last) / 2, last}) {
        const gp_Vec offset(axis.Location(), surface.Value(u, v));
        const auto radial = offset - axial * axial.Dot(offset);
        if (radial.Magnitude() <= tolerance ||
            axial.Dot(gp_Vec(a.normal).Crossed(radial)) < -boundaryTolerance ||
            axial.Dot(radial.Crossed(gp_Vec(b.normal))) < -boundaryTolerance) return false;
    }
    return true;
}

TopoDS_Shape cornerPrism(const Band& band, const SidePlane& a, const SidePlane& b, const gp_Vec& corner) {
    const auto origin = band.frame.Location();
    BRepBuilderAPI_MakePolygon outline(origin, origin.Translated(gp_Vec(a.normal) * a.distance),
        origin.Translated(corner), origin.Translated(gp_Vec(b.normal) * b.distance), true);
    const auto face = BRepBuilderAPI_MakeFace(outline.Wire(), true).Face();
    return BRepPrimAPI_MakePrism(face, gp_Vec(band.axis().Direction()) * band.height, true).Shape();
}

void recoverSides(Band& band, const std::vector<SourceEntity>& sides) {
    const auto station = [&](const gp_Pnt& p) {
        return gp_Vec(band.frame.Location(), p).Dot(gp_Vec(band.axis().Direction()));
    };
    for (const auto& side : sides) {
        auto curve = meridian(TopoDS::Face(side.shape), band, false);
        if (station(curve->StartPoint()) > station(curve->EndPoint())) curve->Reverse();
        const Handle(Geom_Curve) span(curve);
        band.meridians.push_back({side.id, span});
    }
    std::ranges::sort(band.meridians, {}, [&](const auto& side) {
        return station(side.curve->Value(side.curve->FirstParameter()));
    });
}
}

std::optional<Band> cornerProfile(const Operand& body, const SourceEntity& seed) {
    const auto face = TopoDS::Face(seed.shape);
    const BRepAdaptor_Surface surface(face);
    const auto candidate = rotationAxis(surface);
    if (!candidate || !partialTurn(surface) || inwardAxis(face)) return std::nullopt;
    const auto axis = stableAxis(*candidate);
    Adjacency adjacency;
    TopExp::MapShapesAndUniqueAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    const auto sides = connectedSides(body, seed, axis, adjacency);
    auto limits = neighboringLimits(sides, axis, adjacency);
    if (limits.sides.size() != 2 || limits.stations.size() != 2) return std::nullopt;
    auto a = limits.sides[0], b = limits.sides[1];
    const gp_Vec axial(axis.Direction());
    if (gp_Vec(a.normal).Crossed(gp_Vec(b.normal)).Dot(axial) < 0) std::swap(a, b);
    const double dot = a.normal.Dot(b.normal), determinant = 1 - dot * dot;
    if (determinant <= angleTolerance) return std::nullopt;
    const double alongA = (a.distance - dot * b.distance) / determinant;
    const double alongB = (b.distance - dot * a.distance) / determinant;
    if (std::min(alongA, alongB) <= tolerance ||
        !std::ranges::all_of(sides, [&](const auto& side) { return insideSector(side, axis, a, b); }))
        return std::nullopt;

    const auto [low, high] = std::minmax(limits.stations[0], limits.stations[1]);
    const auto corner = gp_Vec(a.normal) * alongA + gp_Vec(b.normal) * alongB;
    const gp_Dir radial(corner);
    const gp_Ax3 frame(radialFrame(axis, low).Location(), radial.Crossed(axis.Direction()), radial);
    Band band{body, frame, high - low, true};
    band.cornerEnvelope = cornerPrism(band, a, b, corner);
    recoverSides(band, sides);
    // The cap is reconstructed from the stationary plane, including at tangency.
    trimToEndGuides(band);
    return band;
}

TopoDS_Shape replaceCorner(const Band& band, const TopoDS_Shape& revolved, std::vector<SourceEntity>& origins) {
    auto replacement = booleanShape(revolved, band.cornerEnvelope, "intersect", origins);
    if (!hasMaterial(replacement, geometry_policy::minimumSolidVolumeMm3))
        throw std::runtime_error("The edited profile must enclose material between the corner's end planes");
    auto retained = band.body.entities;
    const auto remainder = booleanShape(band.body.shape, band.cornerEnvelope, "subtract", retained);
    origins.insert(origins.end(), retained.begin(), retained.end());
    const auto result = booleanShape(remainder, replacement, "union", origins);
    // Remove the coplanar seams made by separating and rejoining this corner.
    TopTools_MapOfShape continued, joinEdges;
    for (const auto& source : origins)
        if (source.shape.ShapeType() == TopAbs_FACE) continued.Add(source.shape);
    for (TopExp_Explorer face(result, TopAbs_FACE); face.More(); face.Next()) {
        if (continued.Contains(face.Current())) continue;
        for (TopExp_Explorer edge(face.Current(), TopAbs_EDGE); edge.More(); edge.Next())
            joinEdges.Add(edge.Current());
    }
    auto cleaned = cleanupEdges({band.body.id, result, origins}, joinEdges);
    origins = std::move(cleaned.predecessors);
    return cleaned.shape;
}
}
