#include "kernel.h"
#include "boolean-periodic.h"
#include "boolean-probe.h"
#include "boolean-filter-filler.h"
#include "geometry-policy.h"
#include <BRepCheck_Analyzer.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRep_Tool.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_BSplineCurve.hxx>
#include <TopoDS.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <OSD_ThreadPool.hxx>
#include <algorithm>
#include <memory>
#include <set>
#include <stdexcept>

namespace {
bool hasCubicBoundary(const TopoDS_Shape& shape) {
    for (TopExp_Explorer edges(shape, TopAbs_EDGE); edges.More(); edges.Next()) {
        const auto edge = TopoDS::Edge(edges.Current());
        if (BRep_Tool::Degenerated(edge)) continue;
        const BRepAdaptor_Curve curve(edge);
        if (curve.GetType() == GeomAbs_BezierCurve &&
            curve.Bezier()->Degree() == 3 && !curve.Bezier()->IsRational()) return true;
        if (curve.GetType() == GeomAbs_BSplineCurve &&
            curve.BSpline()->Degree() == 3 && !curve.BSpline()->IsRational()) return true;
    }
    return false;
}
std::unique_ptr<BRepAlgoAPI_BooleanOperation> buildBoolean(
        const TopoDS_Shape& a, const TopoDS_Shape& b, const std::string& mode,
        const BOPAlgo_PaveFiller* filler = nullptr) {
    std::unique_ptr<BRepAlgoAPI_BooleanOperation> operation;
    if (mode == "union") operation = std::make_unique<BRepAlgoAPI_Fuse>();
    else if (mode == "subtract") operation = filler
        ? std::make_unique<BRepAlgoAPI_Cut>(*filler) : std::make_unique<BRepAlgoAPI_Cut>();
    else operation = std::make_unique<BRepAlgoAPI_Common>();
    TopTools_ListOfShape arguments, tools; arguments.Append(a); tools.Append(b);
    operation->SetArguments(arguments); operation->SetTools(tools);
    // Cubic approximations can oscillate about an analytic support. Use the same
    // bounded contact resolution for overlap detection and the resulting edit.
    const double fuzzy = hasCubicBoundary(a) || hasCubicBoundary(b)
        ? geometry_policy::cubicBooleanToleranceMm : 0;
    operation->SetFuzzyValue(fuzzy);
    operation->SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    operation->SetNonDestructive(true); operation->Build();
    if (!operation->IsDone() || operation->HasErrors()) throw std::runtime_error("Boolean operation failed");
    return operation;
}
void mapOrigins(BRepAlgoAPI_BooleanOperation& operation, std::vector<SourceEntity>& origins) {
    std::vector<SourceEntity> next;
    for (const auto& origin : origins) {
        if (!operation.IsDeleted(origin.shape)) next.push_back(origin);
        for (const auto* list : {&operation.Modified(origin.shape), &operation.Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) next.push_back({origin.id, i.Value()});
    }
    origins = std::move(next);
}
TopoDS_Shape finishBoolean(const TopoDS_Shape& a, const TopoDS_Shape& b, const std::string& mode,
                         std::vector<SourceEntity>& origins,
                         std::unique_ptr<BRepAlgoAPI_BooleanOperation> operation) {
    if (mode == "subtract" && !operation->Shape().IsNull() &&
        !BRepCheck_Analyzer(operation->Shape()).IsValid()) {
        const auto prepared = splitFailedCutFaces(a, *operation, origins);
        // Source topology changed: the old pair's intersection data is invalid.
        // Preserve the original pair's fuzzy value for the repair attempt.
        const double fuzzy = operation->FuzzyValue();
        operation = std::make_unique<BRepAlgoAPI_Cut>();
        TopTools_ListOfShape arguments, tools; arguments.Append(prepared); tools.Append(b);
        operation->SetArguments(arguments); operation->SetTools(tools);
        operation->SetFuzzyValue(fuzzy);
        operation->SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
        operation->SetNonDestructive(true); operation->Build();
        if (!operation->IsDone() || operation->HasErrors()) throw std::runtime_error("Boolean operation failed");
    }
    const auto result = operation->Shape();
    if (!result.IsNull()) validate(result);
    mapOrigins(*operation, origins);
    return result;
}
}
TopoDS_Shape booleanShape(const TopoDS_Shape& a, const TopoDS_Shape& b, const std::string& mode,
                         std::vector<SourceEntity>& origins) {
    return finishBoolean(a, b, mode, origins, buildBoolean(a, b, mode));
}
BooleanProbe::BooleanProbe(const TopoDS_Shape& a, const TopoDS_Shape& b)
    : source(a), tool(b), common(buildBoolean(a, b, "intersect")) {
    if (!shape().IsNull()) validate(shape());
}
BooleanProbe::~BooleanProbe() = default;
const TopoDS_Shape& BooleanProbe::shape() const { return common->Shape(); }
TopoDS_Shape BooleanProbe::intersect(std::vector<SourceEntity>& origins) const {
    mapOrigins(*common, origins);
    return shape();
}
TopoDS_Shape BooleanProbe::subtract(std::vector<SourceEntity>& origins) const {
    return finishBoolean(source, tool, "subtract", origins,
                         buildBoolean(source, tool, "subtract", common->DSFiller()));
}
void solids(std::vector<Result>& results, const TopoDS_Shape& shape,
            const std::vector<SourceEntity>& origins, const std::vector<std::string>& bodies, int referenceAxis) {
    if (shape.IsNull()) return;
    for (TopExp_Explorer e(shape, TopAbs_SOLID); e.More(); e.Next()) {
        validate(e.Current());
        const double measured = volume(e.Current(), referenceAxis);
        if (measured > geometry_policy::minimumSolidVolumeMm3) {
            Result result{e.Current(), origins, bodies};
            result.exactVolume = measured;
            results.push_back(std::move(result));
        }
    }
}

std::vector<Result> booleanBodies(const Tree& input, const std::vector<Operand>& bodies,
                                  std::vector<std::string>& participants) {
    const auto mode = input.get<std::string>("mode");
    if (mode != "union" && mode != "subtract" && mode != "intersect")
        throw std::runtime_error("Unknown Boolean mode");
    const bool keep = input.get<bool>("keepOriginals", false);
    const bool trimFiltering = input.get<bool>("experimentalTrimFiltering", false) && mode == "subtract";
    std::vector<const Operand*> selected;
    std::set<std::string> unique;
    for (const auto& item : input.get_child("ids")) {
        const auto id = item.second.get_value<std::string>();
        if (!unique.insert(id).second) throw std::runtime_error("Select each body only once");
        const auto found = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == id; });
        if (found == bodies.end()) throw std::runtime_error("Selected body no longer exists");
        selected.push_back(&*found);
    }
    if (selected.size() < 2) throw std::runtime_error("Select at least two bodies");
    // Keep correspondence for attachments even when originals survive. Materialization
    // gives descendants of retained originals new document-local identities.
    for (std::size_t i = 0; i < selected.size(); ++i)
        if (!keep || (mode == "subtract" && i == 0)) participants.push_back(selected[i]->id);
    auto shape = selected.front()->shape;
    std::vector<SourceEntity> origins = selected.front()->entities;
    for (std::size_t i = 1; i < selected.size(); ++i) {
        origins.insert(origins.end(), selected[i]->entities.begin(), selected[i]->entities.end());
        if (trimFiltering) {
            const auto& tool = selected[i]->shape;
            std::unique_ptr<BOPAlgo_PaveFiller> filler;
            std::unique_ptr<BRepAlgoAPI_BooleanOperation> operation;
            try {
                const double fuzzy = hasCubicBoundary(shape) || hasCubicBoundary(tool)
                    ? geometry_policy::cubicBooleanToleranceMm : 0;
                filler = filteredBooleanFiller(shape,tool,fuzzy,
                    OSD_ThreadPool::DefaultPool()->HasThreads());
                operation = buildBoolean(shape,tool,mode,filler.get());
                if (!operation->Shape().IsNull() && !BRepCheck_Analyzer(operation->Shape()).IsValid())
                    operation.reset();
            } catch (const Standard_Failure&) { operation.reset(); }
              catch (const std::exception&) { operation.reset(); }
            if (!operation) operation = buildBoolean(shape,tool,mode);
            shape = finishBoolean(shape,tool,mode,origins,std::move(operation));
        } else shape = booleanShape(shape, selected[i]->shape, mode, origins);
    }
    std::vector<Result> results;
    std::vector<std::string> predecessors;
    if (mode == "subtract") predecessors.push_back(selected.front()->id);
    else for (const auto* body : selected) predecessors.push_back(body->id);
    solids(results, shape, origins, predecessors);
    return results;
}
