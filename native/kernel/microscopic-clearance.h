#pragma once
#include <TopoDS_Face.hxx>

// Exact minimum separation of edges belonging to different face boundary loops.
// Bounding boxes only exclude distant pairs; they never establish a defect.
bool hasMicroscopicClearance(const TopoDS_Face&, double threshold);
