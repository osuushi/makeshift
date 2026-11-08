#pragma once
#include "kernel.h"

// Prefer geometry-preserving patch concatenation before destructive defeaturing.
// Returns after one certified join; unsupported patch layouts leave input intact.
// The caller runs full solid/self-intersection validation after the join batch.
bool joinMicroscopicPatch(Result&, const std::vector<TopoDS_Face>&);
