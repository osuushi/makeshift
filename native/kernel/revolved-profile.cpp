#include "revolved-profile.h"
#include "edge-finish-validation.h"
#include "geometry-policy.h"
#include "sketch-curve.h"
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <Bnd_Box.hxx>
#include <OSD_ThreadPool.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <algorithm>
#include <stdexcept>

namespace {
using revolved_profile::Band;
constexpr double tolerance = Precision::Confusion();

void checkSpan(const TopoDS_Edge& edge, const Band& band) {
    gp_Trsf local;
    local.SetTransformation(band.frame);
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(edge, local, true).Shape(), bounds, false, false);
    double lowX, lowY, lowZ, highX, highY, highZ;
    bounds.Get(lowX, lowY, lowZ, highX, highY, highZ);
    if (lowX <= tolerance || lowY < -tolerance || highY > band.height + tolerance ||
        lowZ < -tolerance || highZ > tolerance)
        throw std::runtime_error("Keep the profile on one side of the axis and between the end caps");
}

struct Section {
    TopoDS_Wire wire;
    std::vector<SourceEntity> edges;
};

Section makeSection(const Tree& input, const Band& band) {
    BRepBuilderAPI_MakeWire wire;
    std::vector<SourceEntity> origins;
    const auto add = [&](const TopoDS_Edge& edge, const std::string& source = "") {
        wire.Add(edge);
        if (!wire.IsDone()) throw std::runtime_error("Join the profile into one continuous chain");
        if (!source.empty()) origins.push_back({source, wire.Edge()});
    };
    gp_Pnt start, end;
    bool first = true;
    for (const auto& entry : input.get_child("spans")) {
        const auto& span = entry.second;
        const auto curve = sketchCurve(span);
        const auto a = curve->Value(curve->FirstParameter());
        const auto b = curve->Value(curve->LastParameter());
        if (first) start = a;
        else if (a.Distance(end) > tolerance)
            throw std::runtime_error("Join the profile into one continuous chain");
        first = false;
        end = b;
        const auto edge = BRepBuilderAPI_MakeEdge(curve).Edge();
        checkSpan(edge, band);
        const auto id = span.get<std::string>("face", "");
        if (!id.empty() && std::ranges::find(band.meridians, id, &revolved_profile::Meridian::face) ==
                               band.meridians.end())
            throw std::runtime_error("Unknown profile face");
        add(edge, id);
    }
    const auto radial = gp_Vec(band.frame.XDirection());
    const auto onCap = [&](const gp_Pnt& p, double height) {
        return p.Distance(band.at(gp_Vec(band.frame.Location(), p).Dot(radial), height)) <= tolerance;
    };
    if (first || !onCap(start, 0) || !onCap(end, band.height))
        throw std::runtime_error("The profile must start and end on the cap planes");
    add(BRepBuilderAPI_MakeEdge(end, band.at(0, band.height)).Edge(), band.caps[1]);
    add(BRepBuilderAPI_MakeEdge(band.at(0, band.height), band.at(0, 0)).Edge());
    add(BRepBuilderAPI_MakeEdge(band.at(0, 0), start).Edge(), band.caps[0]);
    return {wire.Wire(), origins};
}

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
}

std::vector<Result> replaceRevolvedProfile(const Tree& input, const std::vector<Operand>& bodies,
                                           std::vector<std::string>& participants) {
    const auto band = revolved_profile::inspect(input, bodies);
    const auto section = makeSection(input, band);
    const auto profile = BRepBuilderAPI_MakeFace(section.wire, true).Face();
    validate(profile);
    BRepPrimAPI_MakeRevol sweep(profile, band.axis(), true);
    if (!sweep.IsDone()) throw std::runtime_error("Could not revolve the edited profile");
    std::vector<SourceEntity> origins;
    for (const auto& edge : section.edges)
        for (const auto& face : sweep.Generated(edge.shape))
            if (face.ShapeType() == TopAbs_FACE) origins.push_back({edge.id, face});
    const auto shape = trimDimples(sweep.Shape(), section.wire, band, origins);
    validate(shape);
    validateFinishManifold(shape);
    validateFinishIntersections(shape);
    std::vector<Result> results;
    solids(results, shape, origins, {band.body.id});
    TopTools_IndexedMapOfShape shells;
    TopExp::MapShapes(shape, TopAbs_SHELL, shells);
    if (results.size() != 1 || shells.Extent() != 1 || volume(results.front().shape) <= 0)
        throw std::runtime_error("The edited profile must enclose one solid");
    participants.push_back(band.body.id);
    return results;
}
