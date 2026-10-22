#include "measurement.h"
#include "sketch-curve.h"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopoDS.hxx>
#include <gp_Circ.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <stdexcept>

namespace {
struct Support {
    enum Kind { Other, Line, Plane, Circle, Cylinder } kind = Other;
    gp_Pnt origin;
    gp_Dir direction;
    double radius = 0;
};
Support support(const TopoDS_Shape& shape) {
    if (shape.ShapeType() == TopAbs_EDGE) {
        BRepAdaptor_Curve curve(TopoDS::Edge(shape));
        if (curve.GetType() == GeomAbs_Line) return {Support::Line, curve.Line().Location(), curve.Line().Direction()};
        if (curve.GetType() == GeomAbs_Circle) {
            const auto c = curve.Circle();
            return {Support::Circle, c.Location(), c.Axis().Direction(), c.Radius()};
        }
    } else {
        BRepAdaptor_Surface surface(TopoDS::Face(shape));
        if (surface.GetType() == GeomAbs_Plane) return {Support::Plane, surface.Plane().Location(), surface.Plane().Axis().Direction()};
        if (surface.GetType() == GeomAbs_Cylinder) {
            const auto c = surface.Cylinder();
            return {Support::Cylinder, c.Location(), c.Axis().Direction(), c.Radius()};
        }
    }
    return {};
}
void xyz(std::ostream& out, const gp_Pnt& p) { out << '[' << p.X() << ',' << p.Y() << ',' << p.Z() << ']'; }
void witness(std::ostream& out, const char* name, const GapWitness& w) {
    out << ',' << quoted(name) << ":{\"value\":" << w.value << ",\"points\":[";
    xyz(out, w.a); out << ','; xyz(out, w.b); out << "]}";
}
struct Property { std::string label; double value; std::string unit; };
void relations(const Support& a, const Support& b, std::vector<Property>& values, std::vector<std::string>& flags) {
    if (a.kind == Support::Other || b.kind == Support::Other) return;
    const double dot = std::clamp(std::abs(a.direction.Dot(b.direction)), 0.0, 1.0);
    const bool parallel = dot > 1 - 1e-12;
    const bool roundA = a.kind == Support::Circle || a.kind == Support::Cylinder;
    const bool roundB = b.kind == Support::Circle || b.kind == Support::Cylinder;
    if (roundA && roundB) {
        if (!parallel) return;
        const double axis = gp_Lin(a.origin, a.direction).Distance(b.origin);
        values.push_back({"Axis distance", axis, "mm"});
        if (a.kind == Support::Circle && b.kind == Support::Circle) {
            values.push_back({"Center distance", a.origin.Distance(b.origin), "mm"});
            if (a.origin.Distance(b.origin) < 1e-6) flags.push_back("Concentric");
            else if (std::abs(gp_Vec(a.origin,b.origin).Dot(gp_Vec(a.direction))) < 1e-6) flags.push_back("Coplanar");
            else flags.push_back("Parallel planes");
        } else if (axis < 1e-6) flags.push_back("Coaxial");
        else flags.push_back("Parallel axes");
        return;
    }
    if (roundA || roundB) return;
    if (a.kind == Support::Line && b.kind == Support::Line && !parallel) {
        const auto normal = gp_Vec(a.direction).Crossed(gp_Vec(b.direction)).Normalized();
        if (std::abs(gp_Vec(a.origin, b.origin).Dot(normal)) > 1e-6) {
            flags.push_back("Skew lines");
            return;
        }
    }
    double angle = std::acos(dot) * 180 / std::acos(-1.0);
    const bool mixed = a.kind != b.kind;
    if (mixed) angle = 90 - angle;
    values.push_back({mixed ? "Line–plane angle" : a.kind == Support::Plane ? "Plane angle" : "Line angle", angle, "°"});
    if (angle < 1e-6) flags.push_back("Parallel");
    if (std::abs(angle - 90) < 1e-6) flags.push_back("Perpendicular");
    if (!mixed && parallel) {
        const double gap = a.kind == Support::Plane
            ? std::abs(gp_Vec(a.origin, b.origin).Dot(gp_Vec(a.direction)))
            : gp_Lin(a.origin, a.direction).Distance(b.origin);
        if (a.direction.IsParallel(b.direction, 1e-10)) values.push_back({"Parallel distance", gap, "mm"});
        if (gap < 1e-6) flags.push_back(a.kind == Support::Plane ? "Coplanar" : "Collinear");
    }
    if (mixed && a.direction.IsNormal(b.direction, 1e-10)) {
        const auto& plane = a.kind == Support::Plane ? a : b;
        const auto& line = a.kind == Support::Line ? a : b;
        values.push_back({"Parallel distance", gp_Pln(plane.origin, plane.direction).Distance(line.origin), "mm"});
    }
}
TopoDS_Shape selected(const Tree& target, const std::vector<Operand>& bodies) {
    const auto kind = target.get<std::string>("kind");
    if (kind != "face" && kind != "edge") throw std::runtime_error("Select faces or edges to measure");
    for (const auto& body : bodies) if (body.id == target.get<std::string>("body"))
        for (const auto& entity : body.entities) if (entity.id == target.get<std::string>(kind)) {
            if (entity.shape.ShapeType() != (kind == "face" ? TopAbs_FACE : TopAbs_EDGE)) break;
            return entity.shape;
        }
    throw std::runtime_error("Measurement target no longer exists");
}
}
void measureSelection(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    std::vector<TopoDS_Shape> shapes;
    for (const auto& t : input.get_child("targets")) shapes.push_back(selected(t.second, bodies));
    if (auto curves = input.get_child_optional("curves"))
        for (const auto& curve : *curves) shapes.push_back(BRepBuilderAPI_MakeEdge(sketchCurve(curve.second)).Edge());
    if (auto profiles = input.get_child_optional("profiles"))
        for (const auto& profile : *profiles) shapes.push_back(profileFace(profile.second, bodies));
    if (shapes.empty() || shapes.size() > 2) throw std::runtime_error("Select one or two faces or edges");
    std::vector<Property> properties;
    std::vector<std::string> flags;
    const auto a = support(shapes[0]);
    if (shapes.size() == 1) {
        GProp_GProps props;
        const bool face = shapes[0].ShapeType() == TopAbs_FACE;
        if (face) BRepGProp::SurfaceProperties(shapes[0], props);
        else BRepGProp::LinearProperties(shapes[0], props);
        properties.push_back({face ? "Area" : "Length", props.Mass(), face ? "mm²" : "mm"});
        if (a.radius > 0) {
            properties.push_back({"Radius", a.radius, "mm"});
            properties.push_back({"Diameter", 2 * a.radius, "mm"});
        }
    } else relations(a, support(shapes[1]), properties, flags);
    out << std::setprecision(17) << "{\"measurement\":{\"properties\":[";
    for (size_t i = 0; i < properties.size(); ++i) {
        if (i) out << ',';
        const auto& p = properties[i];
        out << "{\"label\":" << quoted(p.label) << ",\"value\":" << p.value << ",\"unit\":" << quoted(p.unit) << '}';
    }
    out << "],\"relationships\":[";
    for (size_t i = 0; i < flags.size(); ++i) { if (i) out << ','; out << quoted(flags[i]); }
    out << ']';
    if (shapes.size() == 2) {
        BRepExtrema_DistShapeShape distance(shapes[0], shapes[1]);
        if (!distance.IsDone() || !distance.NbSolution()) throw std::runtime_error("Distance calculation failed");
        witness(out, "distance", {distance.Value(), distance.PointOnShape1(1), distance.PointOnShape2(1)});
        const auto gap = facingGaps(shapes[0], shapes[1]);
        if (gap.minimum && gap.maximum) {
            witness(out, "minimumGap", *gap.minimum); witness(out, "maximumGap", *gap.maximum);
            out << ",\"approximate\":" << (gap.approximate ? "true" : "false");
        } else out << ",\"gapReason\":\"No unambiguous facing region resolved\"";
    }
    out << "}}";
}
