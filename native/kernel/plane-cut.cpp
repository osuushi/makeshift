#include "kernel.h"
#include <BRepAlgoAPI_Section.hxx>
#include <BRepAlgoAPI_Splitter.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <BRepFeat_SplitShape.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <Precision.hxx>
#include <Geom_RectangularTrimmedSurface.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <set>
#include <stdexcept>

namespace {
struct VolumeMeasurement { double value; double uncertainty; };
VolumeMeasurement preciseVolume(const TopoDS_Shape& shape, bool splineSpans, const gp_Pln& reference) {
    GProp_GProps properties;
    // Integrate each spline span: the ordinary adaptive rule can converge to an
    // incorrect value when a face crosses internal spline knots.
    const double error = splineSpans
        ? BRepGProp::VolumePropertiesGK(shape, properties, reference, 1e-9, false, true)
        : BRepGProp::VolumeProperties(shape, properties, 1e-10);
    const double value = std::abs(properties.Mass());
    if (!std::isfinite(value)) throw std::runtime_error("Non-finite plane cut volume");
    const double uncertainty = !std::isfinite(error) || error < 0
        ? std::numeric_limits<double>::infinity() : error * value;
    return {value, uncertainty};
}
bool conservesVolume(const TopoDS_Shape& source, const std::vector<Result>& parts,
                     bool splineSpans) {
    gp_Pln reference;
    if (splineSpans) {
        Bnd_Box bounds; BRepBndLib::AddOptimal(source, bounds, false, false);
        double x0, y0, z0, x1, y1, z1; bounds.Get(x0, y0, z0, x1, y1, z1);
        // An exterior reference plane avoids near-zero point-relative integrals
        // on small trimmed fragments. Every piece uses the same reference.
        const double margin = std::max({1.0, x1-x0, y1-y0, z1-z0});
        reference = gp_Pln(gp_Pnt(x0-margin, y0, z0), gp_Dir(1,0,0));
    }
    const auto original = preciseVolume(source, splineSpans, reference);
    double total = 0, uncertainty = original.uncertainty;
    for (const auto& part : parts) {
        const auto measured = preciseVolume(part.shape, splineSpans, reference);
        total += measured.value; uncertainty += measured.uncertainty;
    }
    return original.value > 1e-12 && std::abs(total-original.value) + uncertainty <=
        1e-7*std::max(1.0,original.value);
}
int count(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
    TopTools_MapOfShape shapes;
    for (TopExp_Explorer e(shape, type); e.More(); e.Next()) shapes.Add(e.Current());
    return shapes.Extent();
}
template<class Operation>
std::vector<SourceEntity> correspondence(const Operand& body, Operation& operation) {
    std::vector<SourceEntity> result;
    TopTools_MapOfShape present; TopExp::MapShapes(operation.Shape(), present);
    for (const auto& origin : body.entities) {
        if (present.Contains(origin.shape)) result.push_back(origin);
        for (const auto* list : {&operation.Modified(origin.shape), &operation.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape it(*list); it.More(); it.Next())
                if (it.Value().ShapeType() == origin.shape.ShapeType() && present.Contains(it.Value()) &&
                    !it.Value().IsSame(origin.shape)) result.push_back({origin.id, it.Value()});
    }
    return result;
}
TopTools_MapOfShape selectedFaces(const Operand& body, const Tree& target) {
    TopTools_MapOfShape selected;
    if (const auto ids = target.get_child_optional("faces")) {
        if (ids->empty()) throw std::runtime_error("Select at least one face");
        std::set<std::string> seen;
        for (const auto& item : *ids) {
            const auto id = item.second.get_value<std::string>();
            const auto found = std::find_if(body.entities.begin(), body.entities.end(), [&](const auto& e) {
                return e.id == id && e.shape.ShapeType() == TopAbs_FACE;
            });
            if (found == body.entities.end() || !seen.insert(id).second)
                throw std::runtime_error("Select distinct existing faces");
            selected.Add(found->shape);
        }
    } else for (TopExp_Explorer e(body.shape, TopAbs_FACE); e.More(); e.Next()) selected.Add(e.Current());
    return selected;
}
void unchangedSupport(const TopoDS_Shape& source, const TopoDS_Shape& result) {
    for (TopExp_Explorer f(result, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current()); bool found = false;
        TopLoc_Location resultLocation;
        const auto support = BRep_Tool::Surface(face, resultLocation);
        for (TopExp_Explorer old(source, TopAbs_FACE); old.More(); old.Next()) {
            const auto previous = TopoDS::Face(old.Current());
            TopLoc_Location sourceLocation;
            if (support == BRep_Tool::Surface(previous, sourceLocation) &&
                resultLocation == sourceLocation) { found = true; break; }
        }
        if (!found) throw std::runtime_error("Imprint changed a support surface");
    }
}
std::vector<Result> imprint(const Operand& body, const Tree& target, const TopoDS_Face& cutter) {
    const auto selected = selectedFaces(body, target);
    BRepAlgoAPI_Section section(body.shape, cutter, false);
    section.SetNonDestructive(true); section.ComputePCurveOn1(true); section.Build();
    if (!section.IsDone() || section.HasErrors()) throw std::runtime_error("Cannot intersect selected faces with the cutting surface");
    BRepFeat_SplitShape split(body.shape); int edges = 0;
    for (TopExp_Explorer e(section.Shape(), TopAbs_EDGE); e.More(); e.Next()) {
        TopoDS_Shape face;
        if (section.HasAncestorFaceOn1(e.Current(), face) && selected.Contains(face)) {
            split.Add(TopoDS::Edge(e.Current()), TopoDS::Face(face)); ++edges;
        }
    }
    if (!edges) return {};
    split.Build();
    if (!split.IsDone()) throw std::runtime_error("Cannot imprint selected faces");
    const auto result = split.Shape(); validate(result);
    if (count(result, TopAbs_FACE) == count(body.shape, TopAbs_FACE)) return {};
    if (count(result, TopAbs_SOLID) != 1) throw std::runtime_error("Imprint changed the solid count");
    unchangedSupport(body.shape, result);
    for (TopExp_Explorer f(body.shape, TopAbs_FACE); f.More(); f.Next()) {
        if (selected.Contains(f.Current())) continue;
        int descendants = 0;
        for (TopTools_ListIteratorOfListOfShape it(split.Modified(f.Current())); it.More(); it.Next())
            if (it.Value().ShapeType() == TopAbs_FACE) ++descendants;
        if (descendants > 1) throw std::runtime_error("Imprint subdivided an unselected face");
    }
    return {{result, correspondence(body, split), {body.id}}};
}
std::vector<Result> splitBody(const Operand& body, const TopoDS_Face& cutter) {
    BRepAlgoAPI_Splitter split; TopTools_ListOfShape arguments, tools;
    arguments.Append(body.shape); tools.Append(cutter);
    split.SetArguments(arguments); split.SetTools(tools); split.SetNonDestructive(true); split.Build();
    if (!split.IsDone() || split.HasErrors()) throw std::runtime_error("Cannot split body with the cutting surface");
    if (count(split.Shape(), TopAbs_SOLID) < 2) return {};
    std::vector<Result> result; solids(result, split.Shape(), correspondence(body, split), {body.id});
    return result;
}
TopoDS_Face cuttingSurface(const Tree& input, const std::vector<Operand>& bodies) {
    const auto frame = input.get_child_optional("frame"), surface = input.get_child_optional("surface");
    if (bool(frame) == bool(surface)) throw std::runtime_error("Choose one cutting plane or face");
    if (frame) {
        const gp_Vec u(gp_Pnt(0,0,0), point(frame->get_child("u"))), v(gp_Pnt(0,0,0), point(frame->get_child("v")));
        if (std::abs(u.Magnitude()-1) > 1e-7 || std::abs(v.Magnitude()-1) > 1e-7 || std::abs(u.Dot(v)) > 1e-7)
            throw std::runtime_error("Invalid cutting plane frame");
        return BRepBuilderAPI_MakeFace(gp_Pln(point(frame->get_child("origin")), gp_Dir(u.Crossed(v)))).Face();
    }
    const auto body = std::find_if(bodies.begin(), bodies.end(), [&](const auto& b) {
        return b.id == surface->get<std::string>("body");
    });
    if (body == bodies.end()) throw std::runtime_error("Unknown cutting body");
    const auto face = std::find_if(body->entities.begin(), body->entities.end(), [&](const auto& e) {
        return e.id == surface->get<std::string>("face") && e.shape.ShapeType() == TopAbs_FACE;
    });
    if (face == body->entities.end()) throw std::runtime_error("Unknown cutting face");
    // The one-argument Surface overload applies the face location to the support.
    auto surfaceSupport = BRep_Tool::Surface(TopoDS::Face(face->shape));
    // Remove face-level rectangular trims; bounded basis surfaces keep their native domain.
    while (const auto trimmed = Handle(Geom_RectangularTrimmedSurface)::DownCast(surfaceSupport))
        surfaceSupport = trimmed->BasisSurface();
    BRepBuilderAPI_MakeFace support(surfaceSupport, Precision::Confusion());
    if (!support.IsDone()) throw std::runtime_error("Cannot construct cutting support surface");
    return support.Face();
}

}
std::vector<Result> cutWithPlane(const Tree& input, const std::vector<Operand>& bodies,
                               std::vector<std::string>& participants) {
    const auto mode = input.get<std::string>("mode");
    if (mode != "split" && mode != "imprint") throw std::runtime_error("Unknown plane cut mode");
    const auto cutter = cuttingSurface(input, bodies);
    std::set<std::string> seen; std::vector<Result> results;
    for (const auto& item : input.get_child("targets")) {
        const auto id = item.second.get<std::string>("body");
        const auto found = std::find_if(bodies.begin(), bodies.end(), [&](const auto& b) { return b.id == id; });
        if (found == bodies.end() || !seen.insert(id).second) throw std::runtime_error("Select distinct existing bodies");
        if (mode == "split" && item.second.get_child_optional("faces")) throw std::runtime_error("Split Body requires complete bodies");
        auto parts = mode == "split" ? splitBody(*found, cutter) : imprint(*found, item.second, cutter);
        if (parts.empty()) continue;
        for (const auto& part : parts) validate(part.shape);
        if (!conservesVolume(found->shape, parts, false) &&
            !conservesVolume(found->shape, parts, true))
            throw std::runtime_error("Plane cut changed the solid volume");
        participants.push_back(id); results.insert(results.end(),parts.begin(),parts.end());
    }
    if (seen.empty()) throw std::runtime_error("Select geometry to cut");
    return results;
}
