#include "revolved-profile.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Section.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <GeomAPI_ProjectPointOnCurve.hxx>
#include <Geom_BSplineCurve.hxx>
#include <GProp_GProps.hxx>
#include <Precision.hxx>
#include <ShapeAnalysis_FreeBounds.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_HSequenceOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
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

std::array<gp_Pnt, 2> endpoints(const TopoDS_Edge& edge) {
    return {BRep_Tool::Pnt(TopExp::FirstVertex(edge)), BRep_Tool::Pnt(TopExp::LastVertex(edge))};
}

bool onMeridian(const TopoDS_Edge& edge, const gp_Ax3& frame) {
    const BRepAdaptor_Curve curve(edge);
    if (curve.GetType() != GeomAbs_BSplineCurve) return false;
    const auto spline = curve.BSpline();
    const gp_Vec radial(frame.XDirection()), normal(frame.Direction());
    // A B-spline lies in the convex hull of its control points.
    for (int i = 1; i <= spline->NbPoles(); ++i) {
        const gp_Vec offset(frame.Location(), spline->Pole(i));
        if (offset.Dot(radial) < -tolerance || std::abs(offset.Dot(normal)) > tolerance) return false;
    }
    return true;
}

TopoDS_Edge splineMeridian(const TopoDS_Edge& section, const TopoDS_Face& face, const gp_Ax3& frame) {
    if (BRepAdaptor_Surface(face).GetType() != GeomAbs_BSplineSurface) return section;
    const auto [a, b] = endpoints(section);
    const gp_Ax1 axis(frame.Location(), frame.YDirection());
    const gp_Vec axial(axis.Direction());
    for (TopExp_Explorer edges(face, TopAbs_EDGE); edges.More(); edges.Next()) {
        const auto seam = TopoDS::Edge(edges.Current());
        if (section.IsSame(seam)) return section;
        if (BRep_Tool::Degenerated(seam) || !BRep_Tool::IsClosed(seam, face)) continue;
        for (const auto& endpoint : endpoints(seam)) {
            const gp_Vec offset(frame.Location(), endpoint);
            const auto radial = offset - axial * offset.Dot(axial);
            if (radial.Magnitude() <= tolerance) continue;
            gp_Trsf rotation;
            rotation.SetRotation(axis, radial.AngleWithRef(gp_Vec(frame.XDirection()), axial));
            const auto aligned = TopoDS::Edge(BRepBuilderAPI_Transform(seam, rotation, true).Shape());
            const auto [start, end] = endpoints(aligned);
            const bool matches = (start.Distance(a) <= tolerance && end.Distance(b) <= tolerance) ||
                (start.Distance(b) <= tolerance && end.Distance(a) <= tolerance);
            // A full band can supply its original seam curve at a clearer azimuth.
            // The round-trip material check still certifies the reconstructed body.
            if (matches && onMeridian(aligned, frame)) return aligned;
            break;
        }
    }
    return section;
}

std::optional<double> supportParameter(const Handle(Geom_TrimmedCurve)& support, const gp_Pnt& point) {
    if (point.Distance(support->StartPoint()) <= tolerance) return support->FirstParameter();
    if (point.Distance(support->EndPoint()) <= tolerance) return support->LastParameter();
    const GeomAPI_ProjectPointOnCurve projection(point, support);
    if (projection.NbPoints() && projection.LowerDistance() <= tolerance)
        return projection.LowerDistanceParameter();
    return std::nullopt;
}

TopoDS_Edge trimSupportMeridian(const TopoDS_Edge& section, const BRepAdaptor_Curve& trace,
                              const Handle(Geom_TrimmedCurve)& support) {
    const auto [a, b] = endpoints(section);
    const auto first = supportParameter(support, a), last = supportParameter(support, b);
    if (!first || !last || std::abs(*first - *last) <= Precision::PConfusion()) return {};
    const auto [low, high] = std::minmax(*first, *last);
    // The section locates the span, including the branch of a periodic support.
    const auto midpoint = trace.Value((trace.FirstParameter() + trace.LastParameter()) / 2);
    const GeomAPI_ProjectPointOnCurve projection(midpoint, support, low, high);
    if (!projection.NbPoints() || projection.LowerDistance() > BRep_Tool::Tolerance(section) + tolerance)
        return {};
    BRepBuilderAPI_MakeEdge edge(support, low, high);
    return edge.IsDone() ? edge.Edge() : TopoDS_Edge{};
}

