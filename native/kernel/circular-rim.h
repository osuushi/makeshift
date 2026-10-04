#pragma once
#include <TopoDS_Edge.hxx>
#include <gp_Circ.hxx>
#include <optional>

// Current-geometry recognition for analytic circles and their rational rims.
std::optional<gp_Circ> circularRim(const TopoDS_Edge&);
