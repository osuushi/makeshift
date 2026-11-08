#pragma once
#include "kernel.h"
#include <BRepAlgoAPI_Defeaturing.hxx>

void continueRemovedFaceEdges(const Result&, const std::vector<TopoDS_Face>&,
                            BRepAlgoAPI_Defeaturing&, std::vector<SourceEntity>&);
