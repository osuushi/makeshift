#include "revolved-profile.h"
#include "boolean-probe.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <OSD_ThreadPool.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Lin.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace revolved_profile {
namespace {
constexpr double tolerance = Precision::Confusion();

// The closest point on any swept ring to the sphere center lies on this
// meridian after moving the center to its plane. The opposite side of every
// ring is outside the sphere because these dimples cannot reach the axis.
bool crosses(const TopoDS_Wire& section, const Band& band, const gp_Sphere& sphere) {
    const auto center = sphere.Location();
    const auto height = gp_Vec(band.frame.Location(), center).Dot(gp_Vec(band.axis().Direction()));
    const auto radius = gp_Lin(band.axis()).Distance(center);
    const auto vertex = BRepBuilderAPI_MakeVertex(band.at(radius, height)).Vertex();
    BRepExtrema_DistShapeShape distance(section, vertex);
    if (!distance.IsDone()) throw std::runtime_error("Could not classify a dimple against the profile");
    return distance.Value() < sphere.Radius() - tolerance;
}

TopoDS_Shape joinCutSeams(const TopoDS_Shape& shape, std::vector<SourceEntity>& origins) {
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
}

TopoDS_Shape trimDimples(const TopoDS_Shape& carrier, const TopoDS_Wire& section,
                        const Band& band, std::vector<SourceEntity>& origins) {
    TopTools_ListOfShape arguments, tools;
    std::vector<std::string> expectedDimples;
    arguments.Append(carrier);
    for (const auto& dimple : band.dimples) {
        if (!crosses(section, band, dimple.sphere)) continue;
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

TopoDS_Shape recutParallel(TopoDS_Shape stock, const std::vector<SourceEntity>& walls,
                          std::vector<SourceEntity>& origins) {
    if (walls.empty()) return stock;
    for (const auto& wall : walls) {
        const auto cylinder = BRepAdaptor_Surface(TopoDS::Face(wall.shape)).Cylinder();
        const auto axis = cylinder.Axis();
        const auto [low, high] = axialStations(stock, axis);
        const double margin = std::max(0.001, (high - low) * 1e-6);
        const auto start = axis.Location().Translated(gp_Vec(axis.Direction()) * (low - margin));
        const gp_Ax2 frame(start, axis.Direction(), cylinder.XAxis().Direction());
        BRepPrimAPI_MakeCylinder tool(frame, cylinder.Radius(), high - low + 2 * margin);
        const BooleanProbe overlap(stock, tool.Shape());
        if (!hasMaterial(overlap.shape(), geometry_policy::minimumSolidVolumeMm3)) continue;
        origins.push_back({wall.id, tool.Face()});
        stock = overlap.subtract(origins);
    }
    return joinCutSeams(stock, origins);
}

void verifySameMaterial(const TopoDS_Shape& before, const TopoDS_Shape& rebuilt, const char* message) {
    const double toleranceVolume = std::max(1e-8, 1e-9 * std::abs(volume(before)));
    std::vector<SourceEntity> unused;
    if (hasMaterial(booleanShape(rebuilt, before, "subtract", unused), toleranceVolume) ||
        hasMaterial(booleanShape(before, rebuilt, "subtract", unused), toleranceVolume))
        throw std::runtime_error(message);
}
}
