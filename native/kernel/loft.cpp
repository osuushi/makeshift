#include "kernel.h"
#include "loft-wire.h"
#include "screw-sweep.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepGProp.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRepTools.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
struct Hole { TopoDS_Wire wire; double x, y; };
std::vector<Hole> holes(const TopoDS_Face& face, const Tree& profile) {
    const auto& frame = profile.get_child("frame");
    const auto u = point(frame.get_child("u")), v = point(frame.get_child("v"));
    const gp_Vec ux(u.X(),u.Y(),u.Z()), vy(v.X(),v.Y(),v.Z());
    const auto plane = gp_Pln(gp_Ax3(point(frame.get_child("origin")), gp_Dir(ux.Crossed(vy)), gp_Dir(ux)));
    gp_Trsf local; local.SetTransformation(plane.Position());
    const auto outer = BRepTools::OuterWire(face);
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(outer, local, true).Shape(), bounds, false, false);
    double x0,y0,z0,x1,y1,z1; bounds.Get(x0,y0,z0,x1,y1,z1);
    std::vector<Hole> result;
    for (TopExp_Explorer e(face, TopAbs_WIRE); e.More(); e.Next()) {
        auto wire = TopoDS::Wire(e.Current());
        if (wire.IsSame(outer)) continue;
        GProp_GProps props;
        BRepGProp::SurfaceProperties(BRepBuilderAPI_MakeFace(plane, wire, true).Face(), props);
        auto center = props.CentreOfMass(); center.Transform(local);
        result.push_back({wire, (center.X()-x0)/(x1-x0), (center.Y()-y0)/(y1-y0)});
    }
    return result;
}
std::vector<TopoDS_Wire> matchedHoles(const std::vector<Hole>& previous, const std::vector<Hole>& current) {
    if (previous.size() != current.size()) throw std::runtime_error("Loft sections must have matching hole counts");
    std::vector<TopoDS_Wire> result;
    std::vector<bool> used(current.size(), false);
    for (const auto& hole : previous) {
        double best = 1e100, second = 1e100; std::size_t index = 0;
        for (std::size_t i = 0; i < current.size(); ++i) {
            const double distance = std::hypot(hole.x-current[i].x, hole.y-current[i].y);
            if (distance < best) { second = best; best = distance; index = i; }
            else second = std::min(second, distance);
        }
        if (second-best < 1e-6) throw std::runtime_error("Loft hole correspondence is ambiguous; separate or reposition the holes");
        if (used[index]) throw std::runtime_error("Loft hole correspondence is ambiguous; separate or reposition the holes");
        used[index] = true; result.push_back(current[index].wire);
    }
    return result;
}
TopoDS_Shape build(const std::vector<TopoDS_Wire>& wires, bool ruled, const std::vector<int>& alignment) {
    BRepOffsetAPI_ThruSections builder(true, ruled, 1e-7);
    builder.SetMutableInput(false);
    builder.CheckCompatibility(false);
    builder.SetParType(Approx_IsoParametric);
    for (const auto& wire : compatibleLoftWires(wires, alignment)) builder.AddWire(wire);
    builder.Build();
    if (!builder.IsDone()) throw std::runtime_error("Cannot construct loft through these sections");
    validateSweptSolids(builder.Shape());
    return builder.Shape();
}
}
TopoDS_Shape loftSections(const Tree& input, const std::vector<Operand>& bodies) {
    std::vector<TopoDS_Face> faces;
    for (const auto& item : input.get_child("profiles")) {
        const auto face = profileFace(item.second, bodies);
        if (BRepAdaptor_Surface(face).GetType() != GeomAbs_Plane)
            throw std::runtime_error("Loft requires planar sections");
        faces.push_back(face);
    }
    if (faces.size() < 2 || faces.size() > 256) throw std::runtime_error("Loft needs 2–256 ordered sections");
    std::vector<int> alignment;
    if (const auto values = input.get_child_optional("alignment"))
        for (const auto& value : *values) alignment.push_back(value.second.get_value<int>());
    if (!alignment.empty() && alignment.size() != faces.size())
        throw std::runtime_error("Loft alignment must match the section count");
    const bool ruled = input.get<bool>("ruled");
    std::vector<TopoDS_Wire> outer;
    std::vector<std::vector<TopoDS_Wire>> inner;
    std::vector<Tree> profiles;
    for (const auto& item : input.get_child("profiles")) profiles.push_back(item.second);
    auto reference = holes(faces.front(), profiles.front());
    inner.resize(reference.size());
    for (std::size_t i = 0; i < faces.size(); ++i) {
        outer.push_back(BRepTools::OuterWire(faces[i]));
        auto current = holes(faces[i], profiles[i]);
        const auto matched = matchedHoles(reference, current);
        for (std::size_t h = 0; h < matched.size(); ++h) inner[h].push_back(matched[h]);
        // Carry the ordered geometric locations through successive sections.
        std::vector<Hole> ordered;
        for (const auto& wire : matched)
            for (const auto& hole : current) if (wire.IsSame(hole.wire)) ordered.push_back(hole);
        reference = std::move(ordered);
    }
    auto result = build(outer, ruled, alignment);
    for (const auto& wires : inner) {
        const auto hollow = build(wires, ruled, alignment);
        std::vector<SourceEntity> unused;
        // The entire hole sweep must remain inside the outer loft.
        const auto outside = booleanShape(hollow, result, "subtract", unused);
        if (!outside.IsNull() && volume(outside) > 1e-7)
            throw std::runtime_error("Loft holes leave or cross the outer boundary");
        const double expected = volume(result)-volume(hollow);
        result = booleanShape(result, hollow, "subtract", unused);
        if (std::abs(volume(result)-expected) > 1e-6*std::max(1.0, expected))
            throw std::runtime_error("Loft holes intersect one another");
    }
    // build() already checked the unchanged outer solid. Hole subtraction
    // changes its boundary and requires a fresh final check.
    if (!inner.empty()) validateSweptSolids(result);
    return result;
}
