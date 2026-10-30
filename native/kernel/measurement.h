#pragma once
#include "kernel.h"
#include <optional>
struct GapWitness { double value; gp_Pnt a, b; };
struct GapRange { std::optional<GapWitness> minimum, maximum; bool approximate = true; };
GapRange facingGaps(const TopoDS_Shape&, const TopoDS_Shape&);
bool planarGapSamples(const TopoDS_Shape&, const TopoDS_Shape&, std::vector<gp_Pnt>&);
void measureSelection(std::ostream&, const Tree&, const std::vector<Operand>&);

bool infiniteMeasurementPlane(const TopoDS_Shape&);
TopoDS_Shape boundedMeasurementPlane(const TopoDS_Shape& plane, const TopoDS_Shape& shape);
