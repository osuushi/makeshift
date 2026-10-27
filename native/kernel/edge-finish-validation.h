#pragma once
#include <TopoDS_Shape.hxx>

void validateFinishManifold(const TopoDS_Shape&);

// Bounded material sanity check in addition to topological validity. Every
// sampled boundary point must belong to the finished envelope and not lie in
// the interior of a restored cavity. This is not a proof for arbitrary BReps.
void validateFinishBoundary(const TopoDS_Shape& result, const TopoDS_Shape& envelope,
                            const TopoDS_Shape& cavities);
