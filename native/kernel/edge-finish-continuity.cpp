#include "edge-finish-construction.h"
#include "calculation-failure.h"
#include "geometry-policy.h"
#include "shape-measurements.h"
#include <BRepBndLib.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <unordered_set>

void validateFinishContinuity(const Operand& source, const std::vector<TopoDS_Edge>& edges,
                              const Result& result) {
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(result.shape, TopAbs_FACE, faces);
    std::unordered_set<std::string> sourceIds, surviving;
    for (const auto& entity : source.entities)
        if (entity.shape.ShapeType() == TopAbs_FACE) sourceIds.insert(entity.id);
    TopTools_MapOfShape inherited;
    for (const auto& image : result.predecessors) {
        if (!sourceIds.contains(image.id) || !faces.Contains(image.shape)) continue;
        surviving.insert(image.id);
        inherited.Add(image.shape);
    }
    if (surviving.size() == sourceIds.size()) return;
    // A finish can consume a support at its limit. A lost face wholly outside
    // both the selected contour and all new finish patches is a detached part
    // of the source: a closed, valid remnant alone is not a valid edge edit.
    Bnd_Box region;
    for (const auto& edge : edges) BRepBndLib::Add(edge, region, false);
    for (int i = 1; i <= faces.Extent(); ++i) {
        const auto& face = faces(i);
        if (!inherited.Contains(face)) region.Add(conservativeFaceBounds(TopoDS::Face(face)));
    }
    region.Enlarge(geometry_policy::minimumTopologyExtentMm);
    for (const auto& entity : source.entities) {
        if (entity.shape.ShapeType() != TopAbs_FACE || surviving.contains(entity.id)) continue;
        if (region.IsOut(conservativeFaceBounds(TopoDS::Face(entity.shape))))
            throw GeometricFailure("Edge finish would discard a distant face of the original body");
    }
}