TopoDS_Edge supportMeridian(const TopoDS_Edge& section, const TopoDS_Face& face, const Band& band) {
    const BRepAdaptor_Curve trace(section);
    if (trace.GetType() != GeomAbs_BSplineCurve && trace.GetType() != GeomAbs_BezierCurve) return section;
    const auto axis = rotationAxis(BRepAdaptor_Surface(face));
    if (axis && coaxial(*axis, band.axis())) {
        // The face already supplies the generating curve. A section of its
        // trimmed surface can approximate even an exact circle.
        auto exact = trimSupportMeridian(section, trace, meridian(face, band, false));
        if (!exact.IsNull()) return exact;
    }
    return splineMeridian(section, face, band.frame);
}
}

Band sectionProfile(const Operand& body, const gp_Ax1& axis, std::vector<SourceEntity> cuts,
                    const std::optional<gp_Dir>& direction) {
    const auto [low, high] = axialStations(body.shape, axis);
    const auto radial = direction ? *direction : clearRadial(axis, cuts);
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
        band.meridians.push_back({source->id, {}, supportMeridian(half, TopoDS::Face(face), band)});
    }
    return band;
}

TopoDS_Face recoveredSectionFace(const Band& band) {
    const gp_Lin axis(band.axis());
    const gp_Vec direction(band.axis().Direction());
    Handle(TopTools_HSequenceOfShape) edges = new TopTools_HSequenceOfShape;
    std::vector<gp_Pnt> axisEnds;
    for (const auto& span : band.meridians) {
        const auto& edge = span.sectionEdge;
        for (const auto& vertex : {TopExp::FirstVertex(edge), TopExp::LastVertex(edge)}) {
            const auto point = BRep_Tool::Pnt(vertex);
            if (axis.Distance(point) <= tolerance) axisEnds.push_back(point);
        }
        edges->Append(edge);
    }
    constexpr auto message = "Could not recover a closed profile section";
    if (axisEnds.size() % 2 != 0) throw std::runtime_error(message);
    std::ranges::sort(axisEnds, {}, [&](const auto& point) {
        return gp_Vec(axis.Location(), point).Dot(direction);
    });
    // Consecutive pairs mark intervals where the material meets the axis.
    for (std::size_t i = 0; i < axisEnds.size(); i += 2)
        if (axisEnds[i].Distance(axisEnds[i + 1]) > tolerance)
            edges->Append(BRepBuilderAPI_MakeEdge(axisEnds[i], axisEnds[i + 1]).Edge());

    int unused = edges->Length();
    Handle(TopTools_HSequenceOfShape) wires = new TopTools_HSequenceOfShape;
    ShapeAnalysis_FreeBounds::ConnectEdgesToWires(edges, tolerance, false, wires);
    struct Loop { TopoDS_Face face; double area; };
    std::vector<Loop> loops;
    const gp_Pln plane(band.frame);
    for (int i = 1; i <= wires->Length(); ++i) {
        const auto wire = TopoDS::Wire(wires->Value(i));
        if (!BRep_Tool::IsClosed(wire)) throw std::runtime_error(message);
        for (TopExp_Explorer edge(wire, TopAbs_EDGE); edge.More(); edge.Next()) --unused;
        const auto face = BRepBuilderAPI_MakeFace(plane, wire, true).Face();
        GProp_GProps props;
        BRepGProp::SurfaceProperties(face, props, 1e-10);
        loops.push_back({face, props.Mass()});
    }
    if (unused != 0 || loops.empty()) throw std::runtime_error(message);
    const auto outer = std::ranges::max_element(loops, {}, &Loop::area);
    BRepBuilderAPI_MakeFace region(outer->face);
    for (auto hole = loops.begin(); hole != loops.end(); ++hole)
        if (hole != outer) region.Add(TopoDS::Wire(BRepTools::OuterWire(hole->face).Reversed()));
    return region.Face();
}
}
