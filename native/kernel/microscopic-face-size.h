#pragma once
#include <TopoDS_Face.hxx>

// A broad-phase result, not a repair decision. Only a complete analytic boundary
// certificate may return safe; unsupported or numerically uncertain faces defer.
enum class FaceSizeGate { safe, inspect };
FaceSizeGate faceSizeGate(const TopoDS_Face&, double minimumSpan);
