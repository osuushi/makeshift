#pragma once
#include <TopoDS_Shape.hxx>
#include <gp_Pnt.hxx>
#include <array>
#include <string>
#include <vector>

namespace boolean_uv {
struct Pair { TopoDS_Shape outer, inner; };
struct Variant {
    const char* name;
    int outerU, outerV, innerU, innerV;
    int refinementDepth = 0;
    bool useTrims = false, parallel = true;
    bool tightTorus = false;
};
struct Prepared {
    Pair pair;
    double milliseconds;
    double maximumTolerance;
    bool precisionPreserved;
};
struct Probe { gp_Pnt point; bool material; };
Pair readFixture(const std::string& path);
Prepared prepare(const Pair&, const Variant&);
double maximumTolerance(const TopoDS_Shape&);
double volume(const TopoDS_Shape&);
int count(const TopoDS_Shape&, TopAbs_ShapeEnum);
std::vector<Probe> probes(const Pair&);
void verify(const Pair& original, const Pair& split, const TopoDS_Shape& result,
            const std::array<double,2>& volumes, const std::vector<Probe>& probes);
}
