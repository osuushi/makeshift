#include "revolved-profile.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Section.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRep_Tool.hxx>
#include <Precision.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <stdexcept>

namespace revolved_profile {
namespace {
constexpr double tolerance = Precision::Confusion();

struct CutterFootprint {
    gp_Vec center;
    double radius;
};

gp_Dir clearRadial(const gp_Ax1& axis, const std::vector<SourceEntity>& cuts) {
    const gp_Vec axial(axis.Direction());
    std::vector<CutterFootprint> footprints;
    std::vector<gp_Dir> radials{radialFrame(axis, 0).XDirection()};
    for (const auto& cut : cuts) {
        const auto cylinder = BRepAdaptor_Surface(TopoDS::Face(cut.shape)).Cylinder();
        const gp_Vec offset(axis.Location(), cylinder.Location());
        const auto center = offset - axial * offset.Dot(axial);
        footprints.push_back({center, cylinder.Radius()});
        radials.emplace_back(-center);
    }
    for (const auto& radial : radials) {
        if (std::ranges::none_of(footprints, [&](const auto& cut) {
                const auto along = cut.center.Dot(gp_Vec(radial));
                const auto distance = along > 0 ? cut.center.CrossMagnitude(gp_Vec(radial))
                                                : cut.center.Magnitude();
                return distance <= cut.radius + tolerance;
            })) return radial;
    }
    throw std::runtime_error("No meridian clears the lengthwise cuts");
}

TopoDS_Edge outerHalf(const TopoDS_Edge& edge, const gp_Ax3& frame) {
    double first, last;
    const auto curve = BRep_Tool::Curve(edge, first, last);
    if (curve.IsNull()) throw std::runtime_error("A profile section has no spatial curve");
    const gp_Vec radial(frame.XDirection());
    const auto radius = [&](double parameter) {
        return gp_Vec(frame.Location(), curve->Value(parameter)).Dot(radial);
    };
    const double a = radius(first), b = radius(last);
    if (std::max(a, b) <= tolerance && radius((first + last) / 2) <= tolerance) return {};
    const auto forward = TopoDS::Edge(edge.Oriented(TopAbs_FORWARD));
    if (std::min(a, b) >= -tolerance) return forward;
    if (std::max(a, b) <= tolerance || BRepAdaptor_Curve(edge).GetType() != GeomAbs_Line)
        throw std::runtime_error("A profile section crosses the axis");
    const double middle = first + (last - first) * a / (a - b);
    const auto center = BRepBuilderAPI_MakeVertex(curve->Value(middle)).Vertex();
    return a < 0
        ? BRepBuilderAPI_MakeEdge(curve, center, TopExp::LastVertex(forward), middle, last).Edge()
        : BRepBuilderAPI_MakeEdge(curve, TopExp::FirstVertex(forward), center, first, middle).Edge();
}

TopoDS_Shape sectionFace(BRepAlgoAPI_Section& section, const TopoDS_Edge& edge,
                         const TopTools_IndexedDataMapOfShapeListOfShape& originals) {
    TopoDS_Shape face;
    if (section.HasAncestorFaceOn1(edge, face)) return face;
    // A section along an existing periodic seam reuses that input edge.
    // Its unique owner supplies the face when there is no new intersection.
    for (int i = 1; i <= originals.Extent(); ++i) {
        const auto& owners = originals(i);
        if (owners.Extent() != 1) continue;
        const auto& original = originals.FindKey(i);
        if (edge.IsSame(original) || std::ranges::any_of(section.Modified(original), [&](const auto& descendant) {
                return edge.IsSame(descendant);
            })) return owners.First();
    }
    throw std::runtime_error("A profile section lost its source face");
}
}

Band sectionProfile(const Operand& body, const gp_Ax1& axis, std::vector<SourceEntity> cuts) {
    const auto [low, high] = axialStations(body.shape, axis);
    const auto radial = clearRadial(axis, cuts);
    const auto frame = gp_Ax3(radialFrame(axis, low).Location(), radial.Crossed(axis.Direction()), radial);
    Band band{body, frame, high - low};
    band.parallelCuts = std::move(cuts);
    // Intersect the entire solid at once so consecutive spans share native vertices.
    BRepAlgoAPI_Section section(body.shape, gp_Pln(frame), true);
    if (!section.IsDone() || section.HasErrors()) throw std::runtime_error("Could not section the turned exterior");
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(section.Shape(), TopAbs_EDGE, edges);
    TopTools_IndexedDataMapOfShapeListOfShape originals;
    TopExp::MapShapesAndUniqueAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, originals);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Degenerated(edge)) continue;
        const auto half = outerHalf(edge, frame);
        if (half.IsNull()) continue;
        const auto face = sectionFace(section, edge, originals);
        const auto source = std::ranges::find_if(body.entities, [&](const auto& entity) {
            return entity.shape.IsSame(face);
        });
        if (source == body.entities.end()) throw std::runtime_error("A profile section lost its source face");
        band.meridians.push_back({source->id, {}, half});
    }
    return band;
}
}
