#include "microscopic-patch-join.h"
#include "microscopic-edge-chain.h"
#include "microscopic-patch-surface.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include "timing.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepGProp.hxx>
#include <BRepLib.hxx>
#include <BRepTools_ReShape.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <ShapeFix_Shell.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <stdexcept>

namespace {
int count(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
    TopTools_IndexedMapOfShape items;
    TopExp::MapShapes(shape, type, items);
    return items.Extent();
}
struct Mapping {
    BRepBuilderAPI_Copy& copy;
    BRepBuilderAPI_Sewing& sewing;
    ShapeUpgrade_UnifySameDomain& unify;
    const TopoDS_Face& a;
    const TopoDS_Face& b;
    const TopoDS_Face& joined;
    const MicroscopicEdgeChains& chains;
    std::vector<TopoDS_Shape> operator()(const TopoDS_Shape& original) const {
        auto current = copy.ModifiedShape(original);
        if (current.IsNull())
            return {};
        if (current.IsSame(a) || current.IsSame(b))
            current = joined;
        if (sewing.IsModifiedSubShape(current))
            current = sewing.ModifiedSubShape(current);
        const auto history = unify.History();
        std::vector<TopoDS_Shape> result;
        if (!history->IsRemoved(current))
            result.push_back(chains.mapped(current));
        for (const auto& next : history->Modified(current))
            result.push_back(chains.mapped(next));
        return result;
    }
};
void continueTopology(Result& result, const Result& source, const Mapping& map) {
    TopTools_IndexedMapOfShape before, after;
    TopExp::MapShapes(source.shape, before);
    TopExp::MapShapes(result.shape, after);
    result.predecessors.clear();
    result.selectedFaces.clear();
    for (const auto& origin : source.predecessors) {
        if (!before.Contains(origin.shape))
            continue;
        for (const auto& next : map(origin.shape))
            if (!next.IsNull() && next.ShapeType() == origin.shape.ShapeType() &&
                after.Contains(next))
                result.predecessors.push_back({origin.id, next});
    }
    for (const auto& face : source.selectedFaces)
        for (const auto& next : map(face))
            if (!next.IsNull() && next.ShapeType() == TopAbs_FACE && after.Contains(next))
                result.selectedFaces.push_back(TopoDS::Face(next));
}
Result join(const Result& source, const TopoDS_Face& first, const TopoDS_Face& second,
            const TopoDS_Edge& shared) {
    KernelTiming timing("microscopic-patch-join");
    if (source.shape.ShapeType() != TopAbs_SOLID || count(source.shape, TopAbs_SHELL) != 1)
        throw std::runtime_error("Patch joining requires one closed shell");
    BRepBuilderAPI_Copy copy(source.shape);
    const auto a = TopoDS::Face(copy.ModifiedShape(first).Oriented(first.Orientation()));
    const auto b = TopoDS::Face(copy.ModifiedShape(second).Oriented(second.Orientation()));
    const auto edge = TopoDS::Edge(copy.ModifiedShape(shared));
    const auto joined = joinMicroscopicPatchSurfaces(a, b, edge);
    timing.phase("surface");
    Handle(BRepTools_ReShape) replace = new BRepTools_ReShape;
    replace->Replace(a, joined);
    replace->Remove(b);
    BRepBuilderAPI_Sewing sewing(geometry_policy::boundaryDistanceMm / 10);
    sewing.Add(replace->Apply(copy.Shape()));
    sewing.Perform();
    if (count(sewing.SewedShape(), TopAbs_SHELL) != 1)
        throw std::runtime_error("Joined patches did not close their original shell");
    TopExp_Explorer shell(sewing.SewedShape(), TopAbs_SHELL);
    ShapeFix_Shell orientation(TopoDS::Shell(shell.Current()));
    orientation.FixFaceOrientation(TopoDS::Shell(shell.Current()));
    auto solid = BRepBuilderAPI_MakeSolid(orientation.Shell()).Solid();
    BRepLib::OrientClosedSolid(solid);
    timing.phase("sew");
    ShapeUpgrade_UnifySameDomain unify(solid, true, false, true);
    unify.SetSafeInputMode(true);
    unify.SetLinearTolerance(geometry_policy::boundaryDistanceMm / 10);
    TopTools_IndexedMapOfShape eligible;
    TopoDS_Shape sewnFace = joined;
    if (sewing.IsModifiedSubShape(joined))
        sewnFace = sewing.ModifiedSubShape(joined);
    TopExp::MapShapes(sewnFace, TopAbs_EDGE, eligible);
    for (TopExp_Explorer e(solid, TopAbs_EDGE); e.More(); e.Next())
        if (!eligible.Contains(e.Current()))
            unify.KeepShape(e.Current());
    unify.Build();
    timing.phase("unify");
    Result result = source;
    const auto chains = joinMicroscopicEdgeChains(unify.Shape());
    result.shape = chains.context->Apply(unify.Shape());
    timing.phase("edge-chains");
    validate(result.shape);
    timing.phase("basic-validity");
    offset_geometry::tightenGeneratedBoundaries(result.shape, source.shape, false);
    timing.phase("boundary-agreement");
    if (count(result.shape, TopAbs_FACE) != count(source.shape, TopAbs_FACE) - 1 ||
        count(result.shape, TopAbs_SHELL) != 1 || count(result.shape, TopAbs_SOLID) != 1)
        throw std::runtime_error("Patch joining changed unrelated topology");
    // The surface constructor carries a control-net displacement certificate
    // for the complete two rectangular patches. Remaining supports are copied;
    // sewing/edge concatenation do not refit their interiors. An offset Boolean
    // envelope is neither needed nor a replacement for that certificate.
    timing.phase("validate");
    continueTopology(result, source, Mapping{copy, sewing, unify, a, b, joined, chains});
    result.exactVolume.reset();
    result.exactBounds.reset();
    return result;
}
} // namespace
bool joinMicroscopicPatch(Result& result, const std::vector<TopoDS_Face>& candidates) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndUniqueAncestors(result.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_IndexedMapOfShape attempted;
    const auto attempt = [&](const TopoDS_Edge& edge) {
        if (attempted.Contains(edge))
            return false;
        attempted.Add(edge);
        const auto& faces = adjacency.FindFromKey(edge);
        if (faces.Extent() != 2 || faces.First().IsSame(faces.Last()))
            return false;
        const auto a = TopoDS::Face(faces.First()), b = TopoDS::Face(faces.Last());
        if (BRepAdaptor_Surface(a).GetType() != GeomAbs_BSplineSurface ||
            BRepAdaptor_Surface(b).GetType() != GeomAbs_BSplineSurface)
            return false;
        try {
            result = join(result, a, b, edge);
            return true;
        } catch (const Standard_Failure&) {
        } catch (const std::runtime_error&) {
        }
        return false;
    };
    for (const auto& face : candidates)
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
            if (attempt(TopoDS::Edge(e.Current())))
                return true;
    // Removing a thin patch can leave short boundary segments between the
    // remaining patch junctions. Continue the exact join across those junctions
    // so their degree-two boundary subdivisions can also concatenate.
    TopTools_IndexedDataMapOfShapeListOfShape vertices;
    TopExp::MapShapesAndUniqueAncestors(result.shape, TopAbs_VERTEX, TopAbs_EDGE, vertices);
    for (int i = 1; i <= adjacency.Extent(); ++i) {
        const auto edge = TopoDS::Edge(adjacency.FindKey(i));
        if (BRep_Tool::Degenerated(edge))
            continue;
        GProp_GProps length;
        BRepGProp::LinearProperties(edge, length);
        if (length.Mass() >= geometry_policy::minimumTopologyExtentMm)
            continue;
        for (const auto& vertex : {TopExp::FirstVertex(edge), TopExp::LastVertex(edge)})
            for (const auto& incident : vertices.FindFromKey(vertex))
                if (attempt(TopoDS::Edge(incident)))
                    return true;
    }
    return false;
}
