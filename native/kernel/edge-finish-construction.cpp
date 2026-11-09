#include "calculation-failure.h"
#include "edge-finish-construction.h"
#include "edge-finish-validation.h"
#include "microscopic-topology.h"
#include "small-finishes.h"
#include "timing.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <ShapeFix_Shape.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

namespace {
template<class Operation>
Result buildWith(Operation& operation, const Operand& body, const std::vector<TopoDS_Edge>& edges, double size,
                 const std::vector<SourceEntity>& continuingBlends) {
    for (const auto& edge : edges) operation.Add(size, edge);
    for (const auto& edge : edges)
        if (!operation.Contour(edge)) throw std::runtime_error("A selected edge cannot be rounded or chamfered");
    operation.Build();
    if (!operation.IsDone()) throw GeometricFailure("Edge finish is not feasible at this size");
    auto shape = operation.Shape();
    if (shape.IsNull()) throw InvalidGeometryFailure("Kernel produced invalid geometry");
    if (!BRepCheck_Analyzer(shape).IsValid()) {
        ShapeFix_Shape repair(shape);
        repair.Perform();
        shape = repair.Shape();
    }
    validate(shape);
    std::vector<SourceEntity> origins;
    for (const auto& origin : body.entities) {
        if (!operation.IsDeleted(origin.shape)) origins.push_back(origin);
        for (const auto* list : {&operation.Modified(origin.shape), &operation.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) origins.push_back({origin.id, i.Value()});
    }
    for (const auto& seed : continuingBlends)
        for (TopTools_ListIteratorOfListOfShape i(operation.Generated(seed.shape)); i.More(); i.Next())
            if (i.Value().ShapeType() == TopAbs_FACE) origins.push_back({seed.id, i.Value()});
    // Measure only the final trimmed solid; a temporary carrier needs no
    // presentation bounds or mass integration.
    return {shape, std::move(origins), {body.id}};
}
Result build(const Operand& body, const std::vector<TopoDS_Edge>& edges, double size, bool chamfer,
             const std::vector<SourceEntity>& continuingBlends) {
    if (chamfer) {
        BRepFilletAPI_MakeChamfer operation(body.shape);
        return buildWith(operation, body, edges, size, continuingBlends);
    }
    BRepFilletAPI_MakeFillet operation(body.shape);
    // Preserve the established fitting accuracy for subsequent face offsets.
    operation.SetParams(1e-2, 1e-7, 1e-7, 1e-7, 1e-7, 1e-3);
    return buildWith(operation, body, edges, size, continuingBlends);
}
Result normalizedFinish(Result rounded, const Operand& body) {
    validateFinishManifold(rounded.shape);
    std::vector<Result> results;
    solids(results, rounded.shape, rounded.predecessors, {body.id});
    if (results.size() != 1) throw GeometricFailure("Edge finish is not feasible at this size");
    simplifySmallFinishes(results.front());
    resolveMicroscopicTopology(results.front());
    validateFinishTrimLoops(results.front().shape);
    return results.front();
}
Result ordinaryFinish(const Operand& body, const std::vector<TopoDS_Edge>& edges, double radius, bool chamfer,
                      const std::vector<SourceEntity>& continuingBlends) {
    try {
        auto rounded = constructEdgeFinishOnSupports(body, edges, radius, chamfer, continuingBlends);
        validateFinishManifold(rounded.shape);
        return rounded;
    } catch (const Standard_Failure&) {
        return constructLocalEdgeFinish(body, edges, radius, chamfer, continuingBlends);
    } catch (const std::runtime_error&) {
        return constructLocalEdgeFinish(body, edges, radius, chamfer, continuingBlends);
    }
}
}

Result constructEdgeFinishOnSupports(const Operand& source, const std::vector<TopoDS_Edge>& selected, double radius, bool chamfer,
                 const std::vector<SourceEntity>& previousBlends) {
    // OCCT construction/ShapeFix may change shared entity tolerances even on a
    // rejected attempt. Keep subsequent construction and material proofs isolated.
    BRepBuilderAPI_Copy copy(source.shape, true, false);
    Operand body{source.id, copy.Shape(), {}};
    TopTools_IndexedMapOfShape current;
    TopExp::MapShapes(source.shape, current);
    for (const auto& entity : source.entities)
        if (current.Contains(entity.shape)) body.entities.push_back({entity.id, copy.ModifiedShape(entity.shape)});
    std::vector<TopoDS_Edge> edges;
    for (const auto& edge : selected) edges.push_back(TopoDS::Edge(copy.ModifiedShape(edge)));
    std::vector<SourceEntity> continuingBlends;
    for (const auto& blend : previousBlends)
        if (current.Contains(blend.shape)) continuingBlends.push_back({blend.id, copy.ModifiedShape(blend.shape)});
    KernelTiming timing("edge-finish-construction");
    if (const auto supports = edgeFinishSupports(body, edges)) {
        timing.phase("supports");
        auto mappedBlends = continuingBlends;
        for (auto& seed : mappedBlends)
            for (size_t i = 0; i < edges.size(); ++i)
                if (seed.shape.IsSame(edges[i])) { seed.shape = supports->edges[i]; break; }
        auto rounded = build(supports->carrier, supports->edges, radius, chamfer, mappedBlends);
        timing.phase("blend");
        // The recovered voids describe the material removed from the carrier.
        // A material-adding blend would require extending those void supports
        // into new space, not capping a through hole at its previous opening.
        std::vector<SourceEntity> unused;
        const auto added = booleanShape(rounded.shape, supports->carrier.shape, "subtract", unused);
        timing.phase("subset");
        if (TopExp_Explorer(added, TopAbs_SOLID).More()) return build(body, edges, radius, chamfer, continuingBlends);
        auto origins = rounded.predecessors;
        origins.insert(origins.end(), supports->interruptionOrigins.begin(), supports->interruptionOrigins.end());
        const auto shape = trimEdgeFinish(rounded.shape, supports->interruptions, origins, supports->seamIds);
        timing.phase("trim");
        return {shape, std::move(origins), {body.id}};
    }
    return build(body, edges, radius, chamfer, continuingBlends);
}

Result constructEdgeFinish(const Operand& body, const std::vector<TopoDS_Edge>& edges, double radius, bool chamfer,
                           const std::vector<SourceEntity>& continuingBlends) {
    try {
        try {
            return normalizedFinish(ordinaryFinish(body, edges, radius, chamfer, continuingBlends), body);
        } catch (const Standard_Failure&) {
        } catch (const std::runtime_error&) {
        }
        return normalizedFinish(constructCrossingEdgeFinish(body, edges, radius, chamfer, continuingBlends), body);
    } catch (const Standard_Failure& error) {
        if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "edge-finish rejected: " << error.GetMessageString() << "\n";
        throw GeometricFailure("Edge finish is not feasible at this size");
    } catch (const std::runtime_error& error) {
        if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "edge-finish rejected: " << error.what() << "\n";
        throw GeometricFailure("Edge finish is not feasible at this size");
    }
}
