#pragma once
#include <TopoDS_Face.hxx>

// Round an internally tangent circular crescent before creating a solid.
TopoDS_Face printableCrescent(const TopoDS_Face& face);
