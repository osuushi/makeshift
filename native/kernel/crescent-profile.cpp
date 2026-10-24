#include "crescent-profile.h"
#include "geometry-policy.h"
#include "kernel.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <GProp_GProps.hxx>
#include <Precision.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Circ.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <numbers>
#include <optional>
#include <stdexcept>

namespace {
std::optional<gp_Circ> circularWire(const TopoDS_Wire& wire) {
    std::optional<gp_Circ> circle;
    double sweep = 0;
    for (TopExp_Explorer edges(wire, TopAbs_EDGE); edges.More(); edges.Next()) {
        BRepAdaptor_Curve curve(TopoDS::Edge(edges.Current()));
        if (curve.GetType() != GeomAbs_Circle) return {};
        const auto current = curve.Circle();
        if (circle && (circle->Location().Distance(current.Location()) > Precision::Confusion() ||
                       std::abs(circle->Radius() - current.Radius()) > Precision::Confusion() ||
                       !circle->Axis().IsParallel(current.Axis(), Precision::Angular()))) return {};
        circle = current;
        sweep += curve.LastParameter() - curve.FirstParameter();
    }
    if (std::abs(sweep - 2 * std::numbers::pi) > geometry_policy::fullCircleAngleRad) return {};
    return circle;
}
double area(const TopoDS_Face& face) {
    GProp_GProps props; BRepGProp::SurfaceProperties(face, props, 1e-10);
    return props.Mass();
}
TopoDS_Face rounded(const gp_Circ& outer, const gp_Circ& inner, const gp_Dir& normal) {
    const double R = outer.Radius(), r = inner.Radius();
    const double radius = std::min({geometry_policy::crescentFilletMm, (R - r) * 0.01, r * 0.01});
    if (radius < 10 * Precision::Confusion())
        throw std::runtime_error("Tangent crescent is too small for printable pinch relief");
    const gp_Vec centers(outer.Location(), inner.Location());
    const double distance = centers.Magnitude();
    const gp_Dir u(centers), v = normal.Crossed(u);
    // Fillet centers lie on circles R-radius and r+radius. Their two
    // intersections round the two material tips without moving either support.
    const double a = R - radius, b = r + radius;
    const double x = (a * a - b * b + distance * distance) / (2 * distance);
    const double y = std::sqrt((a - x) * (a + x));
    const double theta = std::atan2(y, x), phi = std::atan2(y, x - distance);
    const double pi = std::numbers::pi;
    const auto circle = [&](double cx, double cy, double size) {
        const auto center = outer.Location().Translated(gp_Vec(u) * cx + gp_Vec(v) * cy);
        return gp_Circ(gp_Ax2(center, normal, u), size);
    };
    const auto outside = BRepBuilderAPI_MakeEdge(circle(0, 0, R), theta, 2 * pi - theta).Edge();
    const auto bottom = BRepBuilderAPI_MakeEdge(circle(x, -y, radius), -theta, pi - phi).Edge();
    const auto inside = TopoDS::Edge(BRepBuilderAPI_MakeEdge(circle(distance, 0, r), phi, 2 * pi - phi).Edge().Reversed());
    const auto top = BRepBuilderAPI_MakeEdge(circle(x, y, radius), -pi + phi, theta).Edge();
    BRepBuilderAPI_MakeWire wire;
    for (const auto& edge : {outside, bottom, inside, top}) wire.Add(edge);
    if (!wire.IsDone()) throw std::runtime_error("Cannot close rounded crescent profile");
    const auto face = BRepBuilderAPI_MakeFace(gp_Pln(outer.Location(), normal), wire.Wire(), true).Face();
    validate(face);
    return face;
}
}

TopoDS_Face printableCrescent(const TopoDS_Face& face) {
    BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Plane) return face;
    const auto outerWire = BRepTools::OuterWire(face);
    TopoDS_Wire hole;
    for (TopExp_Explorer wires(face, TopAbs_WIRE); wires.More(); wires.Next()) {
        if (wires.Current().IsSame(outerWire)) continue;
        if (!hole.IsNull()) return face;
        hole = TopoDS::Wire(wires.Current());
    }
    if (hole.IsNull()) return face;
    const auto outer = circularWire(outerWire), inner = circularWire(hole);
    if (!outer || !inner) return face;
    const double distance = outer->Location().Distance(inner->Location());
    if (distance <= Precision::Confusion() || outer->Radius() <= inner->Radius() ||
        std::abs(distance + inner->Radius() - outer->Radius()) > Precision::Confusion()) return face;
    auto normal = surface.Plane().Axis().Direction();
    if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
    const auto result = rounded(*outer, *inner, normal);
    const double before = area(face), after = area(result);
    if (!std::isfinite(after) || after <= 0 || after >= before || before - after > before * 0.01)
        throw std::runtime_error("Crescent pinch relief removes too much material");
    return result;
}
