#include "erosion.h"
#include "geometry-policy.h"
#include "erosion-distance-bounds.h"
#include "erosion-analytic-spans.h"
#include "erosion-coverage-cells.h"
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <iostream>
#include <stdexcept>

void bezierDistanceBounds();

namespace {
TopoDS_Shape empty() {
    TopoDS_Compound result; BRep_Builder().MakeCompound(result); return result;
}
void rejected(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth) {
    try { erosion::checkCoverage(source, candidate, depth); }
    catch (const std::runtime_error&) { return; }
    throw std::runtime_error("Accepted missing interior beyond allowance");
}
void cylinderSpans() {
    constexpr double tolerance = geometry_policy::boundaryDistanceMm;
    const gp_Cylinder cylinder(gp_Ax3(),5);
    for (const auto& direction : {gp_Dir(0,0,1),gp_Dir(1,.2,.1)}) {
        const gp_Ax3 frame(gp_Pnt(15,-8,23),direction);
        const gp_Cylinder tilted(frame,5);
        for (const double radius : {4.5,5.0,5.5}) {
            const gp_Pnt center = frame.Location().Translated(
                gp_Vec(frame.XDirection())*radius+gp_Vec(direction)*6);
            erosion::coverage::Cell cell;
            for (int axis=0;axis<3;++axis) {
                cell.low[axis]=center.Coord(axis+1)-.01;
                cell.high[axis]=center.Coord(axis+1)+.01;
            }
            if (erosion::cylinderCrosses(tilted,cell.corners(),tolerance) != (radius==5))
                throw std::runtime_error("Cylinder span missed a boundary or failed to certify radial separation");
        }
    }
    // A diagonal exterior lies inside the cylinder's Cartesian bounding box.
    const erosion::coverage::Cell exterior{{3.95,3.95,4.95},{4.05,4.05,5.05}};
    erosion::BoundaryDistance bounds(BRepPrimAPI_MakeCylinder(5,10).Shape());
    if (bounds.crosses(exterior.corners()))
        throw std::runtime_error("Separated cylinder span still requires point classification");
    const erosion::coverage::Cell tangent{{5-tolerance/2,-tolerance/2,5-tolerance/2},
                                        {5+tolerance/2,tolerance/2,5+tolerance/2}};
    if (!erosion::cylinderCrosses(cylinder,tangent.corners(),tolerance))
        throw std::runtime_error("Cylinder span discarded its boundary tolerance band");
}
void torusSpans() {
    constexpr double tolerance = geometry_policy::boundaryDistanceMm;
    for (const auto& direction : {gp_Dir(0,0,1),gp_Dir(1,.2,.1)}) {
        const gp_Ax3 frame(gp_Pnt(15,-8,23),direction);
        const gp_Torus torus(frame,5,1);
        for (const auto& sample : {std::array<double,3>{0,0,0}, {5,0,0}, {6,0,1}, {5.6,.9,0}}) {
            const gp_Pnt center = frame.Location().Translated(
                gp_Vec(frame.XDirection())*sample[0]+gp_Vec(direction)*sample[1]);
            erosion::coverage::Cell cell;
            for (int axis=0;axis<3;++axis) {
                cell.low[axis]=center.Coord(axis+1)-.01;
                cell.high[axis]=center.Coord(axis+1)+.01;
            }
            if (erosion::torusCrosses(torus,cell.corners(),tolerance) != bool(sample[2]))
                throw std::runtime_error("Torus span missed a boundary or failed to certify tube separation");
        }
    }
    const erosion::coverage::Cell hole{{-.01,-.01,-.01},{.01,.01,.01}};
    erosion::BoundaryDistance bounds(BRepPrimAPI_MakeTorus(5,1).Shape());
    if (bounds.crosses(hole.corners()))
        throw std::runtime_error("Separated torus hole still requires point classification");
    const erosion::coverage::Cell tangent{{6-tolerance/2,-tolerance/2,-tolerance/2},
                                        {6+tolerance/2,tolerance/2,tolerance/2}};
    if (!erosion::torusCrosses(gp_Torus(gp_Ax3(),5,1),tangent.corners(),tolerance) ||
        !erosion::torusCrosses(gp_Torus(gp_Ax3(),.5,1),hole.corners(),tolerance))
        throw std::runtime_error("Torus span discarded its tolerance band or unsupported spindle");
}
void distanceBounds() {
    const auto vertical = BRepPrimAPI_MakeCylinder(5, 12).Shape();
    const auto tilted = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, 6), gp_Dir(1, 0.2, 0.1)), 2, 12).Shape();
    const auto shape = BRepAlgoAPI_Fuse(vertical, tilted).Shape();
    erosion::BoundaryDistance bounds(shape);
    for (int x = -2; x <= 5; ++x) for (int y = -2; y <= 2; ++y) {
        const gp_Pnt point(x*2.31, y*1.27, 5.43+x*0.13);
        BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(point).Shape(), erosion::boundary(shape));
        if (!distance.IsDone() || bounds.lower(point) > distance.Value()+1e-6 ||
            bounds.upper(point) < distance.Value()-1e-6)
            throw std::runtime_error("Trimmed curved distance bounds are not conservative");
        for (const double limit : {0.1, 1.0, 10.0}) {
            const double upper = bounds.upper(point, limit);
            if (!std::isfinite(upper) || upper < distance.Value()-1e-6)
                throw std::runtime_error("Early distance certification underestimated the boundary");
        }
        std::array<gp_Pnt, 8> corners;
        for (int i = 0; i < 8; ++i) corners[i] = gp_Pnt(
            point.X()+(i&1 ? 0.1 : -0.1), point.Y()+(i&2 ? 0.1 : -0.1), point.Z()+(i&4 ? 0.1 : -0.1));
        const double upper = bounds.upper(corners);
        for (const auto& corner : corners) {
            BRepExtrema_DistShapeShape actual(BRepBuilderAPI_MakeVertex(corner).Shape(), erosion::boundary(shape));
            if (!actual.IsDone() || upper < actual.Value()-1e-6)
                throw std::runtime_error("Curved cell upper bound is not conservative");
        }
    }
}
void sphericalCoverage() {
    const auto outer = BRepPrimAPI_MakeSphere(8).Shape();
    const auto source = BRepAlgoAPI_Cut(outer, BRepPrimAPI_MakeSphere(6).Shape()).Shape();
    const auto exact = BRepAlgoAPI_Cut(BRepPrimAPI_MakeSphere(7.5).Shape(), BRepPrimAPI_MakeSphere(6.5).Shape()).Shape();
    if (erosion::sphericalCoverage(source, exact, 0.7) != true)
        throw std::runtime_error("Concentric spherical coverage was not certified");
    erosion::checkCoverage(source, exact, 0.7);
    const auto small = BRepAlgoAPI_Cut(BRepPrimAPI_MakeSphere(7).Shape(), BRepPrimAPI_MakeSphere(6.5).Shape()).Shape();
    rejected(source, small, 0.7);
    const auto largeVoid = BRepAlgoAPI_Cut(BRepPrimAPI_MakeSphere(7.5).Shape(), BRepPrimAPI_MakeSphere(6.9).Shape()).Shape();
    rejected(source, largeVoid, 0.7);
    rejected(source, empty(), 0.8);
    erosion::checkCoverage(source, empty(), 1.1);
    erosion::checkCoverage(outer, BRepPrimAPI_MakeSphere(7).Shape(), 1);
    rejected(outer, BRepPrimAPI_MakeSphere(6.5).Shape(), 1);
    const auto eccentric = BRepAlgoAPI_Cut(BRepPrimAPI_MakeSphere(7.5).Shape(),
        BRepPrimAPI_MakeSphere(gp_Pnt(0.4, 0, 0), 6.5).Shape()).Shape();
    if (erosion::sphericalCoverage(source, eccentric, 0.7).has_value())
        throw std::runtime_error("Eccentric surfaces must not use concentric coverage");
    rejected(source, eccentric, 0.7);
    erosion::BoundaryDistance bounds(source);
    const std::array<gp_Pnt, 8> cell{gp_Pnt(6.4,-.1,-.1), gp_Pnt(6.6,-.1,-.1),
        gp_Pnt(6.4,.1,-.1), gp_Pnt(6.6,.1,-.1), gp_Pnt(6.4,-.1,.1), gp_Pnt(6.6,-.1,.1),
        gp_Pnt(6.4,.1,.1), gp_Pnt(6.6,.1,.1)};
    if (bounds.upper(cell) < std::sqrt(6.6*6.6+0.02)-6 || bounds.upper(cell) > .61)
        throw std::runtime_error("Full spherical cell bound is inaccurate");
}
}
int main() {
    bezierDistanceBounds();
    cylinderSpans();
    torusSpans();
    distanceBounds();
    sphericalCoverage();
    const auto source = BRepPrimAPI_MakeBox(20, 20, 10).Shape();
    const auto exact = BRepPrimAPI_MakeBox(gp_Pnt(1, 1, 1), 18, 18, 8).Shape();
    erosion::checkCoverage(source, exact, 1);
    rejected(source, empty(), 1);
    const auto small = BRepPrimAPI_MakeBox(gp_Pnt(2, 2, 2), 16, 16, 6).Shape();
    rejected(source, small, 1.5);
    bool suggested = false;
    try { erosion::checkCoverage(source, small, 1.5); }
    catch (const erosion::CoverageFailure& failure) {
        // This exact box needs depth 2. A suggested upper bound must never
        // claim that any smaller depth covers its missing material.
        if (!std::isfinite(failure.requiredDepth) || failure.requiredDepth < 2-1e-6)
            throw std::runtime_error("Coverage feedback underestimated the required depth");
        erosion::checkCoverage(source, small, failure.requiredDepth+1e-6);
        suggested = true;
    }
    if (!suggested) throw std::runtime_error("Missing coverage did not report its conservative bound");
    erosion::checkCoverage(source, small, 2);
    erosion::checkCoverage(BRepPrimAPI_MakeBox(2, 20, 10).Shape(), empty(), 1.1);
    // A small, off-center omission must not pass merely because coarse samples miss it.
    const auto hole = BRepPrimAPI_MakeBox(gp_Pnt(3.13, 4.27, 2.31), 0.1, 0.1, 0.1).Shape();
    const auto punctured = BRepAlgoAPI_Cut(exact, hole).Shape();
    rejected(source, punctured, 1.2);
    // Curved supports use conservative distance bounds, never their display mesh.
    const auto cylinder = BRepPrimAPI_MakeCylinder(5, 10).Shape();
    const auto inset = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 1), gp_Dir(0, 0, 1)), 4, 8).Shape();
    erosion::checkCoverage(cylinder, inset, 1.2);
    rejected(cylinder, empty(), 1.2);
    std::cout << "Exact, allowance, empty, small omitted interior and curved coverage passed\n";
}
