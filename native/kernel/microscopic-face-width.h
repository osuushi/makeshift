#pragma once
#include <TopoDS_Face.hxx>

enum class FaceWidth { healthy, candidate, thin, uncertain };
// Whole-face numerical width, measured on a private triangulation and its
// perimeter polylines. Analytic certificates may avoid triangulation entirely.
FaceWidth microscopicFaceWidth(const TopoDS_Face &, double threshold);
