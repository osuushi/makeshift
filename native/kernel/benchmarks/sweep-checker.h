#pragma once
#include <BOPAlgo_CheckerSI.hxx>
#include <BOPDS_DS.hxx>
#include <BOPDS_Iterator.hxx>
#include <chrono>
#include <memory>
#include "sweep-boxes.h"

// Diagnostic subclass: every stage still invokes OCCT's complete implementation.
class SweepChecker : public BOPAlgo_CheckerSI {
    using Clock = std::chrono::steady_clock;
    void Init(const Message_ProgressRange& range) override {
        BOPAlgo_CheckerSI::Init(range);
        if (divisions) {
            auto iterator = std::make_unique<SweepIterator>();
            iterator->SetDS(myDS); iterator->Prepare(myContext, myUseOBB, myFuzzyValue);
            delete myIterator;
            myIterator = iterator.release();
        }
    }
    void PerformEF(const Message_ProgressRange& range) override {
        myIterator->Initialize(TopAbs_EDGE, TopAbs_FACE);
        edgeFacePairs = myIterator->ExpectedLength();
        const auto start = Clock::now();
        if (divisions) rejectedEF = static_cast<SweepIterator*>(myIterator)->filter(TopAbs_EDGE, TopAbs_FACE, divisions);
        BOPAlgo_CheckerSI::PerformEF(range);
        edgeFaceMs = std::chrono::duration<double,std::milli>(Clock::now()-start).count();
    }
    void PerformFF(const Message_ProgressRange& range) override {
        myIterator->Initialize(TopAbs_FACE, TopAbs_FACE);
        faceFacePairs = myIterator->ExpectedLength();
        const auto start = Clock::now();
        if (divisions) rejectedFF = static_cast<SweepIterator*>(myIterator)->filter(TopAbs_FACE, TopAbs_FACE, divisions);
        BOPAlgo_CheckerSI::PerformFF(range);
        faceFaceMs = std::chrono::duration<double,std::milli>(Clock::now()-start).count();
    }
public:
    int divisions = 0, rejectedEF = 0, rejectedFF = 0;
    double edgeFaceMs = 0, faceFaceMs = 0;
    int edgeFacePairs = 0, faceFacePairs = 0;
};
