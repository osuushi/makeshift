#pragma once
#include "kernel.h"
// Exact straight generators of the neighboring supports, including ruled splines.
gp_Vec offsetContinuation(const TopoDS_Shape&, const TopoDS_Face&, double);

std::optional<gp_Vec> offsetGenerator(const TopoDS_Face&);
