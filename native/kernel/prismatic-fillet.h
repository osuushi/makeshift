#pragma once
#include "kernel.h"
#include <TopoDS_Edge.hxx>

// A straight convex corner between planar walls and perpendicular end caps.
// Cutting its swept circular section lets holes trim the cylinder directly.
std::optional<Result> prismaticFillet(const Operand&, const std::vector<TopoDS_Edge>&, double);
