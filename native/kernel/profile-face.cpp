#include "kernel.h"
#include "sketch-curve.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <ShapeFix_Wire.hxx>
#include <ShapeExtend_WireData.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepTools.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <TopExp_Explorer.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepCheck_Result.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <OSD_ThreadPool.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
TopoDS_Face sweepBoundaryFace(const TopoDS_Face& face) {
    for (const auto kind : {TopAbs_WIRE, TopAbs_EDGE, TopAbs_VERTEX}) {
        for (TopExp_Explorer entities(face, kind); entities.More(); entities.Next()) {
            if (entities.Current().Orientation() != TopAbs_INTERNAL) continue;
            // Internal imprints are not material boundaries. Sweeping them can
            // add internal faces to the closed shell and invalidate the solid.
            // Cleanup mutates topology, so keep the accepted source untouched.
            auto boundary = BRepBuilderAPI_Copy(face, true, false).Shape();
            BRepTools::RemoveInternals(boundary, false);
            validate(boundary);
            return TopoDS::Face(boundary);
        }
    }
    return face;
}
TopoDS_Wire wire(const Tree& spans) {
    BRepBuilderAPI_MakeWire builder;
    for (const auto& item : spans) {
        BRepBuilderAPI_MakeEdge edge(sketchCurve(item.second));
        if (!edge.IsDone()) throw std::runtime_error("Cannot construct profile span");
        builder.Add(edge.Edge());
    }
    if (!builder.IsDone()) throw std::runtime_error("Profile boundary is not a valid wire");
    ShapeFix_Wire boundary;
    boundary.Load(builder.Wire());
    boundary.SetPrecision(geometry_policy::cubicBooleanToleranceMm);
    boundary.SetMaxTolerance(geometry_policy::cubicBooleanToleranceMm);
    boundary.ModifyTopologyMode() = true;
    // Trimming a tangent cubic can leave a microscopic curve or adjoining line
    // remnant. Collapse within the contact budget on this temporary profile wire;
    // retaining them creates long sliver walls with unweldable mesh boundaries.
    for (int i = boundary.NbEdges(); i > 0; --i) {
        const int count = boundary.NbEdges();
        bool cubicJunction = false;
        for (int adjacent : {i == 1 ? count : i - 1, i, i == count ? 1 : i + 1})
            if (BRepAdaptor_Curve(boundary.WireData()->Edge(adjacent)).GetType() == GeomAbs_BezierCurve)
                cubicJunction = true;
        if (cubicJunction)
            boundary.FixSmall(i, false, geometry_policy::cubicBooleanToleranceMm);
    }
    return boundary.Wire();
}

double area(const TopoDS_Shape& shape) {
    GProp_GProps props; BRepGProp::SurfaceProperties(shape, props, 1e-10);
    return props.Mass();
}
TopoDS_Face resolveTouchingHoles(const TopoDS_Wire& outer, const std::vector<TopoDS_Wire>& holes) {
    const auto outside = BRepBuilderAPI_MakeFace(outer, true).Face();
    validate(outside);
    double expected = area(outside);
    TopTools_ListOfShape arguments, tools; arguments.Append(outside);
    for (const auto& hole : holes) {
        const auto inside = BRepBuilderAPI_MakeFace(hole, true).Face();
        validate(inside);
        expected -= area(inside);
        tools.Append(inside);
    }
    // Adding touching wires does not identify their coincident vertices. A
    // planar cut resolves those contacts without moving either boundary.
    BRepAlgoAPI_Cut cut;
    cut.SetArguments(arguments); cut.SetTools(tools);
    cut.SetNonDestructive(true);
    cut.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    cut.Build();
    if (!cut.IsDone() || cut.HasErrors()) throw std::runtime_error("Cannot resolve touching profile holes");
    validate(cut.Shape());
    TopoDS_Face face;
    for (TopExp_Explorer faces(cut.Shape(), TopAbs_FACE); faces.More(); faces.Next()) {
        if (!face.IsNull()) throw std::runtime_error("Profile holes split the selected region");
        face = TopoDS::Face(faces.Current());
    }
    if (face.IsNull() || expected <= 1e-10 ||
        std::abs(area(face) - expected) > 1e-7 * std::max(1.0, expected))
        throw std::runtime_error("Profile holes overlap or cross the outer boundary");
    return face;
}
TopoDS_Face sketchProfileFace(const Tree& profile) {
    const auto outer = wire(profile.get_child("outer"));
    std::vector<TopoDS_Wire> holes;
    BRepBuilderAPI_MakeFace builder(outer, true);
    for (const auto& hole : profile.get_child("holes")) {
        holes.push_back(wire(hole.second));
        builder.Add(TopoDS::Wire(holes.back().Reversed()));
    }
    if (!builder.IsDone()) throw std::runtime_error("Profile is not a planar face");
    const auto face = builder.Face();
    BRepCheck_Analyzer check(face);
    if (check.IsValid()) return face;
    const auto result = check.Result(face);
    if (!holes.empty() && !result.IsNull())
        for (const auto status : result->Status())
            if (status == BRepCheck_IntersectingWires) return resolveTouchingHoles(outer, holes);
    validate(face);
    return face;
}
}
TopoDS_Face profileFace(const Tree& profile, const std::vector<Operand>& bodies) {
    TopoDS_Face face;
    if (auto key = profile.get_optional<std::string>("face")) {
        bool found = false;
        for (const auto& body : bodies) for (const auto& entity : body.entities)
            if (entity.id == *key && entity.shape.ShapeType() == TopAbs_FACE) { face = TopoDS::Face(entity.shape); found = true; }
        if (!found) throw std::runtime_error("Selected face no longer exists");
    } else face = sketchProfileFace(profile);
    return sweepBoundaryFace(face);
}
