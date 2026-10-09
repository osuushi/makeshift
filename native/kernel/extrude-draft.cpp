#include "kernel.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepOffsetAPI_MakeDraft.hxx>
#include <Geom_Plane.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepGProp.hxx>
#include <BRepOffsetAPI_MakeOffset.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRepPrimAPI_MakeCone.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepTools.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pln.hxx>
#include <cmath>
#include <limits>
#include <numbers>
#include <stdexcept>

namespace {
double area(const TopoDS_Shape& shape) {
    GProp_GProps props; BRepGProp::SurfaceProperties(shape, props); return props.Mass();
}
TopoDS_Shape circularApex(const TopoDS_Wire& wire, const gp_Vec& vector, double offset) {
    TopExp_Explorer edges(wire, TopAbs_EDGE);
    if (!edges.More()) return {};
    BRepAdaptor_Curve curve(TopoDS::Edge(edges.Current()));
    edges.Next();
    if (edges.More() || curve.GetType() != GeomAbs_Circle ||
        std::abs(curve.LastParameter() - curve.FirstParameter() - 2 * std::numbers::pi) > 1e-10)
        return {};
    const auto circle = curve.Circle();
    const double endRadius = circle.Radius() + offset;
    // Angle conversion may round the exact collapse offset by a few ulps.
    // This is arithmetic equality, not a geometric tolerance for a tiny cap.
    const double epsilon = 16 * std::numeric_limits<double>::epsilon() * circle.Radius();
    if (endRadius < -epsilon)
        throw std::runtime_error("Draft collapses the profile; reduce its value");
    if (std::abs(endRadius) > epsilon) return {};
    BRepPrimAPI_MakeCone cone(gp_Ax2(circle.Location(), gp_Dir(vector)),
                             circle.Radius(), 0, vector.Magnitude());
    cone.Build();
    if (!cone.IsDone()) throw std::runtime_error("Cannot construct the drafted circular apex");
    validate(cone.Shape());
    return cone.Shape();
}
TopoDS_Shape taperedWire(const TopoDS_Wire& wire, const gp_Pln& plane,
                         const gp_Vec& vector, double offset, bool allowApex = false) {
    if (allowApex) {
        const auto cone = circularApex(wire, vector, offset);
        if (!cone.IsNull()) return cone;
    }
    const auto start = BRepBuilderAPI_MakeFace(plane, wire, true).Face();
    bool analytic = true;
    for (TopExp_Explorer ex(wire, TopAbs_EDGE); ex.More(); ex.Next()) {
        BRepAdaptor_Curve curve(TopoDS::Edge(ex.Current()));
        analytic &= curve.GetType() == GeomAbs_Line || curve.GetType() == GeomAbs_Circle;
    }
    if (!analytic) {
        BRepOffsetAPI_MakeDraft draft(start, gp_Dir(vector), std::atan(std::abs(offset) / vector.Magnitude()));
        draft.SetDraft(offset < 0);
        draft.Perform(new Geom_Plane(gp_Pln(plane.Location().Translated(vector), gp_Dir(vector))));
        if (!draft.IsDone() || draft.Shape().ShapeType() != TopAbs_SOLID)
            throw std::runtime_error("Cannot draft this curved boundary at the requested value");
        validate(draft.Shape());
        return draft.Shape();
    }
    BRepOffsetAPI_MakeOffset parallel(start, GeomAbs_Intersection);
    parallel.Perform(offset);
    if (!parallel.IsDone()) throw std::runtime_error("Draft collapses the profile; reduce its value");
    TopoDS_Wire endWire;
    for (TopExp_Explorer ex(parallel.Shape(), TopAbs_WIRE); ex.More(); ex.Next()) {
        if (!endWire.IsNull()) throw std::runtime_error("Draft splits the profile; reduce its value");
        endWire = TopoDS::Wire(ex.Current());
    }
    if (endWire.IsNull()) throw std::runtime_error("Draft collapses the profile; reduce its value");
    const auto end = BRepBuilderAPI_MakeFace(plane, endWire, true).Face();
    validate(end);
    const auto a = area(start), b = area(end);
    std::vector<SourceEntity> unused;
    const auto common = booleanShape(start, end, "intersect", unused);
    const auto expected = offset > 0 ? a : b;
    if (b < 1e-10 || (b - a) * offset <= 0 ||
        std::abs(area(common) - expected) > 1e-7 * std::max(1.0, expected))
        throw std::runtime_error("Draft would invert or intersect the profile; reduce its value");
    gp_Trsf move; move.SetTranslation(vector);
    const auto translated = BRepBuilderAPI_Transform(endWire, move, true).Shape();
    BRepOffsetAPI_ThruSections loft(true, true, 1e-7);
    loft.AddWire(BRepTools::OuterWire(start));
    loft.AddWire(TopoDS::Wire(translated));
    loft.Build();
    if (!loft.IsDone()) throw std::runtime_error("Cannot connect the drafted profile boundaries");
    validate(loft.Shape());
    return loft.Shape();
}
}
double extrusionDraftOffset(const gp_Vec& vector, const Tree& input) {
    double offset = 0;
    if (const auto draft = input.get_child_optional("draft")) {
        const auto mode = draft->get<std::string>("mode");
        const auto value = draft->get<double>("value");
        if (!std::isfinite(value)) throw std::runtime_error("Draft needs a finite value");
        if (mode == "angle") {
            if (std::abs(value) >= 90) throw std::runtime_error("Draft angle must be between -90° and 90°");
            offset = vector.Magnitude() * std::tan(value * std::numbers::pi / 180);
        } else if (mode == "offset") offset = value;
        else throw std::runtime_error("Unknown draft measurement");
    }
    return offset;
}
TopoDS_Shape extrudeDraft(const TopoDS_Face& face, const gp_Vec& vector, const Tree& input) {
    const double offset = extrusionDraftOffset(vector, input);
    if (std::abs(offset) < 1e-10) {
        BRepPrimAPI_MakePrism prism(face, vector, true);
        if (!prism.IsDone()) throw std::runtime_error("Extrusion failed");
        return prism.Shape();
    }
    BRepAdaptor_Surface base(face);
    if (base.GetType() != GeomAbs_Plane) throw std::runtime_error("Draft needs a planar profile");
    const auto outer = BRepTools::OuterWire(face);
    auto shape = taperedWire(outer, base.Plane(), vector, offset, true);
    for (TopExp_Explorer ex(face, TopAbs_WIRE); ex.More(); ex.Next()) {
        if (ex.Current().IsSame(outer)) continue;
        const auto hole = taperedWire(TopoDS::Wire(ex.Current()), base.Plane(), vector, -offset);
        const auto expected = volume(shape) - volume(hole);
        std::vector<SourceEntity> unused;
        shape = booleanShape(shape, hole, "subtract", unused);
        if (expected <= 1e-10 || std::abs(volume(shape) - expected) > 1e-7 * std::max(1.0, expected))
            throw std::runtime_error("Draft makes profile walls collide; reduce its value");
    }
    validate(shape);
    return shape;
}
