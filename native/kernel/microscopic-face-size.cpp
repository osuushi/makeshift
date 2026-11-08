#include "microscopic-face-size.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <numbers>
#include <optional>
#include <vector>

namespace {
struct Boundary {
    TopTools_IndexedMapOfShape edges, vertices, wires;
    double uncertainty = 0;
};
Boundary boundary(const TopoDS_Face& face) {
    Boundary result;
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
        result.edges.Add(e.Current());
        if (result.edges.Extent() > 8) {
            result.uncertainty = std::numeric_limits<double>::infinity();
            return result;
        }
    }
    TopExp::MapShapes(face, TopAbs_VERTEX, result.vertices);
    TopExp::MapShapes(face, TopAbs_WIRE, result.wires);
    double tolerance = BRep_Tool::Tolerance(face), scale = 1;
    for (int i = 1; i <= result.edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(result.edges(i));
        tolerance = std::max(tolerance, BRep_Tool::Tolerance(edge));
        const BRepAdaptor_Curve curve(edge);
        if (curve.GetType() != GeomAbs_Circle) continue;
        const auto c = curve.Circle();
        scale = std::max(scale, c.Radius());
        for (int axis = 1; axis <= 3; ++axis) scale = std::max(scale, std::abs(c.Location().Coord(axis)));
    }
    for (int i = 1; i <= result.vertices.Extent(); ++i) {
        const auto vertex = TopoDS::Vertex(result.vertices(i));
        tolerance = std::max(tolerance, BRep_Tool::Tolerance(vertex));
        const auto p = BRep_Tool::Pnt(vertex);
        for (int axis = 1; axis <= 3; ++axis) scale = std::max(scale, std::abs(p.Coord(axis)));
    }
    // Cover both boundary positions and floating-point differences at the
    // current placement. A value near the decision boundary must defer.
    result.uncertainty = 8*tolerance + 256*std::numeric_limits<double>::epsilon()*scale;
    return result;
}
std::optional<gp_Circ> circle(const TopoDS_Shape& edge) {
    const auto rim = TopoDS::Edge(edge);
    if (!TopExp::FirstVertex(rim).IsSame(TopExp::LastVertex(rim))) return {};
    const BRepAdaptor_Curve curve(rim);
    if (curve.GetType() != GeomAbs_Circle ||
        std::abs(curve.LastParameter() - curve.FirstParameter() - 2*std::numbers::pi) > 1e-12) return {};
    return curve.Circle();
}
std::optional<double> roundPlane(const Boundary& b, const gp_Pln& plane) {
    // One complete circular wire is a disk. Two nested complete circular wires
    // describe an annulus, including an eccentric hole; no other trims qualify.
    if (b.edges.Extent() != b.wires.Extent() || b.edges.Extent() < 1 || b.edges.Extent() > 2) return {};
    const auto a = circle(b.edges(1));
    if (!a || !a->Axis().IsParallel(plane.Axis(), 1e-12) ||
        plane.Distance(a->Location()) > b.uncertainty) return {};
    if (b.edges.Extent() == 1) return 2*a->Radius();
    const auto c = circle(b.edges(2));
    if (!c || !a->Axis().IsParallel(c->Axis(), 1e-12) ||
        plane.Distance(c->Location()) > b.uncertainty) return {};
    return std::min(std::abs(a->Radius() - c->Radius()) - a->Location().Distance(c->Location()),
                    2*std::min(a->Radius(), c->Radius()));
}
std::optional<double> convexPolygon(const TopoDS_Face& face, const Boundary& b, const gp_Dir& normal) {
    if (b.wires.Extent() != 1 || b.edges.Extent() < 3 || b.edges.Extent() > 8 ||
        b.vertices.Extent() != b.edges.Extent()) return {};
    std::vector<gp_Pnt> points;
    for (BRepTools_WireExplorer e(TopoDS::Wire(b.wires(1)), face); e.More(); e.Next()) {
        if (BRepAdaptor_Curve(e.Current()).GetType() != GeomAbs_Line) return {};
        points.push_back(BRep_Tool::Pnt(e.CurrentVertex()));
    }
    if (points.size() != static_cast<size_t>(b.edges.Extent())) return {};
    double lower = std::numeric_limits<double>::infinity(), sign = 0;
    for (size_t i = 0; i < points.size(); ++i) {
        const size_t next = (i+1)%points.size();
        const gp_Vec side(points[i], points[next]);
        const double length = side.Magnitude();
        if (length <= b.uncertainty) return {};
        lower = std::min(lower, length);
        for (size_t j = 0; j < points.size(); ++j) {
            if (j == i || j == next) continue;
            const double distance = side.Crossed(gp_Vec(points[i], points[j])).Dot(gp_Vec(normal))/length;
            if (std::abs(distance) <= b.uncertainty) return {};
            if (sign == 0) sign = std::copysign(1.0, distance);
            if (distance*sign <= 0) return {}; // Concave, self-crossing or ambiguous: inspect.
            lower = std::min(lower, std::abs(distance));
        }
    }
    // Every complete edge supports the convex polygon. These vertex-to-line
    // distances conservatively bound its minimum width and boundary clearance.
    return lower;
}
std::optional<double> cylinderBand(const BRepAdaptor_Surface& surface, const Boundary& b) {
    if (b.wires.Extent() != 1 || b.edges.Extent() != 3) return {};
    std::vector<gp_Circ> circles;
    int seams = 0;
    for (int i = 1; i <= b.edges.Extent(); ++i) {
        if (const auto c = circle(b.edges(i))) circles.push_back(*c);
        else if (BRepAdaptor_Curve(TopoDS::Edge(b.edges(i))).GetType() == GeomAbs_Line) ++seams;
        else return {};
    }
    if (circles.size() != 2 || seams != 1) return {};
    const auto cylinder = surface.Cylinder();
    for (const auto& c : circles)
        if (!c.Axis().IsParallel(cylinder.Axis(), 1e-12) ||
            std::abs(c.Radius()-cylinder.Radius()) > b.uncertainty ||
            gp_Vec(cylinder.Location(), c.Location()).Crossed(gp_Vec(cylinder.Axis().Direction())).Magnitude() > b.uncertainty) return {};
    const gp_Vec between(circles[0].Location(), circles[1].Location());
    const gp_Vec axis(cylinder.Axis().Direction());
    if (between.Crossed(axis).Magnitude() > b.uncertainty) return {};
    return std::min(std::abs(between.Dot(axis)), 2*cylinder.Radius());
}
}
FaceSizeGate faceSizeGate(const TopoDS_Face& face, double minimumSpan) {
    try {
        if (!(minimumSpan > 0) || !std::isfinite(minimumSpan)) return FaceSizeGate::inspect;
        const BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane && surface.GetType() != GeomAbs_Cylinder)
            return FaceSizeGate::inspect;
        const auto b = boundary(face);
        if (!std::isfinite(b.uncertainty)) return FaceSizeGate::inspect;
        std::optional<double> lower;
        if (surface.GetType() == GeomAbs_Plane) {
            lower = roundPlane(b, surface.Plane());
            if (!lower) lower = convexPolygon(face, b, surface.Plane().Axis().Direction());
        } else if (surface.GetType() == GeomAbs_Cylinder) lower = cylinderBand(surface, b);
        if (!lower || !std::isfinite(*lower)) return FaceSizeGate::inspect;
        const double conservative = std::nextafter(*lower-b.uncertainty, -std::numeric_limits<double>::infinity());
        // For a convex n-gon, the mean of its vertices is at least
        // (n-2)/n * lower from every supporting line: an inscribed disk has
        // radius at least lower/3. The factor four is conservative for that
        // certificate and the direct disk/annulus/cylinder bounds above.
        return conservative > 4*minimumSpan ? FaceSizeGate::safe : FaceSizeGate::inspect;
    } catch (const Standard_Failure&) {
        return FaceSizeGate::inspect;
    }
}
