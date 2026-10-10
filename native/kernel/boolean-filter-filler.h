#pragma once
#include <BOPAlgo_PaveFiller.hxx>
#include <TopoDS_Shape.hxx>
#include <memory>

// Experimental; preserves OCCT's original box gate and exact uncertain-pair route.
std::unique_ptr<BOPAlgo_PaveFiller> filteredBooleanFiller(
    const TopoDS_Shape&, const TopoDS_Shape&, double fuzzy, bool parallel);
