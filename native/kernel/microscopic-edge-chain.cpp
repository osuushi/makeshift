#include "microscopic-edge-chain.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepGProp.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <Geom2dAdaptor_Curve.hxx>
#include <Geom2dConvert.hxx>
#include <Geom2d_BSplineCurve.hxx>
#include <Geom2d_TrimmedCurve.hxx>
#include <GeomConvert.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <TColgp_Array1OfPnt2d.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <stdexcept>

namespace {
constexpr double precision = geometry_policy::boundaryDistanceMm / 10;
void require(bool condition, const char* message = "Cannot preserve the subdivided boundary") {
    if (!condition)
        throw std::runtime_error(message);
}
template <class Curve, class Points>
opencascade::handle<Curve> concatenate(opencascade::handle<Curve> a, opencascade::handle<Curve> b) {
    const int degree = std::max(a->Degree(), b->Degree());
    a->IncreaseDegree(degree);
    b->IncreaseDegree(degree);
    require(a->EndPoint().Distance(b->StartPoint()) <= precision, "Chain endpoint mismatch");
    const int na = a->NbPoles(), nb = b->NbPoles();
    Points poles(1, na + nb - 1);
    TColStd_Array1OfReal weights(1, poles.Length()), knots(1, a->NbKnots() + b->NbKnots() - 1);
    TColStd_Array1OfInteger mult(1, knots.Length());
    const double ratio = a->Weight(na) / b->Weight(1);
    for (int i = 1; i <= na; ++i) {
        poles(i) = a->Pole(i);
        weights(i) = a->Weight(i);
    }
    for (int i = 2; i <= nb; ++i) {
        poles(na + i - 1) = b->Pole(i);
        weights(na + i - 1) = ratio * b->Weight(i);
    }
    for (int i = 1; i <= a->NbKnots(); ++i) {
        knots(i) = (a->Knot(i) - a->FirstParameter()) / (a->LastParameter() - a->FirstParameter());
        mult(i) = i == a->NbKnots() ? degree : a->Multiplicity(i);
    }
    for (int i = 2; i <= b->NbKnots(); ++i) {
        const int n = a->NbKnots() + i - 1;
        knots(n) =
            1 + (b->Knot(i) - b->FirstParameter()) / (b->LastParameter() - b->FirstParameter());
        mult(n) = b->Multiplicity(i);
    }
    return new Curve(poles, weights, knots, mult, degree);
}
bool polynomial(GeomAbs_CurveType type) {
    return type == GeomAbs_Line || type == GeomAbs_BSplineCurve || type == GeomAbs_BezierCurve;
}
Handle(Geom_BSplineCurve) spatial(const TopoDS_Edge& edge) {
    require(polynomial(BRepAdaptor_Curve(edge).GetType()),
            "Non-polynomial spatial parameterization");
    double first, last;
    const auto original = BRep_Tool::Curve(edge, first, last);
    require(!original.IsNull());
    auto curve = GeomConvert::CurveToBSplineCurve(new Geom_TrimmedCurve(original, first, last));
    if (edge.Orientation() == TopAbs_REVERSED)
        curve->Reverse();
    return curve;
}
Handle(Geom2d_BSplineCurve) parametric(const TopoDS_Edge& edge, const TopoDS_Face& face) {
    require(!BRep_Tool::IsClosed(edge, face), "Periodic edge chain");
    double first, last;
    const auto original = BRep_Tool::CurveOnSurface(edge, face, first, last);
    require(!original.IsNull() && polynomial(Geom2dAdaptor_Curve(original, first, last).GetType()),
            "Non-polynomial pcurve parameterization");
    auto curve = Geom2dConvert::CurveToBSplineCurve(new Geom2d_TrimmedCurve(original, first, last));
    if (edge.Orientation() == TopAbs_REVERSED)
        curve->Reverse();
    return curve;
}
bool merge(const TopoDS_Edge& first, const TopoDS_Edge& second, const TopoDS_Vertex& joint,
           const TopTools_ListOfShape& faces, MicroscopicEdgeChains& chains) {
    auto a = TopoDS::Edge(first.Oriented(TopAbs_FORWARD)),
         b = TopoDS::Edge(second.Oriented(TopAbs_FORWARD));
    if (TopExp::FirstVertex(a).IsSame(joint))
        a.Reverse();
    if (TopExp::LastVertex(b).IsSame(joint))
        b.Reverse();
    const auto curve = concatenate<Geom_BSplineCurve, TColgp_Array1OfPnt>(spatial(a), spatial(b));
    const auto start = TopExp::FirstVertex(a, true), end = TopExp::LastVertex(b, true);
    require(!start.IsSame(end));
    const auto joined = BRepBuilderAPI_MakeEdge(curve, start, end).Edge();
    BRep_Builder builder;
    for (const auto& item : faces) {
        const auto face = TopoDS::Face(item);
        const auto uv = concatenate<Geom2d_BSplineCurve, TColgp_Array1OfPnt2d>(parametric(a, face),
                                                                               parametric(b, face));
        builder.UpdateEdge(joined, uv, face, precision);
        builder.Range(joined, face, 0, 2);
    }
    builder.SameRange(joined, true);
    builder.SameParameter(joined, true);
    chains.context->Replace(first.Oriented(TopAbs_FORWARD), joined.Oriented(a.Orientation()));
    chains.context->Remove(second);
    chains.aliases.push_back({first, joined});
    chains.aliases.push_back({second, joined});
    return true;
}
bool next(const TopoDS_Shape& shape, MicroscopicEdgeChains& chains) {
    TopTools_IndexedDataMapOfShapeListOfShape vertices, faces;
    TopExp::MapShapesAndUniqueAncestors(shape, TopAbs_VERTEX, TopAbs_EDGE, vertices);
    TopExp::MapShapesAndUniqueAncestors(shape, TopAbs_EDGE, TopAbs_FACE, faces);
    for (int i = 1; i <= faces.Extent(); ++i) {
        const auto edge = TopoDS::Edge(faces.FindKey(i));
        if (BRep_Tool::Degenerated(edge) || faces(i).Extent() != 2)
            continue;
        GProp_GProps length;
        BRepGProp::LinearProperties(edge, length);
        if (length.Mass() >= geometry_policy::minimumTopologyExtentMm)
            continue;
        for (const auto& vertex : {TopExp::FirstVertex(edge), TopExp::LastVertex(edge)}) {
            if (vertices.FindFromKey(vertex).Extent() != 2)
                continue;
            const auto& incident = vertices.FindFromKey(vertex);
            const auto other =
                TopoDS::Edge(incident.First().IsSame(edge) ? incident.Last() : incident.First());
            if (faces.FindFromKey(other).Extent() != 2)
                continue;
            bool same = true;
            for (const auto& face : faces(i)) {
                bool present = false;
                for (const auto& f : faces.FindFromKey(other))
                    present |= f.IsSame(face);
                same &= present;
            }
            if (!same)
                continue;
            try {
                return merge(edge, other, vertex, faces(i), chains);
            } catch (const Standard_Failure&) {
            } catch (const std::runtime_error&) {
            }
        }
    }
    return false;
}
} // namespace
TopoDS_Shape MicroscopicEdgeChains::mapped(const TopoDS_Shape& original) const {
    auto shape = original;
    for (const auto& [from, to] : aliases)
        if (shape.IsSame(from))
            shape = to;
    return context->Apply(shape);
}
MicroscopicEdgeChains joinMicroscopicEdgeChains(const TopoDS_Shape& shape) {
    MicroscopicEdgeChains result{new BRepTools_ReShape, {}};
    while (next(result.context->Apply(shape), result)) {
    }
    return result;
}
