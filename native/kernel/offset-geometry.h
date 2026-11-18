#pragma once
#include <Bnd_Box.hxx>
#include "kernel.h"
#include "geometry-policy.h"

// Shared numerical geometry checks for Shell and freeform Face Offset.
namespace offset_geometry {
using geometry_policy::boundaryDistanceMm;
using geometry_policy::generatedVertexAdjustmentMm;
bool freeform(const TopoDS_Shape& shape);
std::string encoding(const TopoDS_Shape& shape);
Operand prepare(const Operand& source, const char* context,
                std::vector<TopoDS_Face>* selected = nullptr, bool forceCopy = false);
void checkParallel(const TopoDS_Face& source, const TopoDS_Face& offset, double distance,
                   const char* context, bool preserveOrientation = false);
void validSolid(const TopoDS_Shape& shape, const char* context);
void validSolidNear(const TopoDS_Shape& shape, const char* context, const Bnd_Box& focus);
void rebuildBoundaries(const TopoDS_Shape& shape, const TopoDS_Shape& source);
}
