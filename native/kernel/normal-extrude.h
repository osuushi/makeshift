#pragma once
#include "kernel.h"
TopoDS_Shape normalExtrude(const TopoDS_Face& face, double distance, const std::string& id,
                          std::vector<SourceEntity>& origins);
