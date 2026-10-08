#include "shell-validation.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include "timing.h"
#include <BRepOffsetAPI_MakeThickSolid.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <BRep_Builder.hxx>
#include <BRepLib.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <set>
#include <memory>
#include <stdexcept>

namespace {
TopoDS_Compound compound() {
    TopoDS_Compound result; BRep_Builder().MakeCompound(result); return result;
}
TopTools_ListOfShape openingFaces(const Operand& body, const Tree& selection, TopTools_MapOfShape& removed) {
    TopTools_ListOfShape openings;
    for (const auto& item : selection.get_child("faces")) {
        const auto id = item.second.get_value<std::string>();
        const auto face = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) {
            return e.id == id && e.shape.ShapeType() == TopAbs_FACE;
        });
        if (face == body.entities.end() || !removed.Add(face->shape))
            throw std::runtime_error("Select existing opening faces only once");
        openings.Append(face->shape);
    }
    return openings;
}
struct ShellGeometry {
    std::unique_ptr<BRepOffsetAPI_MakeOffsetShape> operation;
    TopoDS_Shape wall;
};
ShellGeometry constructShell(const Operand& body, const TopTools_ListOfShape& openings,
                             double thickness, bool freeform, bool intersections) {
    if (!openings.IsEmpty()) {
        auto hollow = std::make_unique<BRepOffsetAPI_MakeThickSolid>();
        hollow->MakeThickSolidByJoin(body.shape, openings, thickness, 1e-7,
            BRepOffset_Skin, intersections, false, GeomAbs_Arc, false);
        if (!hollow->IsDone()) throw std::runtime_error("Shell is not feasible at this thickness and opening selection");
        const auto wall = hollow->Shape();
        return {std::move(hollow), wall};
    }
    auto offset = std::make_unique<BRepOffsetAPI_MakeOffsetShape>();
    offset->PerformByJoin(body.shape, thickness, 1e-7,
        BRepOffset_Skin, intersections, false, GeomAbs_Arc, false);
    if (!offset->IsDone()) throw std::runtime_error("Shell could not construct the offset surface");
    if (freeform) BRepLib::SameParameter(offset->Shape(), 1e-7, true);
    offset_geometry::tightenGeneratedBoundaries(offset->Shape(), body.shape);
    offset_geometry::validSolid(offset->Shape(), "Shell");
    const auto wall = thickness < 0 ? shell_tool::subtract(body.shape, offset->Shape())
                                   : shell_tool::subtract(offset->Shape(), body.shape);
    return {std::move(offset), shell_tool::oneSolid(wall)};
}
Result shellBody(const Operand& source, const Tree& selection, double thickness, bool intersections) {
    KernelTiming timing("shell-body");
    timing.phase("begin");
    const auto original = offset_geometry::encoding(source.shape);
    const auto body = shell_tool::canonical(source);
    const auto prepared = offset_geometry::encoding(body.shape);
    timing.phase("canonicalize");
    TopTools_MapOfShape removed;
    const auto openings = openingFaces(body, selection, removed);
    auto retained = compound(); BRep_Builder builder;
    bool freeform = false;
    for (const auto& e : body.entities) if (e.shape.ShapeType() == TopAbs_FACE && !removed.Contains(e.shape)) {
        const auto type = BRepAdaptor_Surface(TopoDS::Face(e.shape)).GetType();
        if (type == GeomAbs_Plane || type == GeomAbs_Cylinder || type == GeomAbs_Cone ||
            type == GeomAbs_Sphere || type == GeomAbs_Torus)
            checkOffsetFace(TopoDS::Face(e.shape), thickness);
        else freeform = true;
        builder.Add(retained, e.shape);
    }
    TopTools_IndexedMapOfShape retainedFaces;
    TopExp::MapShapes(retained, TopAbs_FACE, retainedFaces);
    if (retainedFaces.IsEmpty()) throw std::runtime_error("Shell needs at least one retained face");
    // canonical already validated this geometry. Selection/radius checks and
    // collecting retained faces do not change its supports, boundaries or bounds.
    timing.phase("validate-source");
    auto geometry = constructShell(body, openings, thickness, freeform, intersections);
    auto wall = geometry.wall;
    auto& operation = *geometry.operation;
    timing.phase("offset");
    // Generated spline pcurves can inherit the sweep's coarse parameterization.
    // Recompute before validation; input encodings below must remain unchanged.
    if (freeform) BRepLib::SameParameter(wall, 1e-7, true);
    TopTools_IndexedMapOfShape wallFaces;
    offset_geometry::tightenGeneratedBoundaries(wall, body.shape);
    TopExp::MapShapes(wall, TopAbs_FACE, wallFaces);
    auto parallel = compound();
    for (const auto& e : body.entities) {
        if (e.shape.ShapeType() != TopAbs_FACE || removed.Contains(e.shape)) continue;
        bool found = false;
        for (const auto& generated : operation.Generated(e.shape)) {
            if (generated.ShapeType() == TopAbs_FACE && wallFaces.Contains(generated)) {
                offset_geometry::checkParallel(TopoDS::Face(e.shape), TopoDS::Face(generated), thickness, "Shell");
                builder.Add(parallel, generated); found = true;
            }
        }
        if (!found) throw std::runtime_error("Shell could not verify every offset face");
        if (!wallFaces.Contains(e.shape)) throw std::runtime_error("Shell changed a preserved face");
    }
    if (offset_geometry::encoding(source.shape) != original || offset_geometry::encoding(body.shape) != prepared)
        throw std::runtime_error("Shell construction altered input geometry");
    timing.phase("correspondence");
    shell_tool::validateWall(body.shape, wall, parallel, retained, openings, thickness);
    timing.phase("validate-wall");
    // Retained source entities keep IDs through verified reparameterization. Offset faces/rims are new.
    return {wall, body.entities, {body.id}};
}
}
std::vector<Result> shellBodies(const Tree& input, const std::vector<Operand>& bodies,
                                std::vector<std::string>& participants) {
    const double thickness = input.get<double>("thickness");
    if (!std::isfinite(thickness) || std::abs(thickness) <= 10 * shell_tool::boundaryDistanceMm)
        throw std::runtime_error("Shell thickness must be finite and larger than 0.00001 mm in magnitude");
    std::set<std::string> seen;
    std::vector<Result> results;
    for (const auto& item : input.get_child("selection")) {
        const auto id = item.second.get<std::string>("body");
        const auto body = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == id; });
        if (body == bodies.end() || !seen.insert(id).second)
            throw std::runtime_error("Select existing shell bodies only once");
        try {
            results.push_back(shellBody(*body, item.second, thickness, false));
        } catch (const std::runtime_error&) {
            // Nearby offset supports may intersect beyond their original adjacency.
            // Each attempt owns a fresh copy; neither can modify the accepted body.
            results.push_back(shellBody(*body, item.second, thickness, true));
        }
        participants.push_back(id);
    }
    if (results.empty()) throw std::runtime_error("Select bodies or faces to shell");
    return results;
}
