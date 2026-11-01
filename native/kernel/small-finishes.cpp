#include "small-finishes.h"
#include "blends.h"
#include "edge-finish-validation.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRep_Tool.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

namespace {
// Avoid adjacency, continuity and defeaturing on ordinary results. A round
// needs a small analytic radius; a bevel needs a short straight cross edge.
std::pair<TopTools_MapOfShape, TopTools_MapOfShape> candidates(const TopoDS_Shape& shape) {
    TopTools_MapOfShape rounds, bevels;
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
        BRepAdaptor_Surface surface(TopoDS::Face(f.Current()), false);
        const auto type = surface.GetType();
        if ((type == GeomAbs_Cylinder && surface.Cylinder().Radius() < geometry_policy::minimumFinishMm) ||
            (type == GeomAbs_Torus && surface.Torus().MinorRadius() < geometry_policy::minimumFinishMm) ||
            (type == GeomAbs_Sphere && surface.Sphere().Radius() < geometry_policy::minimumFinishMm))
            rounds.Add(f.Current());
        if (type != GeomAbs_Plane && type != GeomAbs_Cone) continue;
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (BRep_Tool::Degenerated(edge)) continue;
            BRepAdaptor_Curve curve(edge);
            if (curve.GetType() != GeomAbs_Line) continue;
            const double length = curve.LastParameter() - curve.FirstParameter();
            if (length > 0 && length < 2 * geometry_policy::minimumFinishMm) {
                bevels.Add(f.Current());
                break;
            }
        }
    }
    return {rounds, bevels};
}

template<class Operation>
std::vector<SourceEntity> trace(Operation& operation, const std::vector<SourceEntity>& origins) {
    std::vector<SourceEntity> result;
    for (const auto& origin : origins) {
        if (!operation.IsDeleted(origin.shape)) result.push_back(origin);
        for (const auto* list : {&operation.Modified(origin.shape), &operation.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) result.push_back({origin.id, i.Value()});
    }
    return result;
}

// Several bevel strips can meet at an ambiguous little planar cap. Include
// that cap in the same removal only when all its neighbors are already removed
// finishes and its whole straight-edged polygon fits within the finish budget.
void includeCaps(const TopoDS_Shape& shape, const TopTools_MapOfShape& possible,
                 TopTools_MapOfShape& removed) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_MapOfShape caps;
    for (TopTools_MapOfShape::Iterator f(possible); f.More(); f.Next()) {
        if (removed.Contains(f.Key()) || BRepAdaptor_Surface(TopoDS::Face(f.Key()), false).GetType() != GeomAbs_Plane)
            continue;
        bool enclosed = true;
        std::optional<gp_Pnt> first;
        for (TopExp_Explorer e(f.Key(), TopAbs_EDGE); e.More() && enclosed; e.Next()) {
            BRepAdaptor_Curve curve(TopoDS::Edge(e.Current()));
            if (curve.GetType() != GeomAbs_Line) { enclosed = false; break; }
            const auto point = curve.Value(curve.FirstParameter());
            if (!first) first = point;
            if (point.Distance(*first) >= 2 * geometry_policy::minimumFinishMm) enclosed = false;
            bool neighbor = false;
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(e.Current())); i.More(); i.Next()) {
                if (i.Value().IsSame(f.Key())) continue;
                neighbor = true;
                if (!removed.Contains(i.Value())) enclosed = false;
            }
            if (!neighbor) enclosed = false;
        }
        if (enclosed && first) caps.Add(f.Key());
    }
    for (TopTools_MapOfShape::Iterator f(caps); f.More(); f.Next()) removed.Add(f.Key());
}

void simplify(Result& result, const TopTools_MapOfShape& removed) {
    BRepAlgoAPI_Defeaturing operation;
    operation.SetShape(result.shape);
    operation.SetToFillHistory(true);
    operation.SetRunParallel(false);
    for (TopTools_MapOfShape::Iterator f(removed); f.More(); f.Next()) operation.AddFaceToRemove(f.Key());
    operation.Build();
    if (!operation.IsDone() || operation.HasErrors() || operation.HasWarnings())
        throw std::runtime_error("Cannot simplify microscopic edge finishes");
    const auto shape = operation.Shape();
    validate(shape);
    validateFinishManifold(shape);
    TopTools_IndexedMapOfShape solids, faces;
    TopExp::MapShapes(shape, TopAbs_SOLID, solids);
    TopExp::MapShapes(shape, TopAbs_FACE, faces);
    if (solids.Extent() != 1) throw std::runtime_error("Simplification must leave one solid");
    for (TopTools_MapOfShape::Iterator f(removed); f.More(); f.Next())
        if (faces.Contains(f.Key())) throw std::runtime_error("Microscopic edge finish was not removed");
    for (TopExp_Explorer f(result.shape, TopAbs_FACE); f.More(); f.Next()) {
        if (removed.Contains(f.Current())) continue;
        if (operation.IsDeleted(f.Current())) throw std::runtime_error("Simplification consumed a supporting face");
        for (TopTools_ListIteratorOfListOfShape i(operation.Modified(f.Current())); i.More(); i.Next())
            if (i.Value().ShapeType() == TopAbs_FACE)
                checkUnselectedSupport(TopoDS::Face(f.Current()), TopoDS::Face(i.Value()));
    }
    std::vector<TopoDS_Face> selected;
    for (const auto& face : result.selectedFaces) {
        if (faces.Contains(face)) selected.push_back(face);
        for (TopTools_ListIteratorOfListOfShape i(operation.Modified(face)); i.More(); i.Next())
            if (i.Value().ShapeType() == TopAbs_FACE) selected.push_back(TopoDS::Face(i.Value()));
    }
    result.predecessors = trace(operation, result.predecessors);
    result.selectedFaces = std::move(selected);
    result.shape = solids(1);
    result.exactVolume.reset();
    result.exactBounds.reset();
}
}

void simplifySmallFinishes(Result& result) {
    const auto [rounds, bevels] = candidates(result.shape);
    if (rounds.IsEmpty() && bevels.IsEmpty()) return;
    TopTools_MapOfShape removed;
    for (const bool chamfer : {false, true}) {
        const auto& possible = chamfer ? bevels : rounds;
        if (possible.IsEmpty()) continue;
        const auto finishes = chamfer ? recognizeChamfers(result.shape, &possible) : recognizeBlends(result.shape, &possible);
        for (const auto& finish : finishes)
            if (finish.radius < geometry_policy::minimumFinishMm) removed.Add(finish.face);
    }
    if (removed.IsEmpty()) return;
    includeCaps(result.shape, bevels, removed);
    try {
        simplify(result, removed);
    } catch (const Standard_Failure&) {
        throw std::runtime_error("Cannot simplify microscopic edge finishes");
    }
}
