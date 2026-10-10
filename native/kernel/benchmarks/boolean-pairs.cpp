#include "boolean-uv.h"
#include "boolean-filter.h"
#include "geometry-policy.h"
#include <BOPAlgo_PaveFiller.hxx>
#include <BOPDS_DS.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <Geom2d_Curve.hxx>
#include <IntTools_Context.hxx>
#include <IntTools_FaceFace.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <chrono>
#include <iostream>

namespace {
using Clock = std::chrono::steady_clock;
class Candidates : public BOPAlgo_PaveFiller {
public:
    bool fullOnly = false;
    void profile(const boolean_uv::Pair& pair, int rounds) {
        TopTools_ListOfShape arguments; arguments.Append(pair.outer); arguments.Append(pair.inner);
        SetArguments(arguments); SetNonDestructive(true);
        SetFuzzyValue(geometry_policy::cubicBooleanToleranceMm);
        Init(Message_ProgressRange());
        if (HasErrors()) throw std::runtime_error("Candidate initialization failed");
        boolean_uv::FilteringIterator iterator(10,geometry_policy::cubicBooleanToleranceMm+
            std::max(boolean_uv::maximumTolerance(pair.outer),boolean_uv::maximumTolerance(pair.inner)));
        iterator.SetDS(myDS); iterator.Prepare(myContext,false,myFuzzyValue);
        TopTools_IndexedMapOfShape outer,inner;
        TopExp::MapShapes(pair.outer,TopAbs_FACE,outer); TopExp::MapShapes(pair.inner,TopAbs_FACE,inner);
        std::cout << "round,outer_face,inner_face,outer_type,inner_type,full_ms,raw_ms,curves,points,curve_samples,both_in_samples,first_in_samples,second_in_samples\n";
        for (int round = 1; round <= rounds; ++round) {
            iterator.Initialize(TopAbs_FACE,TopAbs_FACE);
            for (; iterator.More(); iterator.Next()) {
                int a,b; iterator.Value(a,b);
                auto first = TopoDS::Face(myDS->Shape(a)), second = TopoDS::Face(myDS->Shape(b));
                if (!outer.Contains(first)) std::swap(first,second);
                inspect(first,second,outer.FindIndex(first),inner.FindIndex(second),round);
            }
        }
    }
    void inspect(const TopoDS_Face& first, const TopoDS_Face& second, int a, int b, int round) {
        IntTools_FaceFace full,raw;
        full.SetContext(myContext); raw.SetContext(myContext);
        full.SetFuzzyValue(myFuzzyValue); raw.SetFuzzyValue(myFuzzyValue);
        full.SetParameters(true,true,true,1e-7); raw.SetParameters(false,false,false,1e-7);
        const auto timed = [&](IntTools_FaceFace& algorithm) {
            const auto start = Clock::now(); algorithm.Perform(first,second,false);
            return std::chrono::duration<double,std::milli>(Clock::now()-start).count();
        };
        double fullMs, rawMs;
        if (fullOnly) { fullMs = timed(full); rawMs = 0; }
        else if (round%2) { fullMs = timed(full); rawMs = timed(raw); }
        else { rawMs = timed(raw); fullMs = timed(full); }
        if (!full.IsDone() || (!fullOnly && !raw.IsDone())) throw std::runtime_error("Pair intersection failed");
        int total = 0, both = 0, firstIn = 0, secondIn = 0;
        for (int i = 1; i <= full.Lines().Length(); ++i) {
            const auto& curve = full.Lines()(i);
            const auto& u = curve.FirstCurve2d(); const auto& v = curve.SecondCurve2d();
            if (u.IsNull() || v.IsNull()) continue;
            for (int j = 0; j < 21; ++j) {
                const double t = u->FirstParameter()+(u->LastParameter()-u->FirstParameter())*(j+0.5)/21;
                BRepClass_FaceClassifier ca(first,u->Value(t),1e-9), cb(second,v->Value(t),1e-9);
                const bool ai = ca.State() == TopAbs_IN || ca.State() == TopAbs_ON;
                const bool bi = cb.State() == TopAbs_IN || cb.State() == TopAbs_ON;
                ++total; firstIn += ai; secondIn += bi; both += ai && bi;
            }
        }
        std::cout << round << ',' << a << ',' << b << ',' << int(BRepAdaptor_Surface(first).GetType()) << ','
            << int(BRepAdaptor_Surface(second).GetType()) << ',' << fullMs << ',' << rawMs << ','
            << full.Lines().Length() << ',' << full.Points().Length() << ',' << total << ','
            << both << ',' << firstIn << ',' << secondIn << std::endl;
        std::cerr << "Profiled outer " << a << " / inner " << b << ": " << fullMs << " ms\n";
    }
};
}
int main(int argc, char** argv) {
    try {
        if (argc < 2 || argc > 4)
            throw std::runtime_error("Usage: boolean-pair-profile CAPTURE.json [rounds=3] [--full-only]");
        const int rounds = argc > 2 ? std::stoi(argv[2]) : 3;
        if (rounds < 1 || rounds > 10) throw std::runtime_error("Choose 1 to 10 rounds");
        Candidates candidates;
        if (argc > 3) {
            if (std::string(argv[3]) != "--full-only") throw std::runtime_error("Unknown profile option");
            candidates.fullOnly = true;
        }
        candidates.profile(boolean_uv::readFixture(argv[1]),rounds);
        return 0;
    } catch (const Standard_Failure& error) {
        std::cerr << error.GetMessageString() << std::endl;
    } catch (const std::exception& error) { std::cerr << error.what() << std::endl; }
    return 1;
}
