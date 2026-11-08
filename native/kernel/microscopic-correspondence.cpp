#include "microscopic-correspondence.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>

namespace {
TopTools_IndexedMapOfShape continuingEdges(const TopoDS_Shape& source,
                                           BRepAlgoAPI_Defeaturing& heal,
                                           const TopTools_IndexedMapOfShape& currentFaces) {
    TopTools_IndexedMapOfShape edges;
    if (currentFaces.Contains(source))
        TopExp::MapShapes(source, TopAbs_EDGE, edges);
    for (TopTools_ListIteratorOfListOfShape f(heal.Modified(source)); f.More(); f.Next())
        if (currentFaces.Contains(f.Value()))
            TopExp::MapShapes(f.Value(), TopAbs_EDGE, edges);
    return edges;
}
} // namespace
void continueRemovedFaceEdges(const Result& source, const std::vector<TopoDS_Face>& removed,
                              BRepAlgoAPI_Defeaturing& heal, std::vector<SourceEntity>& mapped) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(source.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_IndexedMapOfShape currentFaces;
    TopExp::MapShapes(heal.Shape(), TopAbs_FACE, currentFaces);
    for (const auto& face : removed) {
        TopTools_IndexedMapOfShape edges, supports;
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
            for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(e.Current())); f.More();
                 f.Next())
                if (!f.Value().IsSame(face))
                    edges.Add(e.Current());
        for (int i = 1; i <= edges.Extent(); ++i)
            for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edges(i))); f.More();
                 f.Next())
                if (!f.Value().IsSame(face))
                    supports.Add(f.Value());
        for (int i = 1; i <= edges.Extent(); ++i) {
            const auto edge = TopoDS::Edge(edges(i));
            if (BRep_Tool::Degenerated(edge))
                continue;
            TopTools_IndexedMapOfShape candidates;
            for (const auto& ownFace : adjacency.FindFromKey(edge)) {
                if (ownFace.IsSame(face))
                    continue;
                const auto own = continuingEdges(ownFace, heal, currentFaces);
                for (int j = 1; j <= supports.Extent(); ++j) {
                    if (supports(j).IsSame(ownFace))
                        continue;
                    const auto other = continuingEdges(supports(j), heal, currentFaces);
                    for (int k = 1; k <= own.Extent(); ++k)
                        if (other.Contains(own(k)))
                            candidates.Add(own(k));
                }
            }
            const BRepAdaptor_Curve old(edge);
            TopTools_IndexedMapOfShape matches;
            for (int j = 1; j <= candidates.Extent(); ++j) {
                bool close = true;
                for (double fraction : {.25, .5, .75}) {
                    const auto point =
                        old.Value(old.FirstParameter() +
                                  fraction * (old.LastParameter() - old.FirstParameter()));
                    BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(point).Vertex(),
                                                        candidates(j));
                    close &= distance.IsDone() &&
                             distance.Value() <= 2 * geometry_policy::minimumTopologyExtentMm;
                }
                if (close)
                    matches.Add(candidates(j));
            }
            if (matches.Extent() != 1)
                continue;
            // Samples disambiguate selection history only. Complete geometry
            // and material checks independently authorize the reconstruction.
            for (const auto& origin : source.predecessors)
                if (origin.shape.IsSame(edge))
                    mapped.push_back({origin.id, matches(1)});
        }
    }
}
