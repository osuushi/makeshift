#include "revolved-profile.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GeomAPI_IntCS.hxx>
#include <Geom_Plane.hxx>
#include <Precision.hxx>
#include <ShapeAnalysis_FreeBounds.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_HSequenceOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace revolved_profile {
std::array<double, 2> axialStations(const TopoDS_Shape& shape, const gp_Ax1& axis) {
    gp_Trsf local;
    local.SetTransformation(radialFrame(axis, 0));
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(shape, local, true).Shape(), bounds, false, false);
    double lowX, lowY, lowZ, highX, highY, highZ;
    bounds.Get(lowX, lowY, lowZ, highX, highY, highZ);
    return {lowY, highY};
}

namespace {
constexpr double tolerance = Precision::Confusion();

std::vector<SourceEntity> connectedWalls(const Operand& body, const SourceEntity& seed,
                                         const gp_Ax1& axis) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_MapOfShape visited;
    std::vector<SourceEntity> walls{seed};
    visited.Add(seed.shape);
    for (std::size_t i = 0; i < walls.size(); ++i) {
        const auto face = walls[i].shape;
        for (TopExp_Explorer edge(face, TopAbs_EDGE); edge.More(); edge.Next()) {
            for (const auto& neighbor : adjacency.FindFromKey(edge.Current())) {
                if (!visited.Add(neighbor)) continue;
                const auto otherAxis = inwardAxis(TopoDS::Face(neighbor));
                if (!otherAxis || !coaxial(axis, *otherAxis)) continue;
                const auto source = std::ranges::find_if(body.entities, [&](const auto& entry) {
                    return entry.shape.IsSame(neighbor);
                });
                if (source != body.entities.end()) walls.push_back(*source);
            }
        }
    }
    return walls;
}

void checkOpenings(const std::vector<SourceEntity>& walls, const gp_Ax1& axis) {
    TopTools_IndexedMapOfShape edges;
    std::vector<int> uses;
    for (const auto& wall : walls)
        for (TopExp_Explorer edge(wall.shape, TopAbs_EDGE); edge.More(); edge.Next()) {
            if (BRep_Tool::Degenerated(TopoDS::Edge(edge.Current()))) continue;
            const int index = edges.Add(edge.Current());
            if (index > static_cast<int>(uses.size())) uses.push_back(0);
            ++uses[index - 1];
        }
    Handle(TopTools_HSequenceOfShape) boundary = new TopTools_HSequenceOfShape;
    for (int i = 1; i <= edges.Extent(); ++i) {
        if (uses[i - 1] > 2) throw std::runtime_error("The bore wall has a nonmanifold boundary");
        if (uses[i - 1] == 1) boundary->Append(edges(i));
    }
    Handle(TopTools_HSequenceOfShape) rims = new TopTools_HSequenceOfShape;
    ShapeAnalysis_FreeBounds::ConnectEdgesToWires(boundary, tolerance, true, rims);
    if (rims->Length() != 2 || !BRep_Tool::IsClosed(rims->Value(1)) || !BRep_Tool::IsClosed(rims->Value(2)))
        throw std::runtime_error("Edit Profile requires a through-bore with two closed openings");
    const auto a = axialStations(rims->Value(1), axis);
    const auto b = axialStations(rims->Value(2), axis);
    if (std::max(a[0], b[0]) <= std::min(a[1], b[1]) + tolerance)
        throw std::runtime_error("The bore openings must lie at opposite ends of the profile");
}

double along(const Band& band, const gp_Pnt& p) {
    return gp_Vec(band.frame.Location(), p).Dot(gp_Vec(band.axis().Direction()));
}

double parameterAt(const Handle(Geom_Curve)& curve, const Band& band, double station, double near) {
    std::optional<double> best;
    const auto consider = [&](double parameter) {
        if (curve->IsPeriodic()) parameter = near + std::remainder(parameter - near, curve->Period());
        if (!best || std::abs(parameter - near) < std::abs(*best - near)) best = parameter;
    };
    const Handle(Geom_Plane) plane = new Geom_Plane(band.at(0, station), band.axis().Direction());
    const GeomAPI_IntCS intersection(curve, plane);
    if (intersection.IsDone())
        for (int i = 1; i <= intersection.NbPoints(); ++i) {
            double u, v, parameter;
            intersection.Parameters(i, u, v, parameter);
            consider(parameter);
        }
    // A bounded spline can end on a guide within the edge's spatial precision.
    if (!best)
        for (const double end : {curve->FirstParameter(), curve->LastParameter()})
            if (!Precision::IsInfinite(end) && std::abs(along(band, curve->Value(end)) - station) <= tolerance)
                consider(end);
    if (!best) throw std::runtime_error("The recovered profile must meet both end guides");
    return *best;
}
}

void trimToEndGuides(Band& band) {
    auto& sides = band.meridians;
    for (std::size_t i = 0; i < sides.size(); ++i) {
        if (i != 0 && i + 1 != sides.size()) continue;
        auto& curve = sides[i].curve;
        const auto basis = Handle(Geom_TrimmedCurve)::DownCast(curve)->BasisCurve();
        const auto first = i == 0
            ? parameterAt(basis, band, 0, curve->FirstParameter()) : curve->FirstParameter();
        const auto last = i + 1 == sides.size()
            ? parameterAt(basis, band, band.height, curve->LastParameter()) : curve->LastParameter();
        if (first >= last) throw std::runtime_error("Could not trim the recovered profile to its end guides");
        curve = new Geom_TrimmedCurve(basis, first, last, true, false);
    }
}

ThroughBore throughBore(const Operand& body, const SourceEntity& seed) {
    const auto axis = inwardAxis(TopoDS::Face(seed.shape));
    if (!axis) throw std::runtime_error("Select an inward revolved wall");
    auto walls = connectedWalls(body, seed, *axis);
    checkOpenings(walls, *axis);
    return {*axis, std::move(walls)};
}

Band boreProfile(const Operand& body, const ThroughBore& bore, const TopoDS_Shape& envelope) {
    const auto bounds = axialStations(envelope, bore.axis);
    const double margin = std::max(0.001, (bounds[1] - bounds[0]) * 1e-6);
    Band band{body, radialFrame(bore.axis, bounds[0] - margin), bounds[1] - bounds[0] + 2 * margin, true};
    for (const auto& wall : bore.walls) {
        auto curve = meridian(TopoDS::Face(wall.shape), band);
        if (along(band, curve->StartPoint()) > along(band, curve->EndPoint())) curve->Reverse();
        band.meridians.push_back({wall.id, curve});
    }
    std::ranges::sort(band.meridians, {}, [&](const auto& side) {
        return along(band, side.curve->Value(side.curve->FirstParameter()));
    });
    trimToEndGuides(band);
    return band;
}
}
