#include "revolved-profile.h"
#include "boolean-probe.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRep_Builder.hxx>
#include <GProp_GProps.hxx>
#include <OSD_ThreadPool.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Cylinder.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace revolved_profile {
namespace {
constexpr double tolerance = Precision::Confusion();

bool crosses(const TopoDS_Shape& boundary, const gp_Sphere& sphere) {
    const auto vertex = BRepBuilderAPI_MakeVertex(sphere.Location()).Vertex();
    BRepExtrema_DistShapeShape distance(boundary, vertex);
    if (!distance.IsDone()) throw std::runtime_error("Could not classify a dimple against the profile");
    return distance.Value() < sphere.Radius() - tolerance;
}
}

TopoDS_Shape joinCutSeams(const TopoDS_Shape& shape, std::vector<SourceEntity>& origins) {
    if (origins.empty()) return shape;
    TopTools_IndexedDataMapOfShapeListOfShape adjacent;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacent);
    TopTools_MapOfShape seams;
    for (int i = 1; i <= adjacent.Extent(); ++i) {
        const auto& faces = adjacent(i);
        if (faces.Extent() != 2 || faces.First().IsSame(faces.Last())) continue;
        const auto source = std::ranges::find_if(origins, [&](const auto& entry) {
            return entry.shape.IsSame(faces.First());
        });
        if (source != origins.end() && std::ranges::any_of(origins, [&](const auto& entry) {
                return entry.id == source->id && entry.shape.IsSame(faces.Last());
            })) seams.Add(adjacent.FindKey(i));
    }
    if (seams.IsEmpty()) return shape;
    // A Boolean can split one periodic support at its parameter seam. Restore
    // the single face and its source ID using the ordinary same-domain cleanup.
    auto joined = cleanupEdges({"", shape, origins}, seams);
    origins = std::move(joined.predecessors);
    return joined.shape;
}

namespace {
struct CylinderCut {
    gp_Cylinder surface;
    std::vector<SourceEntity> walls;
};

std::vector<CylinderCut> distinctCylinders(const std::vector<SourceEntity>& walls) {
    std::vector<CylinderCut> cuts;
    for (const auto& wall : walls) {
        const auto cylinder = BRepAdaptor_Surface(TopoDS::Face(wall.shape)).Cylinder();
        const auto matching = std::ranges::find_if(cuts, [&](const auto& cut) {
            return coaxial(cut.surface.Axis(), cylinder.Axis()) &&
                std::abs(cut.surface.Radius() - cylinder.Radius()) <= tolerance;
        });
        if (matching == cuts.end()) cuts.push_back({cylinder, {wall}});
        else matching->walls.push_back(wall);
    }
    return cuts;
}

void continueCutWalls(const CylinderCut& cut, const TopoDS_Shape& result, std::vector<SourceEntity>& origins) {
    if (cut.walls.size() == 1) return;
    const auto& first = cut.walls.front().id;
    const auto axis = cut.surface.Axis();
    std::vector<std::array<double, 2>> oldStations;
    for (const auto& wall : cut.walls) oldStations.push_back(axialStations(wall.shape, axis));
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(result, TopAbs_FACE, faces);
    std::vector<SourceEntity> descendants;
    for (const auto& origin : origins) {
        if (origin.id != first) {
            descendants.push_back(origin);
            continue;
        }
        if (!faces.Contains(origin.shape)) continue;
        const auto [start, end] = axialStations(origin.shape, axis);
        for (std::size_t i = 0; i < cut.walls.size(); ++i) {
            const auto [low, high] = oldStations[i];
            if (std::min(end, high) - std::max(start, low) > tolerance)
                descendants.push_back({cut.walls[i].id, origin.shape});
        }
    }
    origins = std::move(descendants);
}
}

