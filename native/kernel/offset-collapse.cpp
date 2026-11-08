#include "calculation-failure.h"
#include "offset-collapse.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
bool sameSupport(const TopoDS_Face& a, const TopoDS_Face& b) {
    BRepAdaptor_Surface x(a), y(b);
    if (x.GetType() != y.GetType()) return false;
    if (x.GetType() == GeomAbs_Plane)
        return x.Plane().Axis().IsParallel(y.Plane().Axis(), 1e-10) &&
               x.Plane().Distance(y.Plane().Location()) < 1e-7;
    if (x.GetType() != GeomAbs_Cylinder) return false;
    const auto p = x.Cylinder(), q = y.Cylinder();
    return std::abs(p.Radius() - q.Radius()) < 1e-7 &&
           p.Axis().IsCoaxial(q.Axis(), 1e-10, 1e-7);
}
bool contains(const std::vector<TopoDS_Face>& faces, const TopoDS_Shape& face) {
    return std::any_of(faces.begin(), faces.end(), [&](const auto& f) { return f.IsSame(face); });
}
std::vector<TopoDS_Face> neighbors(const TopoDS_Face& face,
        const TopTools_IndexedDataMapOfShapeListOfShape& adjacency) {
    std::vector<TopoDS_Face> result;
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
        for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(e.Current())); i.More(); i.Next())
            if (!i.Value().IsSame(face) && !contains(result, i.Value()))
                result.push_back(TopoDS::Face(i.Value()));
    }
    return result;
}
bool crossed(const TopoDS_Face& face, const TopoDS_Face& seed, double distance) {
    BRepAdaptor_Surface surface(seed);
    if (surface.GetType() != GeomAbs_Plane || distance >= 0) return false;
    const auto plane = surface.Plane();
    auto normal = gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection()));
    if (seed.Orientation() == TopAbs_REVERSED) normal.Reverse();
    gp_Trsf local;
    local.SetTransformation(gp_Ax3(plane.Location(), gp_Dir(normal)));
    Bnd_Box box;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(face, local, true).Shape(), box, false, false);
    double x0, y0, z0, x1, y1, z1;
    box.Get(x0, y0, z0, x1, y1, z1);
    return z1 <= 1e-7 && z0 >= distance - 1e-7;
}
bool mergedEndpoints(const TopoDS_Face& face) {
    // Older offset limits accepted a short open seam with both endpoints merged
    // into one high-tolerance vertex. Recognize that defect from exact curves,
    // not from small area alone (a legitimate thin wall must remain editable).
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current());
        const auto first = TopExp::FirstVertex(edge), last = TopExp::LastVertex(edge);
        if (first.IsNull() || last.IsNull() || !first.IsSame(last)) continue;
        double a, b;
        const auto curve = BRep_Tool::Curve(edge, a, b);
        if (!curve.IsNull() && curve->Value(a).Distance(curve->Value(b)) > 2e-6) return true;
    }
    return false;
}
std::vector<TopoDS_Face> removable(const Operand& body, const std::vector<TopoDS_Face>& seeds,
                                  double distance) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    std::vector<TopoDS_Face> result;
    for (const auto& seed : seeds) {
        std::vector<TopoDS_Face> frontier{seed};
        for (size_t i = 0; i < frontier.size(); ++i)
            for (const auto& other : neighbors(frontier[i], adjacency)) {
                if (contains(seeds, other) || contains(frontier, other) || !crossed(other, seed, distance)) continue;
                frontier.push_back(other);
                if (!contains(result, other)) result.push_back(other);
            }
    }
    for (const auto& entity : body.entities)
        if (entity.shape.ShapeType() == TopAbs_FACE && !contains(seeds, entity.shape) &&
            !contains(result, entity.shape) && mergedEndpoints(TopoDS::Face(entity.shape)))
            result.push_back(TopoDS::Face(entity.shape));
    std::erase_if(result, [&](const auto& face) {
        const auto adjacent = neighbors(face, adjacency);
        return std::none_of(adjacent.begin(), adjacent.end(), [&](const auto& other) {
            return !contains(seeds, other) && sameSupport(face, other);
        });
    });
    return result;
}
Operand mergeBoundaries(const Operand& body, const std::vector<TopoDS_Face>& removed,
                        std::vector<TopoDS_Face>& seeds) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(body.shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    TopTools_MapOfShape eligible;
    for (const auto& face : removed)
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(e.Current())); i.More(); i.Next())
                if (!i.Value().IsSame(face) && sameSupport(face, TopoDS::Face(i.Value()))) eligible.Add(e.Current());
    const auto merged = cleanupEdges(body, eligible);
    TopTools_IndexedMapOfShape current;
    TopExp::MapShapes(merged.shape, current);
    for (auto& seed : seeds) {
        const auto source = std::find_if(body.entities.begin(), body.entities.end(),
            [&](const auto& e) { return e.shape.IsSame(seed); });
        const auto next = std::find_if(merged.predecessors.begin(), merged.predecessors.end(),
            [&](const auto& e) { return e.id == source->id && current.Contains(e.shape); });
        if (next == merged.predecessors.end())
            throw GeometricFailure("Those faces cannot be offset after boundary absorption");
        seed = TopoDS::Face(current(current.FindIndex(next->shape)));
    }
    return {body.id, merged.shape, merged.predecessors};
}
}

