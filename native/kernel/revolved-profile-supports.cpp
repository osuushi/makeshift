#include "revolved-profile.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass3d.hxx>
#include <BRep_Tool.hxx>
#include <GC_MakeSegment.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Shell.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <gp_Torus.hxx>
#include <algorithm>
#include <cmath>
#include <numbers>
#include <stdexcept>
#include <unordered_set>

namespace revolved_profile {
namespace {
constexpr double lengthTolerance = Precision::Confusion();

struct Patch {
    std::string id;
    TopoDS_Face face;
    BRepAdaptor_Surface surface;
};

std::optional<gp_Ax1> rotationAxis(const BRepAdaptor_Surface& surface) {
    switch (surface.GetType()) {
    case GeomAbs_Cylinder: return surface.Cylinder().Axis();
    case GeomAbs_Cone: return surface.Cone().Axis();
    case GeomAbs_Torus: return surface.Torus().Axis();
    case GeomAbs_SurfaceOfRevolution: return surface.AxeOfRevolution();
    default: return std::nullopt;
    }
}

bool inwardSphere(const Patch& patch) {
    return patch.surface.GetType() == GeomAbs_Sphere &&
        (patch.face.Orientation() == TopAbs_FORWARD) != patch.surface.Sphere().Direct();
}

gp_Ax1 stableAxis(gp_Ax1 axis) {
    const auto direction = axis.Direction();
    const std::array xyz{direction.X(), direction.Y(), direction.Z()};
    const auto dominant = std::ranges::max_element(xyz, {}, [](double x) { return std::abs(x); });
    if (*dominant < 0) axis.Reverse();
    return axis;
}
}

bool coaxial(const gp_Ax1& left, const gp_Ax1& right) {
    return left.IsParallel(right, Precision::Angular()) &&
           gp_Lin(left).Distance(right.Location()) <= lengthTolerance;
}

std::optional<gp_Ax1> inwardAxis(const TopoDS_Face& face) {
    const BRepAdaptor_Surface surface(face);
    const auto axis = rotationAxis(surface);
    if (!axis) return std::nullopt;
    // A complete torus has both inward- and outward-facing bands.
    if (surface.GetType() == GeomAbs_Torus &&
        surface.IsUClosed() && surface.IsVClosed()) return std::nullopt;
    gp_Pnt p;
    gp_Vec du, dv;
    surface.D1((surface.FirstUParameter() + surface.LastUParameter()) / 2,
               (surface.FirstVParameter() + surface.LastVParameter()) / 2, p, du, dv);
    const gp_Vec axial(axis->Direction()), fromAxis(axis->Location(), p);
    const auto radial = fromAxis - axial * fromAxis.Dot(axial);
    const auto normal = du.Crossed(dv) * (face.Orientation() == TopAbs_REVERSED ? -1 : 1);
    return normal.Dot(radial) < -Precision::Angular() * normal.Magnitude() * radial.Magnitude()
        ? std::optional{stableAxis(*axis)} : std::nullopt;
}

gp_Ax3 radialFrame(const gp_Ax1& axis, double station) {
    const auto origin = axis.Location().Translated(gp_Vec(axis.Direction()) * station);
    const auto guide = std::abs(axis.Direction().X()) < .9 ? gp::DX() : gp::DY();
    const auto normal = guide.Crossed(axis.Direction());
    return {origin, normal, axis.Direction().Crossed(normal)};
}

Handle(Geom_TrimmedCurve) meridian(const TopoDS_Face& face, const Band& band) {
    const BRepAdaptor_Surface surface(face);
    const auto u = surface.FirstUParameter();
    if (std::abs(surface.LastUParameter() - u - 2 * std::numbers::pi) > 1e-5)
        throw std::runtime_error("Edit Profile requires a complete turn");
    const auto first = surface.FirstVParameter(), last = surface.LastVParameter();
    const auto axis = band.axis();
    const auto radial = gp_Vec(axis.Location(), surface.Value(u, (first + last) / 2));
    const gp_Vec axial(axis.Direction());
    const auto across = radial - axial * radial.Dot(axial);
    const auto phase = across.AngleWithRef(gp_Vec(band.frame.XDirection()), axial);
    Handle(Geom_TrimmedCurve) curve =
        new Geom_TrimmedCurve(BRep_Tool::Surface(face)->UIso(u), first, last);
    curve->Rotate(axis, phase);
    return curve;
}

namespace {
std::optional<std::array<double, 2>> capRadii(const Patch& patch, const gp_Ax1& axis) {
    if (patch.surface.GetType() != GeomAbs_Plane ||
        !patch.surface.Plane().Axis().IsParallel(axis, Precision::Angular())) return std::nullopt;
    TopTools_IndexedMapOfShape wires, edges;
    TopExp::MapShapes(patch.face, TopAbs_WIRE, wires);
    TopExp::MapShapes(patch.face, TopAbs_EDGE, edges);
    if (wires.Extent() != edges.Extent() || edges.Extent() < 1 || edges.Extent() > 2)
        return std::nullopt;
    std::array<double, 2> radii{};
    for (int i = 1; i <= edges.Extent(); ++i) {
        const BRepAdaptor_Curve rim(TopoDS::Edge(edges(i)));
        if (rim.GetType() != GeomAbs_Circle ||
            gp_Lin(axis).Distance(rim.Circle().Location()) > lengthTolerance ||
            rim.LastParameter() - rim.FirstParameter() <
                2 * std::numbers::pi - geometry_policy::fullCircleAngleRad) return std::nullopt;
        radii[i - 1] = rim.Circle().Radius();
    }
    if (radii[0] > radii[1]) std::swap(radii[0], radii[1]);
    return radii;
}

void checkDimple(const gp_Sphere& sphere, const Band& band) {
    const auto center = sphere.Location();
    const auto height = gp_Vec(band.frame.Location(), center).Dot(gp_Vec(band.axis().Direction()));
    const auto radius = sphere.Radius();
    if (height - radius <= lengthTolerance || height + radius >= band.height - lengthTolerance ||
        gp_Lin(band.axis()).Distance(center) <= radius + lengthTolerance)
        throw std::runtime_error("Edit Profile requires isolated dimples between the caps");
    for (const auto& dimple : band.dimples)
        if (center.Distance(dimple.sphere.Location()) <= radius + dimple.sphere.Radius() + lengthTolerance)
            throw std::runtime_error("Edit Profile requires separated spherical dimples");
}

const Operand& selectedBody(const Tree& input, const std::vector<Operand>& bodies) {
    const auto id = input.get<std::string>("body");
    const auto body = std::ranges::find(bodies, id, &Operand::id);
    if (body == bodies.end()) throw std::runtime_error("Profile body no longer exists");
    return *body;
}

using Selection = std::unordered_set<std::string>;

bool centeredSide(const Patch& patch, const gp_Ax1& axis) {
    if (const auto other = rotationAxis(patch.surface)) return coaxial(axis, *other);
    return patch.surface.GetType() == GeomAbs_Sphere &&
           gp_Lin(axis).Distance(patch.surface.Sphere().Location()) <= lengthTolerance;
}

gp_Ax1 exteriorAxis(const std::vector<Patch>& patches, const Selection& selected) {
    std::optional<gp_Ax1> fallback;
    for (const auto& patch : patches) {
        const auto candidate = rotationAxis(patch.surface);
        if (!candidate || inwardAxis(patch.face)) continue;
        if (selected.contains(patch.id)) return stableAxis(*candidate);
        if (!fallback) fallback = stableAxis(*candidate);
    }
    if (!fallback && patches.size() == 1 && patches.front().surface.GetType() == GeomAbs_Sphere &&
        !inwardSphere(patches.front()))
        fallback = stableAxis(patches.front().surface.Sphere().Position().Axis());
    if (!fallback) throw std::runtime_error("Select the turned exterior or a through-bore wall");
    return *fallback;
}

std::vector<Patch> surfacePatches(const Operand& carrier) {
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(carrier.shape, TopAbs_FACE, faces);
    std::vector<Patch> patches;
    for (int i = 1; i <= faces.Extent(); ++i) {
        const auto& shape = faces(i);
        const auto source = std::ranges::find_if(carrier.entities, [&](const auto& e) { return e.shape.IsSame(shape); });
        if (source == carrier.entities.end()) throw std::runtime_error("A turned face lost its source");
        const auto face = TopoDS::Face(shape);
        patches.push_back({source->id, face, BRepAdaptor_Surface(face)});
    }
    return patches;
}

Band inspectCarrier(const Operand& body, const Operand& carrier, const std::vector<Patch>& patches,
                    Selection selected, const gp_Ax1& axis) {
    const auto [low, high] = axialStations(carrier.shape, axis);
    Band band{body, radialFrame(axis, low), high - low};
    if (band.height <= lengthTolerance) throw std::runtime_error("The turned profile has no axial span");
    Selection boreWalls;
    for (const auto& patch : patches) {
        if (const auto radii = capRadii(patch, axis)) {
            const double y = gp_Vec(band.frame.Location(), patch.surface.Plane().Location()).Dot(gp_Vec(axis.Direction()));
            band.meridians.push_back({patch.id,
                GC_MakeSegment(band.at((*radii)[0], y), band.at((*radii)[1], y)).Value()});
            selected.erase(patch.id);
        } else if (inwardSphere(patch)) {
            const auto sphere = patch.surface.Sphere();
            checkDimple(sphere, band);
            band.dimples.push_back({patch.id, sphere});
        } else if (centeredSide(patch, axis)) {
            band.meridians.push_back({patch.id, meridian(patch.face, band)});
            selected.erase(patch.id);
        } else if (!boreWalls.contains(patch.id)) {
            if (!inwardAxis(patch.face))
                throw std::runtime_error("The turned exterior has an unsupported neighboring surface");
            auto bore = throughBore(carrier, {patch.id, patch.face});
            for (const auto& wall : bore.walls) boreWalls.insert(wall.id);
            band.bores.push_back(std::move(bore));
        }
    }
    if (!selected.empty()) throw std::runtime_error("Select faces on one turned exterior");
    return band;
}

Band inspectHealed(const Operand& body, const std::vector<SourceEntity>& cuts,
                   const Selection& selected, const gp_Ax1& axis, bool verifyRecovery) {
    auto healed = healSelectedFaces(body, cuts);
    Operand carrier{body.id, healed.shape, std::move(healed.predecessors)};
    if (verifyRecovery) {
        std::vector<SourceEntity> unused;
        const auto recut = recutParallel(carrier.shape, cuts, unused);
        verifySameMaterial(body.shape, recut, "The lengthwise cut could not be recovered from its surrounding surfaces");
    }
    auto band = inspectCarrier(body, carrier, surfacePatches(carrier), selected, axis);
    band.parallelCuts = cuts;
    return band;
}

bool exactSectionSupports(const Band& band, const std::vector<Patch>& patches) {
    return std::ranges::all_of(patches, [&](const auto& patch) {
        if (std::ranges::find(band.parallelCuts, patch.id, &SourceEntity::id) != band.parallelCuts.end())
            return true;
        const auto type = patch.surface.GetType();
        const bool axialCap = type == GeomAbs_Plane &&
            patch.surface.Plane().Axis().IsParallel(band.axis(), Precision::Angular());
        return (axialCap || centeredSide(patch, band.axis())) &&
            std::ranges::find(band.meridians, patch.id, &Meridian::face) != band.meridians.end();
    });
}

Band inspectExterior(const Operand& body, const std::vector<Patch>& patches, Selection selected,
                     bool verifyRecovery) {
    const auto axis = exteriorAxis(patches, selected);
    std::vector<SourceEntity> cuts;
    for (const auto& patch : patches) {
        if (patch.surface.GetType() != GeomAbs_Cylinder) continue;
        const auto cut = inwardAxis(patch.face);
        if (cut && cut->IsParallel(axis, Precision::Angular()) && !coaxial(*cut, axis))
            cuts.push_back({patch.id, patch.face});
    }
    if (cuts.empty()) return inspectCarrier(body, body, patches, std::move(selected), axis);
    if (!hasSplitCut(cuts))
        return inspectHealed(body, cuts, selected, axis, verifyRecovery);
    auto band = sectionProfile(body, axis, std::move(cuts));
    for (const auto& span : band.meridians) selected.erase(span.face);
    if (!selected.empty()) throw std::runtime_error("Select faces on one turned exterior");
    if (verifyRecovery) verifySectionRecovery(band, exactSectionSupports(band, patches));
    return band;
}
}

gp_Pnt Band::at(double radius, double height) const {
    return frame.Location().Translated(gp_Vec(frame.XDirection()) * radius +
                                       gp_Vec(frame.YDirection()) * height);
}

Band inspect(const Tree& input, const std::vector<Operand>& bodies, bool verifyRecovery) {
    const auto& body = selectedBody(input, bodies);
    Selection selected;
    for (const auto& entry : input.get_child("faces")) selected.insert(entry.second.get_value<std::string>());
    TopTools_IndexedMapOfShape exterior;
    if (!selected.empty())
        TopExp::MapShapes(BRepClass3d::OuterShell(TopoDS::Solid(body.shape)), TopAbs_FACE, exterior);
    for (const auto& entity : body.entities) {
        if (!selected.contains(entity.id) || !exterior.Contains(entity.shape)) continue;
        const auto face = TopoDS::Face(entity.shape);
        if (!inwardAxis(face)) continue;
        const auto bore = throughBore(body, entity);
        if (!std::ranges::all_of(selected, [&](const auto& id) {
                return std::ranges::find(bore.walls, id, &SourceEntity::id) != bore.walls.end();
            }))
            throw std::runtime_error("Select faces on one through-bore wall");
        auto stock = healSelectedFaces(body, bore.walls);
        auto band = boreProfile(body, bore, stock.shape);
        band.stock = std::move(stock);
        return band;
    }
    return inspectExterior(body, surfacePatches(body), std::move(selected), verifyRecovery);
}
}
