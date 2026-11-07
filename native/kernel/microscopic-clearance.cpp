#include "microscopic-clearance.h"
#include <BRepBndLib.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopExp_Explorer.hxx>
#include <stdexcept>
#include <vector>

namespace {
struct BoundaryEdge {
    TopoDS_Edge edge;
    TopTools_IndexedMapOfShape vertices;
    Bnd_Box box;
    int wire = 0;
};
bool incident(const BoundaryEdge& a, const BoundaryEdge& b) {
    for (int i = 1; i <= a.vertices.Extent(); ++i)
        if (b.vertices.Contains(a.vertices(i))) return true;
    return false;
}
}
bool hasMicroscopicClearance(const TopoDS_Face& face, double threshold) {
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(face,TopAbs_EDGE,edges);
    TopTools_IndexedMapOfShape wires;
    TopExp::MapShapes(face,TopAbs_WIRE,wires);
    if (wires.Extent() < 2) return false;
    std::vector<BoundaryEdge> boundaries;
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Degenerated(edge)) continue;
        BoundaryEdge boundary{edge,{},{}};
        TopExp::MapShapes(edge,TopAbs_VERTEX,boundary.vertices);
        for (int w = 1; w <= wires.Extent(); ++w)
            for (TopExp_Explorer e(wires(w),TopAbs_EDGE); e.More(); e.Next())
                if (e.Current().IsSame(edge)) boundary.wire = w;
        BRepBndLib::AddOptimal(edge,boundary.box,false,true);
        boundaries.push_back(std::move(boundary));
    }
    for (size_t i = 0; i < boundaries.size(); ++i)
        for (size_t j = i+1; j < boundaries.size(); ++j) {
            const auto& a = boundaries[i];
            const auto& b = boundaries[j];
            // Include topology tolerance in the boxes. Their distance is a
            // lower bound on curve distance, regardless of curve complexity.
            if (a.wire == b.wire || incident(a,b) || a.box.Distance(b.box) >= threshold) continue;
            BRepExtrema_DistShapeShape distance(a.edge,b.edge);
            if (!distance.IsDone())
                throw std::runtime_error("Could not verify face boundary clearance");
            if (distance.Value() < threshold) return true;
        }
    return false;
}
