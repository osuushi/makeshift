#include "revolved-profile.h"
#include "boolean-probe.h"
#include "geometry-policy.h"
#include "shape-measurements.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeHalfSpace.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Precision.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <stdexcept>

namespace revolved_profile {
namespace {
constexpr double tolerance = Precision::Confusion();

struct PlanarFace {
    SourceEntity source;
    gp_Pln plane;
    bool side;
};

std::vector<PlanarFace> axialPlanes(const Operand& body, const gp_Ax1& axis) {
    std::vector<PlanarFace> faces;
    for (const auto& source : body.entities) {
        if (source.shape.ShapeType() != TopAbs_FACE) continue;
        const auto face = TopoDS::Face(source.shape);
        const BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane) continue;
        const auto plane = surface.Plane();
        const auto normal = plane.Axis().Direction();
        const bool side = normal.IsNormal(axis.Direction(), Precision::Angular()) &&
            plane.Distance(axis.Location()) > tolerance;
        if (side || normal.IsParallel(axis.Direction(), Precision::Angular()))
            faces.push_back({source, plane, side});
    }
    return faces;
}

std::vector<gp_Dir> radialCandidates(const gp_Ax1& axis, const std::vector<PlanarFace>& planes) {
    const auto radial = radialFrame(axis, 0).XDirection();
    const gp_Vec axial(axis.Direction());
    std::vector<gp_Dir> candidates{radial, radial.Reversed()};
    for (const auto& face : planes) {
        if (!face.side) continue;
        GProp_GProps props;
        BRepGProp::SurfaceProperties(face.source.shape, props);
        const gp_Vec toFace(axis.Location(), props.CentreOfMass());
        const auto across = toFace - axial * toFace.Dot(axial);
        if (across.Magnitude() > tolerance) candidates.emplace_back(-across);
    }
    return candidates;
}

std::optional<Band> clearSection(const Operand& body, const gp_Ax1& axis,
                                 const std::vector<PlanarFace>& planes,
                                 const std::vector<SourceEntity>& cylinders) {
    for (const auto& radial : radialCandidates(axis, planes)) {
        try {
            auto band = sectionProfile(body, axis, cylinders, radial);
            const bool crossesCut = std::ranges::any_of(band.meridians, [&](const auto& span) {
                return std::ranges::find(cylinders, span.face, &SourceEntity::id) != cylinders.end() ||
                    std::ranges::any_of(planes, [&](const auto& plane) {
                        return plane.side && plane.source.id == span.face;
                    });
            });
            if (!band.meridians.empty() && !crossesCut) return band;
        } catch (const Standard_Failure&) {
            // A meridian can coincide with a cut wall or its seam.
        } catch (const std::runtime_error&) {
            // Other directions can still produce an intact section.
        }
    }
    return std::nullopt;
}

bool capsStock(const PlanarFace& face, const Band& band, const std::vector<PlanarFace>& planes) {
    return !face.side && std::ranges::any_of(planes, [&](const auto& cap) {
        return !cap.side && cap.plane.Distance(face.plane.Location()) <= tolerance &&
            std::ranges::find(band.meridians, cap.source.id, &Meridian::face) != band.meridians.end();
    });
}

std::vector<PlanarCut> cutComponents(const Band& band, const std::vector<PlanarFace>& planes) {
    // The meridian already gives the stock caps. Collect the other planar
    // supports connected to a cut side, without joining cuts across a stock cap.
    std::vector<SourceEntity> candidates;
    for (const auto& plane : planes)
        if (!capsStock(plane, band, planes)) candidates.push_back(plane.source);
    TopTools_IndexedDataMapOfShapeListOfShape neighbors;
    TopExp::MapShapesAndAncestors(band.body.shape, TopAbs_EDGE, TopAbs_FACE, neighbors);
    TopTools_MapOfShape used;
    std::vector<PlanarCut> cuts;
    for (const auto& plane : planes) {
        if (!plane.side || !used.Add(plane.source.shape)) continue;
        PlanarCut cut{{plane.source}};
        for (std::size_t i = 0; i < cut.walls.size(); ++i) {
            for (TopExp_Explorer edge(cut.walls[i].shape, TopAbs_EDGE); edge.More(); edge.Next()) {
                for (const auto& neighbor : neighbors.FindFromKey(edge.Current())) {
                    const auto face = std::ranges::find_if(candidates, [&](const auto& item) {
                        return item.shape.IsSame(neighbor);
                    });
                    if (face != candidates.end() && used.Add(neighbor)) cut.walls.push_back(*face);
                }
            }
        }
        cuts.push_back(std::move(cut));
    }
    return cuts;
}

TopoDS_Shape convexCutter(const TopoDS_Shape& stock, const PlanarCut& cut, std::vector<SourceEntity>& origins) {
    const auto bounds = exactShapeBounds(stock);
    const gp_Vec margin(0.001, 0.001, 0.001);
    auto tool = BRepPrimAPI_MakeBox(bounds.CornerMin().Translated(-margin),
                                  bounds.CornerMax().Translated(margin)).Shape();
    for (const auto& wall : cut.walls) {
        const auto face = TopoDS::Face(wall.shape);
        const auto plane = BRepAdaptor_Surface(face).Plane();
        const auto frame = plane.Position();
        auto intoCut = frame.XDirection().Crossed(frame.YDirection());
        if (face.Orientation() == TopAbs_REVERSED) intoCut.Reverse();
        const auto support = BRepBuilderAPI_MakeFace(plane).Face();
        const auto halfSpace = BRepPrimAPI_MakeHalfSpace(support,
            plane.Location().Translated(gp_Vec(intoCut))).Solid();
        origins.push_back({wall.id, support});
        tool = booleanShape(tool, halfSpace, "intersect", origins);
        if (!TopExp_Explorer(tool, TopAbs_SOLID).More()) break;
    }
    return tool;
}
}

std::optional<Band> sectionWithPlanarCuts(const Operand& body, const gp_Ax1& axis,
                                         const std::vector<SourceEntity>& cylinders) {
    const auto planes = axialPlanes(body, axis);
    if (std::ranges::none_of(planes, &PlanarFace::side)) return std::nullopt;
    auto band = clearSection(body, axis, planes, cylinders);
    if (!band) throw std::runtime_error("Could not recover a section clear of the planar cuts");
    band->planarCuts = cutComponents(*band, planes);
    return band;
}

TopoDS_Shape recutPlanar(TopoDS_Shape stock, const std::vector<PlanarCut>& cuts,
                         std::vector<SourceEntity>& origins) {
    for (const auto& cut : cuts) {
        if (!TopExp_Explorer(stock, TopAbs_SOLID).More()) break;
        std::vector<SourceEntity> walls;
        const auto tool = convexCutter(stock, cut, walls);
        if (!TopExp_Explorer(tool, TopAbs_SOLID).More()) continue;
        const BooleanProbe overlap(stock, tool);
        if (!hasMaterial(overlap.shape(), geometry_policy::minimumSolidVolumeMm3)) continue;
        origins.insert(origins.end(), walls.begin(), walls.end());
        stock = overlap.subtract(origins);
    }
    return stock;
}
}
