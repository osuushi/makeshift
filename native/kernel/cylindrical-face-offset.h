#pragma once
#include "kernel.h"

std::optional<Result> cylindricalFaceOffset(const Operand&, const std::vector<TopoDS_Face>&,
                                            double distance);
