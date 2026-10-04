#include "screw-sweep.h"
#include "timing.h"
#include "sweep-boundary-distance.h"
#include "extrude-twist-curves.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepGProp.hxx>
#include <BRepOffsetAPI_MakeOffset.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <GProp_GProps.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <TopExp_Explorer.hxx>
#include <Approx_ParametrizationType.hxx>
#include <cmath>
#include <numbers>
#include <stdexcept>
#include <limits>

namespace {
constexpr double tolerance = 1e-6;
double area(const TopoDS_Shape& shape) {
    GProp_GProps props; BRepGProp::SurfaceProperties(shape, props); return props.Mass();
}
int edgeCount(const TopoDS_Wire& wire) {
    int count = 0;
    for (BRepTools_WireExplorer e(wire); e.More(); e.Next()) ++count;
    return count;
}
std::vector<gp_Pnt> wirePoints(const TopoDS_Wire& wire, bool middle = false) {
    std::vector<gp_Pnt> points;
    for (BRepTools_WireExplorer e(wire); e.More(); e.Next()) {
        BRepAdaptor_Curve curve(e.Current());
        points.push_back(curve.Value(middle ? (curve.FirstParameter() + curve.LastParameter()) / 2
            : e.Current().Orientation() == TopAbs_REVERSED ? curve.LastParameter() : curve.FirstParameter()));
    }
    return points;
}
TopoDS_Wire align(const TopoDS_Wire& source, const TopoDS_Wire& contour) {
    // End-cap wires may have the opposite orientation and a different first
    // edge. Establish correspondence before rotating, so loft compatibility
    // cannot erase the requested turns. Intermediate contour checks remain
    // authoritative if a large offset makes this correspondence ambiguous.
    const auto original = wirePoints(source), centers = wirePoints(source, true);
    double best = std::numeric_limits<double>::infinity();
    TopoDS_Wire result;
    for (const auto& candidate : {contour, TopoDS::Wire(contour.Reversed())}) {
        const auto points = wirePoints(candidate), mids = wirePoints(candidate, true);
        std::vector<TopoDS_Edge> edges;
        for (BRepTools_WireExplorer e(candidate); e.More(); e.Next()) edges.push_back(e.Current());
        for (size_t shift = 0; shift < points.size(); ++shift) {
            double score = 0;
            for (size_t i = 0; i < original.size(); ++i)
                score += original[i].SquareDistance(points[(i + shift) % points.size()])
                    + centers[i].SquareDistance(mids[(i + shift) % points.size()]);
            if (score >= best) continue;
            best = score;
            BRepBuilderAPI_MakeWire builder;
            for (size_t i = 0; i < edges.size(); ++i) builder.Add(edges[(i + shift) % edges.size()]);
            result = builder.Wire();
        }
    }
    return result;
}
struct Sections {
    TopoDS_Face base;
    TopoDS_Wire wire;
    gp_Pln plane;
    gp_Ax1 axis;
    gp_Vec travel;
    double angle, offset;
    bool analytic() const {
        for (BRepTools_WireExplorer e(wire); e.More(); e.Next()) {
            BRepAdaptor_Curve curve(e.Current());
            if (curve.GetType() != GeomAbs_Line && curve.GetType() != GeomAbs_Circle) return false;
        }
        return true;
    }
    TopoDS_Wire curvedDraft(double t) const {
        Tree input; input.put("draft.mode", "offset"); input.put("draft.value", offset * t);
        const auto drafted = extrudeDraft(base, travel * t, input);
        const auto end = plane.Location().Translated(travel * t);
        for (TopExp_Explorer e(drafted, TopAbs_FACE); e.More(); e.Next()) {
            const auto face = TopoDS::Face(e.Current());
            BRepAdaptor_Surface surface(face);
            if (surface.GetType() != GeomAbs_Plane || surface.Plane().Distance(end) > 1e-7 ||
                std::abs(surface.Plane().Axis().Direction().Dot(plane.Axis().Direction())) < 1 - 1e-7) continue;
            gp_Trsf back; back.SetTranslation(-travel * t);
            return TopoDS::Wire(BRepBuilderAPI_Transform(BRepTools::OuterWire(face), back, true).Shape());
        }
        throw std::runtime_error("Cannot find the curved draft end section");
    }
    TopoDS_Wire at(double t) const {
        auto contour = wire;
        if (std::abs(offset * t) > 1e-10) {
            if (!analytic()) contour = curvedDraft(t);
            else {
                BRepOffsetAPI_MakeOffset parallel(base, GeomAbs_Intersection);
                parallel.Perform(offset * t);
                if (!parallel.IsDone()) throw std::runtime_error("Twisted draft cannot offset this boundary");
                contour.Nullify();
                for (TopExp_Explorer e(parallel.Shape(), TopAbs_WIRE); e.More(); e.Next()) {
                    if (!contour.IsNull()) throw std::runtime_error("Twisted draft splits the profile");
                    contour = TopoDS::Wire(e.Current());
                }
            }
            if (contour.IsNull()) throw std::runtime_error("Twisted draft collapses the profile boundary");
            if (edgeCount(contour) != edgeCount(wire))
                throw std::runtime_error("Twisted draft changes the profile boundary topology");
            contour = align(wire, contour);
            const auto face = BRepBuilderAPI_MakeFace(plane, contour, true).Face();
            validate(face);
            const auto a = area(base), b = area(face);
            std::vector<SourceEntity> unused;
            const auto common = booleanShape(base, face, "intersect", unused);
            const auto expected = offset > 0 ? a : b;
            if (b < 1e-10 || (b - a) * offset <= 0 ||
                std::abs(area(common) - expected) > 1e-7 * std::max(1.0, expected))
                throw std::runtime_error("Twisted draft inverts or intersects the profile");
        }
        if (offset != 0 && !analytic()) contour = twistSectionParameters(contour);
        gp_Trsf transform; transform.SetRotation(axis, angle * t);
        if (const auto center = twistCircleCenter(contour)) {
            // A circular section's spin changes only its seam, not its geometry.
            // Keep corresponding rim parameters fixed while its center orbits.
            // This avoids a needlessly twisted periodic loft surface.
            const auto moved = center->Transformed(transform);
            transform.SetTranslation(gp_Vec(*center, moved));
        }
        transform.SetTranslationPart(gp_Vec(transform.TranslationPart()) + travel * t);
        return TopoDS::Wire(BRepBuilderAPI_Transform(contour, transform, true).Shape());
    }
};
bool followsSections(const TopoDS_Shape& shape, const Sections& sections, int count) {
    // Reserve half of the founder-approved 0.001 mm curved-tool budget for
    // draft construction and section parameterization, half for the loft.
    const double sectionTolerance = sections.analytic() ? tolerance : 5e-4;
    TopExp_Explorer shells(shape, TopAbs_SHELL);
    if (!shells.More()) return false;
    const auto boundary = shells.Current();
    SweepBoundaryDistance distance(boundary);
    // Independent samples between construction stations check the requested
    // rotating parallel contours, not merely the loft's interpolated end caps.
    for (int i = 0; i < count; ++i) {
        const auto wire = sections.at((i + 0.5) / count);
        for (BRepTools_WireExplorer e(wire); e.More(); e.Next()) {
            BRepAdaptor_Curve curve(e.Current());
            for (int j = 0; j <= 8; ++j) {
                const double u = curve.FirstParameter() +
                    (curve.LastParameter() - curve.FirstParameter()) * j / 8;
                if (!distance.within(curve.Value(u), sectionTolerance)) return false;
            }
        }
    }
    return true;
}
TopoDS_Shape sweepBoundary(const Sections& sections) {
    const double steps = std::max(4.0, std::ceil(std::abs(sections.angle) / (std::numbers::pi / 12)));
    if (steps > 4096) throw std::runtime_error("Twist exceeds the supported sweep size");
    int count = static_cast<int>(steps);
    for (int attempt = 0; attempt < 5 && count <= 4096; ++attempt, count *= 2) {
        KernelTiming timing("twist-stations-" + std::to_string(count));
        BRepOffsetAPI_ThruSections loft(true, false, 1e-7);
        // Corresponding vertices must rotate together, including full turns.
        // Compatibility optimization may otherwise untwist symmetric sections.
        loft.CheckCompatibility(false);
        loft.SetParType(Approx_IsoParametric);
        loft.SetMaxDegree(8);
        loft.SetContinuity(GeomAbs_C2);
        for (int i = 0; i <= count; ++i) loft.AddWire(twistLoftSection(sections.at(double(i) / count)));
        timing.phase("sections");
        loft.Build();
        timing.phase("loft");
        if (!loft.IsDone()) throw std::runtime_error("Cannot construct the twisted extrusion");
        const bool follows = followsSections(loft.Shape(), sections, count);
        timing.phase(follows ? "accuracy-pass" : "accuracy-retry");
        if (!follows) continue;
        validateSweptSolids(loft.Shape());
        timing.phase("validate");
        return loft.Shape();
    }
    throw std::runtime_error("Twisted extrusion could not meet section accuracy; reduce twist or draft");
}
}
TopoDS_Shape extrudeTwist(const TopoDS_Face& face, const gp_Vec& travel, const Tree& input) {
    const double degrees = input.get<double>("twist.angle");
    if (!std::isfinite(degrees)) throw std::runtime_error("Twist needs a finite angle");
    if (degrees == 0) return extrudeDraft(face, travel, input);
    const auto origin = point(input.get_child("twist.origin"));
    if (!std::isfinite(origin.X()) || !std::isfinite(origin.Y()) || !std::isfinite(origin.Z()))
        throw std::runtime_error("Twist needs a finite axis origin");
    BRepAdaptor_Surface support(face);
    if (support.GetType() != GeomAbs_Plane) throw std::runtime_error("Twist needs planar profiles");
    const auto plane = support.Plane();
    if (plane.Distance(origin) > tolerance)
        throw std::runtime_error("Twist axis origin must lie in every source plane");
    const auto n = point(input.get_child("normal"));
    const gp_Ax1 axis(origin, gp_Dir(n.X(), n.Y(), n.Z()));
    bool invariant = true;
    for (TopExp_Explorer e(face, TopAbs_WIRE); e.More(); e.Next()) {
        const auto center = twistCircleCenter(TopoDS::Wire(e.Current()));
        invariant &= center && center->Distance(origin) <= tolerance;
    }
    if (invariant) return extrudeDraft(face, travel, input);
    const double angle = degrees * std::numbers::pi / 180;
    const double offset = extrusionDraftOffset(travel, input);
    const auto outer = BRepTools::OuterWire(face);
    auto shape = sweepBoundary({BRepBuilderAPI_MakeFace(plane, outer, true).Face(), outer,
        plane, axis, travel, angle, offset});
    bool cutHoles = false;
    for (TopExp_Explorer e(face, TopAbs_WIRE); e.More(); e.Next()) {
        if (e.Current().IsSame(outer)) continue;
        cutHoles = true;
        const auto wire = BRepTools::OuterWire(BRepBuilderAPI_MakeFace(plane, TopoDS::Wire(e.Current()), true).Face());
        const auto hole = sweepBoundary({BRepBuilderAPI_MakeFace(plane, wire, true).Face(), wire,
            plane, axis, travel, angle, -offset});
        const double expected = volume(shape) - volume(hole);
        std::vector<SourceEntity> unused;
        shape = booleanShape(shape, hole, "subtract", unused);
        if (expected <= 1e-10 || std::abs(volume(shape) - expected) > 1e-6 * std::max(1.0, expected))
            throw std::runtime_error("Twisted draft makes profile walls collide");
    }
    // sweepBoundary already validates the unchanged outer solid. A Boolean
    // result needs its own check after holes have changed that boundary.
    if (cutHoles) validateSweptSolids(shape);
    return shape;
}