TopoDS_Shape trimDimples(const TopoDS_Shape& carrier, const Band& band, std::vector<SourceEntity>& origins) {
    if (band.dimples.empty()) return carrier;
    TopoDS_Compound boundary;
    BRep_Builder builder;
    builder.MakeCompound(boundary);
    // Distance to the shells measures whether a cutter opens on the boundary.
    // A solid would also report contact for a cutter buried in its interior.
    for (TopExp_Explorer shell(carrier, TopAbs_SHELL); shell.More(); shell.Next())
        builder.Add(boundary, shell.Current());
    TopTools_ListOfShape arguments, tools;
    std::vector<std::string> expectedDimples;
    arguments.Append(carrier);
    for (const auto& dimple : band.dimples) {
        if (!crosses(boundary, dimple.sphere)) continue;
        const auto center = dimple.sphere.Location();
        const auto axis = band.axis();
        const auto projection = axis.Location().Translated(gp_Vec(axis.Direction()) *
            gp_Vec(axis.Location(), center).Dot(gp_Vec(axis.Direction())));
        // Face the cutter seam away from its opening on the original body.
        const gp_Ax2 frame(center, axis.Direction(), gp_Dir(gp_Vec(projection, center)));
        const auto tool = BRepPrimAPI_MakeSphere(frame, dimple.sphere.Radius()).Shape();
        tools.Append(tool);
        expectedDimples.push_back(dimple.face);
        origins.push_back({dimple.face, TopExp_Explorer(tool, TopAbs_FACE).Current()});
    }
    if (tools.IsEmpty()) return carrier;
    BRepAlgoAPI_Cut cut;
    cut.SetArguments(arguments);
    cut.SetTools(tools);
    cut.SetNonDestructive(true);
    cut.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    cut.Build();
    if (!cut.IsDone() || cut.HasErrors()) throw std::runtime_error("Could not re-cut the spherical dimples");
    std::vector<SourceEntity> descendants;
    for (const auto& source : origins) {
        if (!cut.IsDeleted(source.shape)) descendants.push_back(source);
        for (const auto& face : cut.Modified(source.shape))
            if (face.ShapeType() == TopAbs_FACE) descendants.push_back({source.id, face});
    }
    TopTools_IndexedMapOfShape trimmedFaces;
    TopExp::MapShapes(cut.Shape(), TopAbs_FACE, trimmedFaces);
    for (const auto& id : expectedDimples)
        if (!std::ranges::any_of(descendants, [&](const auto& face) {
                return id == face.id && trimmedFaces.Contains(face.shape);
            }))
            throw std::runtime_error("An intersecting dimple could not be restored");
    origins = std::move(descendants);
    return cut.Shape();
}

bool hasMaterial(const TopoDS_Shape& shape, double threshold) {
    for (TopExp_Explorer solid(shape, TopAbs_SOLID); solid.More(); solid.Next())
        if (std::abs(volume(solid.Current())) > threshold) return true;
    return false;
}

bool hasSplitCut(const std::vector<SourceEntity>& walls) {
    return distinctCylinders(walls).size() < walls.size();
}

TopoDS_Shape recutParallel(TopoDS_Shape stock, const std::vector<SourceEntity>& walls,
                          std::vector<SourceEntity>& origins) {
    if (walls.empty()) return stock;
    const auto cuts = distinctCylinders(walls);
    for (const auto& cut : cuts) {
        const auto& cylinder = cut.surface;
        const auto axis = cylinder.Axis();
        const auto [low, high] = axialStations(stock, axis);
        const double margin = std::max(0.001, (high - low) * 1e-6);
        const auto start = axis.Location().Translated(gp_Vec(axis.Direction()) * (low - margin));
        const gp_Ax2 frame(start, axis.Direction(), cylinder.XAxis().Direction());
        BRepPrimAPI_MakeCylinder tool(frame, cylinder.Radius(), high - low + 2 * margin);
        const BooleanProbe overlap(stock, tool.Shape());
        if (!hasMaterial(overlap.shape(), geometry_policy::minimumSolidVolumeMm3)) continue;
        origins.push_back({cut.walls.front().id, tool.Face()});
        stock = overlap.subtract(origins);
    }
    stock = joinCutSeams(stock, origins);
    for (const auto& cut : cuts) continueCutWalls(cut, stock, origins);
    return stock;
}

void verifySameMaterial(const TopoDS_Shape& before, const TopoDS_Shape& rebuilt, const char* message) {
    const double toleranceVolume = std::max(1e-8, 1e-9 * volume(before));
    std::vector<SourceEntity> unused;
    if (hasMaterial(booleanShape(rebuilt, before, "subtract", unused), toleranceVolume) ||
        hasMaterial(booleanShape(before, rebuilt, "subtract", unused), toleranceVolume))
        throw std::runtime_error(message);
}

void verifySectionMaterial(const TopoDS_Shape& before, const TopoDS_Shape& rebuilt,
                           bool exactSupports, const char* message) {
    const double sourceVolume = volume(before), rebuiltVolume = volume(rebuilt);
    // Compare the shared volume, allowing for one boundary layer at topological
    // precision on each solid. The section and recut each introduce that error.
    // Subtracting near-coincident spline surfaces can create spurious slivers.
    GProp_GProps sourceBoundary, rebuiltBoundary;
    BRepGProp::SurfaceProperties(before, sourceBoundary);
    BRepGProp::SurfaceProperties(rebuilt, rebuiltBoundary);
    const double toleranceVolume = std::max(1e-9 * sourceVolume,
        (sourceBoundary.Mass() + rebuiltBoundary.Mass()) * tolerance);
    if (std::abs(sourceVolume - rebuiltVolume) > toleranceVolume)
        throw std::runtime_error(message);
    // With an intact meridian through every exact turned face, these surfaces
    // and the known cut cylinders determine the stock and its interruptions.
    // An approximate spline support needs the additional overlap check.
    if (exactSupports) return;
    std::vector<SourceEntity> unused;
    const auto common = booleanShape(before, rebuilt, "intersect", unused);
    const double commonVolume = volume(common);
    if (std::abs(sourceVolume - commonVolume) > toleranceVolume ||
        std::abs(rebuiltVolume - commonVolume) > toleranceVolume)
        throw std::runtime_error(message);
}
}
