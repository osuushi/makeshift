#pragma once
#include "kernel.h"

// Normalize a private result before measuring/publishing it; unchanged results
// retain their shape, history and cached measurements exactly.
void simplifySmallFinishes(Result&);
