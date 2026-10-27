#include "edge-finish-construction.h"
#include "timing.h"
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepTools.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <algorithm>
#include <stdexcept>

namespace {
struct Boundary {
    TopoDS_Face face;
    TopTools_MapOfShape inner;
};

// Discover interruptions by topology, without assuming circles, cylinders,
// planar pocket walls, extrusion history or a particular kind of blend spine.
class SupportFeatures {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopTools_IndexedMapOfShape faces;
    std::vector<Boundary> boundaries;
    TopTools_MapOfShape protectedFaces, selectedEdges;
public:
    SupportFeatures(const TopoDS_Shape& shape, const std::vector<TopoDS_Edge>& edges) {
        TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
        TopExp::MapShapes(shape, TopAbs_FACE, faces);
        for (const auto& edge : edges) {
            selectedEdges.Add(edge);
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(edge)); i.More(); i.Next())
                protectedFaces.Add(i.Value());
        }
        for (int f = 1; f <= faces.Extent(); ++f) {
            const auto face = TopoDS::Face(faces(f));
            Boundary boundary{face, {}};
            const auto outer = BRepTools::OuterWire(face);
            for (TopExp_Explorer wires(face, TopAbs_WIRE); wires.More(); wires.Next()) {
                if (wires.Current().IsSame(outer)) continue;
                for (TopExp_Explorer e(wires.Current(), TopAbs_EDGE); e.More(); e.Next())
                    boundary.inner.Add(e.Current());
            }
            boundaries.push_back(std::move(boundary));
        }
    }
    TopTools_MapOfShape collect() const {
        TopTools_MapOfShape result;
        for (const auto& boundary : boundaries) {
            if (!protectedFaces.Contains(boundary.face)) continue;
            for (TopTools_MapOfShape::Iterator e(boundary.inner); e.More(); e.Next()) {
                if (selectedEdges.Contains(e.Key())) continue;
                const auto feature = connectedFeature(boundary.face, e.Key());
                for (TopTools_MapOfShape::Iterator f(feature); f.More(); f.Next()) result.Add(f.Key());
            }
        }
        return result;
    }
private:
    TopTools_MapOfShape connectedFeature(const TopoDS_Shape& support, const TopoDS_Shape& edge) const {
        TopTools_MapOfShape visited;
        std::vector<TopoDS_Shape> pending;
        for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(edge)); i.More(); i.Next())
            if (!i.Value().IsSame(support)) pending.push_back(i.Value());
        for (size_t index = 0; index < pending.size(); ++index) {
            const auto face = pending[index];
            if (!visited.Add(face)) continue;
            if (protectedFaces.Contains(face)) return {};
            for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
                if (selectedEdges.Contains(e.Current())) return {};
                for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(e.Current())); i.More(); i.Next()) {
                    if (i.Value().IsSame(face) || visited.Contains(i.Value())) continue;
                    const auto& next = boundaries[faces.FindIndex(i.Value()) - 1];
                    // A through opening terminates at another host face's
                    // interior loop. A blind pocket includes its floor.
                    if (next.inner.Contains(e.Current())) continue;
                    pending.push_back(i.Value());
                }
            }
        }
        return visited;
    }
};

std::vector<SourceEntity> trace(BRepAlgoAPI_Defeaturing& operation, const Operand& body) {
    std::vector<SourceEntity> origins;
    for (const auto& source : body.entities) {
        if (!operation.IsDeleted(source.shape)) origins.push_back(source);
        for (const auto* list : {&operation.Modified(source.shape), &operation.Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) origins.push_back({source.id, i.Value()});
    }
    return origins;
}
}

std::optional<EdgeFinishSupports> edgeFinishSupports(const Operand& body, const std::vector<TopoDS_Edge>& edges) {
    const auto features = SupportFeatures(body.shape, edges).collect();
    if (features.IsEmpty()) return std::nullopt;
    KernelTiming timing("edge-finish-supports");
    try {
        BRepAlgoAPI_Defeaturing heal;
        heal.SetShape(body.shape);
        heal.SetToFillHistory(true);
        for (TopTools_MapOfShape::Iterator i(features); i.More(); i.Next()) heal.AddFaceToRemove(i.Key());
        heal.Build();
        if (!heal.IsDone() || heal.HasErrors() || heal.HasWarnings()) return std::nullopt;
        validate(heal.Shape());
        for (TopTools_MapOfShape::Iterator i(features); i.More(); i.Next())
            if (!heal.IsDeleted(i.Key())) return std::nullopt;
        timing.phase("heal");
        auto origins = trace(heal, body);
        std::vector<Result> carriers;
        solids(carriers, heal.Shape(), origins, {body.id});
        if (carriers.size() != 1) return std::nullopt;
        // Only filled cavities are transparent to blend construction. Removing
        // a boss must not turn it into an unrequested cut in the final result.
        std::vector<SourceEntity> unused;
        const auto lost = booleanShape(body.shape, heal.Shape(), "subtract", unused);
        if (TopExp_Explorer(lost, TopAbs_SOLID).More()) return std::nullopt;
        auto interruptionOrigins = body.entities;
        const auto interruptions = booleanShape(heal.Shape(), body.shape, "subtract", interruptionOrigins);
        if (!TopExp_Explorer(interruptions, TopAbs_SOLID).More()) return std::nullopt;
        timing.phase("isolate-interruptions");
        TopTools_IndexedMapOfShape current;
        TopExp::MapShapes(heal.Shape(), TopAbs_EDGE, current);
        std::vector<TopoDS_Edge> mapped;
        for (const auto& edge : edges) {
            if (current.Contains(edge)) { mapped.push_back(edge); continue; }
            TopTools_IndexedMapOfShape images;
            for (const auto* list : {&heal.Modified(edge), &heal.Generated(edge)})
                for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                    if (current.Contains(i.Value())) images.Add(i.Value());
            if (images.Extent() != 1) return std::nullopt;
            // History can reverse an edge use while leaving the geometric
            // spine unchanged. The enclosing shell supplies its orientation.
            const auto before = signature(edge.Oriented(TopAbs_FORWARD));
            const auto after = signature(images(1).Oriented(TopAbs_FORWARD));
            if (before.size() != after.size()) return std::nullopt;
            for (size_t i = 0; i < before.size(); ++i)
                if (std::abs(before[i] - after[i]) > 1e-7 * std::max(1.0, std::abs(before[i]))) return std::nullopt;
            mapped.push_back(TopoDS::Edge(images(1)));
        }
        return EdgeFinishSupports{{body.id, carriers.front().shape, std::move(origins)}, std::move(mapped),
                              interruptions, std::move(interruptionOrigins)};
    } catch (const Standard_Failure&) { return std::nullopt; }
      catch (const std::runtime_error&) { return std::nullopt; }
}
