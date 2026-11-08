#pragma once
#include "kernel.h"

// Normalize a private operation result before measurement/presentation is published.
// Read-only inspection of existing bodies does not invoke this mutation.
void resolveMicroscopicTopology(Result& result);
