#include "kernel.h"
#include "face-chains.h"
#include <BRepLib.hxx>
#include <LProp_NotDefined.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedMapOfOrientedShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopoDS.hxx>
#include <map>

GeomAbs_Shape faceContinuity(const TopoDS_Edge& edge, const TopoDS_Face& from, const TopoDS_Face& to) {
    try {
        return BRepLib::ContinuityOfFaces(edge, from, to, 1e-5);
    } catch (const LProp_NotDefined&) {
        // A stationary Bezier endpoint can have no first-derivative normal.
        // Optional face grouping must not reject otherwise valid geometry.
        return GeomAbs_C0;
    }
}

struct FaceChainContext::Data {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopTools_IndexedMapOfShape faces;
    TopTools_IndexedMapOfOrientedShape orientedFaces;
    std::vector<std::vector<int>> incident;
    std::vector<std::map<std::pair<int, int>, GeomAbs_Shape>> continuity;

    explicit Data(const TopoDS_Shape& body) {
        TopExp::MapShapesAndAncestors(body, TopAbs_EDGE, TopAbs_FACE, adjacency);
        continuity.resize(adjacency.Extent() + 1);
        for (int e = 1; e <= adjacency.Extent(); ++e) {
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromIndex(e)); i.More(); i.Next()) {
                const int f = faces.Add(i.Value());
                if (incident.size() <= size_t(f)) incident.resize(f + 1);
                auto& edges = incident[f];
                // A seam may list the same face twice; keep each edge once.
                if (edges.empty() || edges.back() != e) edges.push_back(e);
            }
        }
    }

    GeomAbs_Shape between(int edge, const TopoDS_Face& from, const TopoDS_Face& to) {
        // IsEqual keys retain orientation/location; projection is ordered.
        const auto key = std::make_pair(orientedFaces.Add(from), orientedFaces.Add(to));
        auto& cache = continuity[edge];
        const auto found = cache.find(key);
        if (found != cache.end()) return found->second;
        const auto value = faceContinuity(TopoDS::Edge(adjacency.FindKey(edge)), from, to);
        cache.emplace(key, value);
        return value;
    }
};

FaceChainContext::FaceChainContext(const TopoDS_Shape& body) : data(std::make_unique<Data>(body)) {}
FaceChainContext::~FaceChainContext() = default;

std::vector<TopoDS_Face> FaceChainContext::chain(const std::vector<TopoDS_Face>& seeds) {
    auto result = seeds;
    TopTools_MapOfShape visited;
    for (const auto& face : seeds) visited.Add(face);
    for (size_t f = 0; f < result.size(); ++f) {
        const auto face = result[f];
        const int index = data->faces.FindIndex(face);
        if (!index) continue;
        for (int e : data->incident[index]) {
            const auto& neighbors = data->adjacency.FindFromIndex(e);
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next()) {
                const auto other = TopoDS::Face(i.Value());
                if (visited.Contains(other)) continue;
                if (data->between(e, face, other) >= GeomAbs_G1) {
                    visited.Add(other);
                    result.push_back(other);
                }
            }
        }
    }
    return result;
}

std::vector<TopoDS_Face> tangentFaceChain(const TopoDS_Shape& shape, const std::vector<TopoDS_Face>& seeds) {
    FaceChainContext context(shape);
    return context.chain(seeds);
}