Operand prepareOffset(const Operand& body, std::vector<TopoDS_Face>& seeds, double distance) {
    const auto removed = removable(body, seeds, distance);
    if (removed.empty()) return body;
    if (std::none_of(removed.begin(), removed.end(), mergedEndpoints))
        return mergeBoundaries(body, removed, seeds);
    BRepAlgoAPI_Defeaturing heal;
    heal.SetShape(body.shape);
    heal.SetToFillHistory(true);
    for (const auto& face : removed) heal.AddFaceToRemove(face);
    heal.Build();
    if (!heal.IsDone() || heal.HasErrors() || heal.HasWarnings())
        throw GeometricFailure("Those faces cannot be offset across the disappearing boundary");
    validate(heal.Shape());
    if (std::abs(volume(heal.Shape()) - volume(body.shape)) > std::max(1e-8, volume(body.shape) * 1e-10))
        throw InvalidGeometryFailure("Kernel produced invalid geometry: offset preparation changed material");
    Operand result{body.id, heal.Shape(), {}};
    for (const auto& source : body.entities) {
        if (!heal.IsDeleted(source.shape)) result.entities.push_back(source);
        for (const auto* list : {&heal.Modified(source.shape), &heal.Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) {
                    if (source.shape.ShapeType() == TopAbs_FACE)
                        checkUnselectedSupport(TopoDS::Face(source.shape), TopoDS::Face(i.Value()));
                    result.entities.push_back({source.id, i.Value()});
                }
    }
    // A consumed wall and its continuing neighbor merge, so neither old face ID
    // may masquerade as a one-to-one continuation of the combined face.
    for (const auto& source : body.entities) {
        if (!contains(removed, source.shape)) continue;
        if (!heal.IsDeleted(source.shape))
            throw GeometricFailure("Those faces cannot be offset across the disappearing boundary");
        for (const auto& neighbor : body.entities) {
            if (neighbor.shape.ShapeType() != TopAbs_FACE || contains(removed, neighbor.shape) ||
                !sameSupport(TopoDS::Face(source.shape), TopoDS::Face(neighbor.shape))) continue;
            for (TopTools_ListIteratorOfListOfShape i(heal.Modified(neighbor.shape)); i.More(); i.Next())
                if (i.Value().ShapeType() == TopAbs_FACE) result.entities.push_back({source.id, i.Value()});
        }
    }
    for (auto& seed : seeds) {
        const auto& modified = heal.Modified(seed);
        if (modified.Extent() == 1) seed = TopoDS::Face(modified.First());
        else if (heal.IsDeleted(seed) || !modified.IsEmpty())
            throw GeometricFailure("Those faces cannot be offset after boundary absorption");
    }
    return result;
}
