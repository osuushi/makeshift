#include "edge-finish-validation.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Builder.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <cmath>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {
struct SolidBoundary {
    std::unique_ptr<BRepClass3d_SolidClassifier> classifier;
    TopoDS_Compound faces;
};
using Classifiers = std::vector<SolidBoundary>;
Classifiers solids(const TopoDS_Shape& shape) {
    Classifiers result;
    for (TopExp_Explorer s(shape, TopAbs_SOLID); s.More(); s.Next()) {
        TopoDS_Compound faces;
        BRep_Builder builder;
        builder.MakeCompound(faces);
        for (TopExp_Explorer f(s.Current(), TopAbs_FACE); f.More(); f.Next()) builder.Add(faces, f.Current());
        result.push_back({std::make_unique<BRepClass3d_SolidClassifier>(s.Current()), faces});
    }
    return result;
}
bool contains(Classifiers& shapes, const gp_Pnt& point, bool boundary) {
    for (auto& shape : shapes) {
        shape.classifier->Perform(point, geometry_policy::boundaryDistanceMm);
        const auto state = shape.classifier->State();
        if (state == TopAbs_UNKNOWN) throw std::runtime_error("Cannot classify edge-finish material");
        if (state == TopAbs_ON) {
            if (boundary) return true;
            continue;
        }
        if ((boundary && state == TopAbs_OUT) || (!boundary && state == TopAbs_IN)) {
            // Ray classification can miss ON at a periodic seam or a tangency.
            // Measure against faces (not solid interiors) at the same tolerance.
            BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(point).Shape(), shape.faces);
            if (!distance.IsDone()) throw std::runtime_error("Cannot measure edge-finish boundary");
            if (distance.Value() <= geometry_policy::boundaryDistanceMm) {
                if (boundary) return true;
                continue;
            }
        }
        if (state == TopAbs_IN) return true;
    }
    return false;
}
}

void validateFinishManifold(const TopoDS_Shape& shape) {
    TopTools_IndexedDataMapOfShapeListOfShape edges, vertices;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, edges);
    TopExp::MapShapesAndAncestors(shape, TopAbs_VERTEX, TopAbs_EDGE, vertices);
    for (int e = 1; e <= edges.Extent(); ++e) {
        if (BRep_Tool::Degenerated(TopoDS::Edge(edges.FindKey(e)))) continue;
        // Count uses, not unique faces: a periodic seam has two uses in one
        // face. Three uses are nonmanifold even when BRepCheck accepts them.
        if (edges.FindFromIndex(e).Size() != 2)
            throw std::runtime_error("Edge finish has a nonmanifold boundary edge");
    }
    for (int v = 1; v <= vertices.Extent(); ++v) {
        TopTools_IndexedMapOfShape faces;
        std::vector<std::pair<int, int>> links;
        for (TopTools_ListIteratorOfListOfShape e(vertices.FindFromIndex(v)); e.More(); e.Next()) {
            if (BRep_Tool::Degenerated(TopoDS::Edge(e.Value()))) continue;
            const auto& adjacent = edges.FindFromKey(e.Value());
            const int a = faces.Add(adjacent.First()), b = faces.Add(adjacent.Last());
            links.emplace_back(a, b);
        }
        if (faces.IsEmpty()) continue;
        std::vector<bool> reached(faces.Extent() + 1, false);
        std::vector<int> pending{1}; reached[1] = true;
        for (size_t i = 0; i < pending.size(); ++i)
            for (const auto& [a, b] : links) {
                const int next = pending[i] == a ? b : pending[i] == b ? a : 0;
                if (next && !reached[next]) { reached[next] = true; pending.push_back(next); }
            }
        if (pending.size() != static_cast<size_t>(faces.Extent()))
            throw std::runtime_error("Edge finish has a pinched nonmanifold vertex");
    }
}

void validateFinishBoundary(const TopoDS_Shape& result, const TopoDS_Shape& envelope,
                            const TopoDS_Shape& cavities) {
    auto allowed = solids(envelope), removed = solids(cavities);
    const auto check = [&](const gp_Pnt& point) {
        const bool outside = !contains(allowed, point, true), inside = contains(removed, point, false);
        if (outside || inside) throw std::runtime_error("Edge finish crossed its intended material boundary");
    };
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(result, TopAbs_EDGE, edges);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Degenerated(edge)) continue;
        const BRepAdaptor_Curve curve(edge);
        const double first = curve.FirstParameter(), last = curve.LastParameter();
        if (!std::isfinite(first) || !std::isfinite(last))
            throw std::runtime_error("Unbounded edge-finish boundary");
        for (int k = 0; k <= 8; ++k) check(curve.Value(first + (last - first) * k / 8));
    }
    for (TopExp_Explorer f(result, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        const BRepAdaptor_Surface surface(face);
        double u0, u1, v0, v1;
        BRepTools::UVBounds(face, u0, u1, v0, v1);
        if (!std::isfinite(u0 + u1 + v0 + v1))
            throw std::runtime_error("Unbounded edge-finish surface");
        // Edges cover thin patches that a UV grid can miss. Interior samples
        // also catch an untrimmed support spanning the interior of a cavity.
        for (int u = 0; u < 7; ++u) for (int v = 0; v < 7; ++v) {
            const gp_Pnt2d uv(u0 + (u1-u0) * (u+0.5)/7, v0 + (v1-v0) * (v+0.5)/7);
            BRepClass_FaceClassifier trim(face, uv, geometry_policy::parameterCorrespondenceMm);
            if (trim.State() == TopAbs_IN) check(surface.Value(uv.X(), uv.Y()));
        }
    }
}
