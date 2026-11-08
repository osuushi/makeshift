#include "microscopic-topology.h"
#include "geometry-policy.h"
#include "microscopic-validation.h"
#include "microscopic-correspondence.h"
#include "microscopic-face-width.h"
#include <BRepAdaptor_Surface.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepGProp.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <ShapeBuild_ReShape.hxx>
#include <ShapeFix_Wireframe.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

namespace {
constexpr double limit = geometry_policy::minimumTopologyExtentMm;
// Subtracting positioned supports must not classify an exact 0.001 mm span
// as microscopic solely because of floating-point roundoff.
constexpr double detectionLimit = limit - 1e-9;
struct SmallTopology {
    std::vector<TopoDS_Face> faces;
    bool edges = false;
    std::vector<TopoDS_Face> candidates;
};
bool planarSubdivision(const TopoDS_Face& face,
                       const TopTools_IndexedDataMapOfShapeListOfShape& adjacency) {
    const BRepAdaptor_Surface support(face);
    if (support.GetType() != GeomAbs_Plane) return false;
    const auto plane = support.Plane();
    int continuations = 0;
    for (TopExp_Explorer edge(face, TopAbs_EDGE); edge.More(); edge.Next()) {
        bool continuing = false;
        for (TopTools_ListIteratorOfListOfShape f(adjacency.FindFromKey(edge.Current())); f.More(); f.Next()) {
            if (f.Value().IsSame(face)) continue;
            const BRepAdaptor_Surface next(TopoDS::Face(f.Value()));
            continuing |= next.GetType() == GeomAbs_Plane &&
                next.Plane().Axis().IsParallel(plane.Axis(), 1e-12) &&
                plane.Distance(next.Plane().Location()) < 1e-12;
        }
        if (continuing) ++continuations;
    }
    return continuations > 0;
}
SmallTopology findSmall(const TopoDS_Shape& shape) {
    SmallTopology found;
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        const auto width = microscopicFaceWidth(face, detectionLimit);
        if (width == FaceWidth::healthy) continue;
        if (width == FaceWidth::uncertain)
            throw std::runtime_error("Could not resolve the face width within the numerical budget");
        if (width == FaceWidth::thin) {
            found.faces.push_back(face);
            continue;
        }
        if (adjacency.IsEmpty()) TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
        if (planarSubdivision(face, adjacency)) continue;
        found.candidates.push_back(face);
    }
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(shape, TopAbs_EDGE, edges);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Degenerated(edge)) continue;
        GProp_GProps length;
        BRepGProp::LinearProperties(edge, length);
        if (length.Mass() < detectionLimit) found.edges = true;
    }
    return found;
}
int count(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
    TopTools_IndexedMapOfShape items;
    TopExp::MapShapes(shape, type, items);
    return items.Extent();
}
void healFaces(Result& result, const std::vector<TopoDS_Face>& faces) {
    BRepAlgoAPI_Defeaturing heal;
    heal.SetShape(result.shape);
    heal.SetToFillHistory(true);
    for (const auto& face : faces) heal.AddFaceToRemove(face);
    heal.Build();
    if (!heal.IsDone() || heal.HasErrors() || heal.HasWarnings())
        throw std::runtime_error("Microscopic faces could not be reconnected into a solid");
    for (const auto& face : faces)
        if (!heal.IsDeleted(face)) throw std::runtime_error("Microscopic face was not removed");
    std::vector<SourceEntity> mapped;
    for (const auto& origin : result.predecessors) {
        if (!heal.IsDeleted(origin.shape)) mapped.push_back(origin);
        for (const auto* list : {&heal.Modified(origin.shape), &heal.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) mapped.push_back({origin.id, i.Value()});
    }
    continueRemovedFaceEdges(result, faces, heal, mapped);
    std::vector<TopoDS_Face> selected;
    for (const auto& face : result.selectedFaces) {
        if (!heal.IsDeleted(face)) selected.push_back(face);
        for (TopTools_ListIteratorOfListOfShape i(heal.Modified(face)); i.More(); i.Next())
            if (i.Value().ShapeType() == TopAbs_FACE) selected.push_back(TopoDS::Face(i.Value()));
    }
    result.shape = heal.Shape();
    result.predecessors = std::move(mapped);
    result.selectedFaces = std::move(selected);
}
void healEdges(Result& result) {
    ShapeFix_Wireframe repair(result.shape);
    repair.SetPrecision(limit);
    repair.SetMaxTolerance(geometry_policy::offsetTopologyToleranceMm);
    // Only merge along a continuous curve. Arbitrary short corner removal can
    // leave valid-looking but tolerance-inflated faces with incompatible supports.
    repair.SetLimitAngle(1e-7);
    repair.ModeDropSmallEdges() = false;
    repair.FixSmallEdges();
    const auto context = repair.Context();
    if (!context.IsNull()) {
        std::vector<SourceEntity> mapped;
        for (const auto& origin : result.predecessors) {
            const auto next = context->Apply(origin.shape);
            if (!next.IsNull() && next.ShapeType() == origin.shape.ShapeType())
                mapped.push_back({origin.id, next});
        }
        std::vector<TopoDS_Face> selected;
        for (const auto& face : result.selectedFaces) {
            const auto next = context->Apply(face);
            if (!next.IsNull() && next.ShapeType() == TopAbs_FACE)
                selected.push_back(TopoDS::Face(next));
        }
        result.selectedFaces = std::move(selected);
        result.predecessors = std::move(mapped);
    }
    result.shape = repair.Shape();
}
void repair(Result& result, SmallTopology small) {
    if (small.faces.empty() && !small.edges) return;
    // OCCT healing can modify shared tolerances. Never expose those mutations
    // to an operand or to an earlier preview if the repair subsequently fails.
    const auto before = result.shape;
    BRepBuilderAPI_Copy copy(before);
    Result repaired = result;
    repaired.shape = copy.Shape();
    TopTools_IndexedMapOfShape current;
    TopExp::MapShapes(before, current);
    repaired.predecessors.clear();
    for (const auto& origin : result.predecessors)
        if (current.Contains(origin.shape))
            repaired.predecessors.push_back({origin.id, copy.ModifiedShape(origin.shape)});
    for (auto& face : repaired.selectedFaces) face = TopoDS::Face(copy.ModifiedShape(face));
    for (auto& face : small.faces) face = TopoDS::Face(copy.ModifiedShape(face));
    if (!small.faces.empty()) healFaces(repaired, small.faces);
    if (findSmall(repaired.shape).edges) healEdges(repaired);
    validate(repaired.shape);
    if (count(before, TopAbs_SOLID) != count(repaired.shape, TopAbs_SOLID) ||
        count(before, TopAbs_SHELL) != count(repaired.shape, TopAbs_SHELL))
        throw std::runtime_error("Microscopic topology repair would change solid connectivity");
    small = findSmall(repaired.shape);
    if (!small.faces.empty() || small.edges)
        throw std::runtime_error("Geometry contains a sub-micron feature that cannot be safely collapsed");
    if (volume(repaired.shape) <= geometry_policy::minimumSolidVolumeMm3)
        throw std::runtime_error("Microscopic topology repair would remove the solid");
    validateMicroscopicRepair(before, repaired.shape);
    repaired.exactVolume.reset();
    repaired.exactBounds.reset();
    result = std::move(repaired);
}
void repairMicroscopicTopology(Result& result) {
    repair(result, findSmall(result.shape));
    // Near-threshold face widths are candidates, not defects: removal
    // must still satisfy the same complete-solid one-micron material budget.
    for (;;) {
        bool changed = false;
        for (const auto& face : findSmall(result.shape).candidates) {
            try {
                repair(result, {{face}, false});
                changed = true;
                break;
            } catch (const Standard_Failure&) {
            } catch (const std::runtime_error&) {
            }
        }
        if (!changed) break;
    }
}

}
void resolveMicroscopicTopology(Result& result) {
    try {
        repairMicroscopicTopology(result);
    } catch (const Standard_Failure& error) {
        throw std::runtime_error(std::string("Kernel produced invalid geometry: microscopic topology repair: ") +
            (error.GetMessageString() ? error.GetMessageString() : "reconnection failed"));
    } catch (const std::runtime_error& error) {
        throw std::runtime_error(std::string("Kernel produced invalid geometry: microscopic topology repair: ") +
            error.what());
    }
}
