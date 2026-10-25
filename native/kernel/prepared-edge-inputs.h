#pragma once
#include "kernel.h"

// Bounded, disposable source preparation. Every caller receives an isolated copy.
std::vector<Operand> preparedEdgeOperands(const Tree& input);
