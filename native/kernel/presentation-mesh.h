#pragma once
#include "kernel.h"
#include <TopTools_IndexedMapOfShape.hxx>

void meshPresentation(const TopoDS_Shape&, double deflection);
void presentPlane(std::ostream&, const TopoDS_Face&);
void presentVertices(std::ostream&, const TopoDS_Face&);
void presentNormals(std::ostream&, const TopoDS_Face&);
std::vector<std::vector<gp_Pnt>> meshEdges(const TopTools_IndexedMapOfShape& faces,
                                        const TopTools_IndexedMapOfShape& edges);
void presentVisual(std::ostream&, const Result&, double deflection = 0.05);
