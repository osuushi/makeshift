#pragma once
#include "kernel.h"
#include <memory>

class BRepAlgoAPI_BooleanOperation;

// One immutable operand pair, one Common operation and its intersection data.
// Sequential builders only; a repaired Cut must preprocess its new source again.
class BooleanProbe {
    TopoDS_Shape source, tool;
    std::unique_ptr<BRepAlgoAPI_BooleanOperation> common;
public:
    BooleanProbe(const TopoDS_Shape&, const TopoDS_Shape&);
    ~BooleanProbe();
    BooleanProbe(const BooleanProbe&) = delete;
    BooleanProbe& operator=(const BooleanProbe&) = delete;
    const TopoDS_Shape& shape() const;
    TopoDS_Shape intersect(std::vector<SourceEntity>&) const;
    TopoDS_Shape subtract(std::vector<SourceEntity>&) const;
};
