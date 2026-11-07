#include "microscopic-correspondence.h"
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
    if (currentFaces.Contains(source)) TopExp::MapShapes(source, TopAbs_EDGE, edges);
    for (TopTools_ListIteratorOfListOfShape f(heal.Modified(source)); f.More(); f.Next())
        if (currentFaces.Contains(f.Value())) TopExp::MapShapes(f.Value(), TopAbs_EDGE, edges);
    return edges;
}
}
void continueRemovedFaceEdges(const Result& source, const std::vector<TopoDS_Face>& removed,
                            BRepAlgoAPI_Defeaturing& heal, std::vector<SourceEntity>& mapped) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(source.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_IndexedMapOfShape currentFaces;
    TopExp::MapShapes(heal.Shape(), TopAbs_FACE, currentFaces);
    for (const auto& face : removed) {
        TopTools_IndexedMapOfShape edges, supports;
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
            for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(e.Current())); f.More(); f.Next())
                if (!f.Value().IsSame(face)) edges.Add(e.Current());
        if (edges.Extent() != 2) continue;
        for (int i = 1; i <= edges.Extent(); ++i)
            for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edges(i))); f.More(); f.Next())
                if (!f.Value().IsSame(face)) supports.Add(f.Value());
        if (supports.Extent() != 2) continue;
        const auto a = continuingEdges(supports(1), heal, currentFaces);
        const auto b = continuingEdges(supports(2), heal, currentFaces);
        TopTools_IndexedMapOfShape shared;
        for (int i = 1; i <= a.Extent(); ++i) if (b.Contains(a(i))) shared.Add(a(i));
        if (shared.Extent() != 1) continue;
        // Both former boundaries now designate the unique intersection of the same
        // neighboring faces. Keep either selection usable during input repair.
        for (const auto& origin : source.predecessors)
            if (edges.Contains(origin.shape)) mapped.push_back({origin.id, shared(1)});
    }
}
