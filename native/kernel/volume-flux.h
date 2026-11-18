#pragma once
#include <TopoDS_Shape.hxx>
#include <gp_Pln.hxx>
#include <optional>

struct FaceFlux { double mass, error; };
std::optional<FaceFlux> measuredVolumeFlux(const TopoDS_Shape&, int axis, const gp_Pln&);
