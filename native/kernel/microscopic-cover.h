#pragma once
#include <TopoDS_Shape.hxx>

// Proves containment using a union of rigidly translated source solids. Every
// copy stays within the displacement budget; failed Boolean cuts contribute no
// coverage and never turn an unverified region into an accepted one.
bool microscopicCoverContains(const TopoDS_Shape& source, const TopoDS_Shape& candidate);
