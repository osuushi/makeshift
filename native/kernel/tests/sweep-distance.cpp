#include "sweep-boundary-distance.h"
#ifdef MAKESHIFT_KERNEL_GPU_SEARCH
#include "sweep-candidates.h"
#endif
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <gp_Pln.hxx>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

namespace {
void expect(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
void compare(SweepBoundaryDistance& query, const TopoDS_Shape& boundary,
             const gp_Pnt& point, double tolerance, bool expected) {
    BRepExtrema_DistShapeShape original(BRepBuilderAPI_MakeVertex(point), boundary);
    expect(original.IsDone(), "Reference distance failed");
    expect((original.Value() <= tolerance) == expected, "Incorrect reference expectation");
    expect(query.within(point, tolerance) == expected, "Cached boundary check differs");
#ifdef MAKESHIFT_KERNEL_GPU_SEARCH
    for (const char* mode : {"cpu", "invalid", "gpu"}) {
#ifdef _WIN32
        _putenv_s("MAKESHIFT_SWEEP_CANDIDATES", mode);
#else
        setenv("MAKESHIFT_SWEEP_CANDIDATES", mode, 1);
#endif
        expect(sweepCandidatesWithin(boundary, {point}, tolerance) == expected, "Batched boundary check differs");
    }
#endif
}
void boxBoundary() {
    const auto box = BRepPrimAPI_MakeBox(10, 10, 10).Shape();
    const auto boundary = TopExp_Explorer(box, TopAbs_SHELL).Current();
    SweepBoundaryDistance query(boundary);
    constexpr double tolerance = 1e-6;
    // Reuse after passing and failing samples, and move between different faces.
    for (int i = 0; i < 3; ++i) {
        compare(query, boundary, {0, 3, 4}, tolerance, true);
        compare(query, boundary, {-0.5e-6, 3, 4}, tolerance, true);
        compare(query, boundary, {-2e-6, 3, 4}, tolerance, false);
        compare(query, boundary, {5, 5, 5}, tolerance, false);
        compare(query, boundary, {5, 10, 3}, tolerance, true);
        compare(query, boundary, {0, 0, 5}, tolerance, true);
        compare(query, boundary, {-0.5e-6, -0.5e-6, -0.5e-6}, tolerance, true);
        compare(query, boundary, {-1e-6, -1e-6, -1e-6}, tolerance, false);
    }
}
void trimmedLocatedFace() {
    BRepBuilderAPI_MakePolygon outer, hole;
    for (const auto& p : {gp_Pnt(0,0,0), gp_Pnt(10,0,0), gp_Pnt(10,10,0), gp_Pnt(0,10,0)}) outer.Add(p);
    for (const auto& p : {gp_Pnt(4,4,0), gp_Pnt(4,6,0), gp_Pnt(6,6,0), gp_Pnt(6,4,0)}) hole.Add(p);
    outer.Close(); hole.Close();
    BRepBuilderAPI_MakeFace make(gp_Pln(gp_Pnt(0,0,0), gp_Dir(0,0,1)), outer.Wire());
    make.Add(hole.Wire());
    gp_Trsf transform; transform.SetRotation(gp_Ax1(gp_Pnt(0,0,0), gp_Dir(1,0,0)), 0.7);
    transform.SetTranslationPart(gp_Vec(1e7,-8,30));
    const auto face = BRepBuilderAPI_Transform(make.Face(), transform, false).Shape();
    SweepBoundaryDistance query(face);
    for (const auto& [point, expected] : std::vector<std::pair<gp_Pnt, bool>>{
        {{2,2,0}, true}, {{5,5,0}, false}, {{4,5,0}, true}, {{11,5,0}, false},
        {{2,2,0.0004}, true}, {{2,2,0.0006}, false}})
        compare(query, face, point.Transformed(transform), 5e-4, expected);
}
void splineBoundary() {
    const auto cylinder = BRepPrimAPI_MakeCylinder(5, 10).Shape();
    const auto nurbs = BRepBuilderAPI_NurbsConvert(cylinder, true).Shape();
    const auto boundary = TopExp_Explorer(nurbs, TopAbs_SHELL).Current();
    SweepBoundaryDistance query(boundary);
    for (int i = 0; i < 8; ++i) {
        const double angle = 0.7 * i, x = std::cos(angle), y = std::sin(angle);
        compare(query, boundary, {5*x, 5*y, 3}, 1e-6, true);
        compare(query, boundary, {(5+0.5e-6)*x, (5+0.5e-6)*y, 3}, 1e-6, true);
        compare(query, boundary, {(5+2e-6)*x, (5+2e-6)*y, 3}, 1e-6, false);
        compare(query, boundary, {(5-2e-6)*x, (5-2e-6)*y, 3}, 1e-6, false);
    }
}
}
int main() {
    boxBoundary(); trimmedLocatedFace(); splineBoundary();
    std::cout << "Sweep distance: face/edge/corner, interior, tolerance, holes, placement and splines passed\n";
}
