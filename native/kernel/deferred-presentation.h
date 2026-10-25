#pragma once
#include "kernel.h"

// One disposable calculation result, never an application document. A new
// request replaces it; completion consumes it without rebuilding geometry.
void clearDeferredPresentation();
void deferPresentation(std::ostream&, std::vector<Result>, const std::string&,
                       const std::vector<std::string>&);
void completePresentation(std::ostream&);
