#include "revolved-profile.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRep_Tool.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
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

bool diskCap(const Patch& patch, const gp_Ax1& axis) {
    if (!patch.surface.Plane().Axis().IsParallel(axis, Precision::Angular())) return false;
    TopTools_IndexedMapOfShape wires, edges;
    TopExp::MapShapes(patch.face, TopAbs_WIRE, wires);
    TopExp::MapShapes(patch.face, TopAbs_EDGE, edges);
    if (wires.Extent() != 1 || edges.Extent() != 1) return false;
    const BRepAdaptor_Curve rim(TopoDS::Edge(edges(1)));
    return rim.GetType() == GeomAbs_Circle &&
        gp_Lin(axis).Distance(rim.Circle().Location()) <= lengthTolerance &&
        rim.LastParameter() - rim.FirstParameter() >=
            2 * std::numbers::pi - geometry_policy::fullCircleAngleRad;
}

Handle(Geom_TrimmedCurve) meridian(const Patch& patch, const Band& band) {
    const auto& surface = patch.surface;
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
        new Geom_TrimmedCurve(BRep_Tool::Surface(patch.face)->UIso(u), first, last);
    curve->Rotate(axis, phase);
    return curve;
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

Band inspectPatches(const Operand& body, const std::vector<Patch>& sides,
                    std::vector<Patch>& caps, const std::vector<Patch>& dimples, gp_Ax1 axis) {
    if (caps.size() != 2 || !std::ranges::all_of(caps, [&](const auto& p) { return diskCap(p, axis); }))
        throw std::runtime_error("Edit Profile requires two circular end caps");
    const gp_Vec direction(axis.Direction());
    const auto station = [&](const Patch& cap) {
        return gp_Vec(axis.Location(), cap.surface.Plane().Location()).Dot(direction);
    };
    std::ranges::sort(caps, {}, station);
    const auto origin = axis.Location().Translated(direction * station(caps.front()));
    const auto height = station(caps.back()) - station(caps.front());
    if (height <= lengthTolerance) throw std::runtime_error("Profile end caps must be separated");
    const auto guide = std::abs(axis.Direction().X()) < .9 ? gp::DX() : gp::DY();
    const gp_Dir normal(guide.Crossed(axis.Direction()));
    const gp_Dir radial(axis.Direction().Crossed(normal));
    Band band{body, gp_Ax3(origin, normal, radial), height, {caps[0].id, caps[1].id}, {}, {}};
    for (const auto& patch : sides) {
        if (const auto other = rotationAxis(patch.surface)) {
            if (!axis.IsParallel(*other, Precision::Angular()) ||
                gp_Lin(axis).Distance(other->Location()) > lengthTolerance)
                throw std::runtime_error("The selected surfaces must share an axis");
        } else if (gp_Lin(axis).Distance(patch.surface.Sphere().Location()) > lengthTolerance) {
            throw std::runtime_error("The selected surfaces must share an axis");
        }
        band.meridians.push_back({patch.id, meridian(patch, band)});
    }
    for (const auto& patch : dimples) {
        const auto sphere = patch.surface.Sphere();
        checkDimple(sphere, band);
        band.dimples.push_back({patch.id, sphere});
    }
    return band;
}
}

gp_Pnt Band::at(double radius, double height) const {
    return frame.Location().Translated(gp_Vec(frame.XDirection()) * radius +
                                       gp_Vec(frame.YDirection()) * height);
}

Band inspect(const Tree& input, const std::vector<Operand>& bodies) {
    const auto& body = selectedBody(input, bodies);
    TopTools_IndexedMapOfShape shells;
    TopExp::MapShapes(body.shape, TopAbs_SHELL, shells);
    if (shells.Extent() != 1)
        throw std::runtime_error("Edit Profile requires one exterior shell");
    std::unordered_set<std::string> selected;
    for (const auto& entry : input.get_child("faces")) selected.insert(entry.second.get_value<std::string>());
    const bool wholeBody = selected.empty();
    std::vector<Patch> sides, caps, dimples;
    std::optional<gp_Ax1> axis;
    for (const auto& entity : body.entities) {
        if (entity.shape.ShapeType() != TopAbs_FACE) continue;
        const auto face = TopoDS::Face(entity.shape);
        Patch patch{entity.id, face, BRepAdaptor_Surface(face)};
        const auto kind = patch.surface.GetType();
        if (kind == GeomAbs_Plane) caps.push_back(patch);
        else if (inwardSphere(patch)) dimples.push_back(patch);
        else if ((wholeBody || selected.erase(entity.id)) &&
                 (rotationAxis(patch.surface) || kind == GeomAbs_Sphere)) {
            if (!axis) axis = rotationAxis(patch.surface);
            sides.push_back(patch);
        } else throw std::runtime_error("Select the entire revolved side between the end caps");
    }
    if (!axis || !selected.empty()) throw std::runtime_error("Select a band of coaxial revolved faces");
    return inspectPatches(body, sides, caps, dimples, stableAxis(*axis));
}
}

void describeRevolvedProfile(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto band = revolved_profile::inspect(input, bodies);
    Tree frame;
    out << "{\"profile\":{\"height\":" << band.height << ",\"frame\":{";
    const auto coordinate = [&](const char* key, const gp_XYZ& xyz) {
        out << quoted(key) << ":[" << xyz.X() << ',' << xyz.Y() << ',' << xyz.Z() << ']';
        Tree values;
        for (double n : {xyz.X(), xyz.Y(), xyz.Z()}) {
            Tree value;
            value.put_value(n);
            values.push_back({"", value});
        }
        frame.add_child(key, values);
    };
    coordinate("origin", band.frame.Location().XYZ());
    out << ',';
    coordinate("u", band.frame.XDirection().XYZ());
    out << ',';
    coordinate("v", band.frame.YDirection().XYZ());
    out << "},\"spans\":[";
    for (std::size_t i = 0; i < band.meridians.size(); ++i) {
        if (i) out << ',';
        const auto& entry = band.meridians[i];
        out << "{\"face\":" << quoted(entry.face) << ",\"curves\":";
        planarSketchCurves(out, BRepBuilderAPI_MakeEdge(entry.curve).Edge(), frame);
        out << '}';
    }
    out << "]}}";
}
