#include "boolean-filter-filler.h"
#include "boolean-filter.h"
#include <BRep_Tool.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <stdexcept>

namespace {
double maximumTolerance(const TopoDS_Shape& shape) {
    double tolerance = 1e-7;
    for (TopExp_Explorer e(shape,TopAbs_FACE); e.More(); e.Next())
        tolerance = std::max(tolerance,BRep_Tool::Tolerance(TopoDS::Face(e.Current())));
    for (TopExp_Explorer e(shape,TopAbs_EDGE); e.More(); e.Next())
        tolerance = std::max(tolerance,BRep_Tool::Tolerance(TopoDS::Edge(e.Current())));
    for (TopExp_Explorer e(shape,TopAbs_VERTEX); e.More(); e.Next())
        tolerance = std::max(tolerance,BRep_Tool::Tolerance(TopoDS::Vertex(e.Current())));
    return tolerance;
}
class FilteredFiller : public BOPAlgo_PaveFiller {
    double padding;
public:
    explicit FilteredFiller(double tolerance) : padding(tolerance) {}
    void Init(const Message_ProgressRange& range) override {
        BOPAlgo_PaveFiller::Init(range);
        if (HasErrors()) return;
        auto iterator = std::make_unique<boolean_uv::FilteringIterator>(10,padding,true);
        iterator->SetDS(myDS);
        iterator->SetRunParallel(myRunParallel);
        iterator->Prepare(myContext,myUseOBB,myFuzzyValue);
        delete myIterator;
        myIterator = iterator.release();
    }
};
}
std::unique_ptr<BOPAlgo_PaveFiller> filteredBooleanFiller(
        const TopoDS_Shape& a, const TopoDS_Shape& b, double fuzzy, bool parallel) {
    auto filler = std::make_unique<FilteredFiller>(fuzzy+std::max(maximumTolerance(a),maximumTolerance(b)));
    TopTools_ListOfShape arguments; arguments.Append(a); arguments.Append(b);
    filler->SetArguments(arguments); filler->SetFuzzyValue(fuzzy);
    filler->SetNonDestructive(true); filler->SetRunParallel(parallel);
    filler->Perform();
    if (filler->HasErrors()) throw std::runtime_error("Experimental trim filtering failed");
    return filler;
}
