#include "erosion-coverage-cells.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRep_Tool.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>

namespace erosion::coverage {
constexpr double tolerance = geometry_policy::boundaryDistanceMm;
// For an entirely planar convex solid, its oriented supporting half-spaces
// provide exact box bounds, including the zero-allowance case.
std::vector<Plane> convexPlanes(const TopoDS_Shape& solid) {
    std::vector<Plane> planes;
    for (TopExp_Explorer e(solid, TopAbs_EDGE); e.More(); e.Next())
        if (BRepAdaptor_Curve(TopoDS::Edge(e.Current())).GetType() != GeomAbs_Line) return {};
    for (TopExp_Explorer f(solid, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane) return {};
        const auto plane = surface.Plane();
        gp_Vec normal(plane.Axis().Direction());
        if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
        planes.push_back({plane.Location(), normal});
    }
    for (TopExp_Explorer v(solid, TopAbs_VERTEX); v.More(); v.Next())
        for (const auto& plane : planes)
            if (plane.clearance(BRep_Tool::Pnt(TopoDS::Vertex(v.Current()))) < -tolerance) return {};
    return planes;
}

Cell innerBounds(const TopoDS_Shape& shape, double depth) {
    Bnd_Box box;
    BRepBndLib::AddOptimal(shape, box, false, true);
    Cell cell;
    box.Get(cell.low[0], cell.low[1], cell.low[2], cell.high[0], cell.high[1], cell.high[2]);
    for (int i = 0; i < 3; ++i) {
        cell.low[i] += depth;
        cell.high[i] -= depth;
    }
    return cell;
}
std::pair<Cell, Cell> subdivide(const Cell& cell) {
    int axis = 0;
    for (int i = 1; i < 3; ++i)
        if (cell.high[i]-cell.low[i] > cell.high[axis]-cell.low[axis]) axis = i;
    const double middle = (cell.low[axis]+cell.high[axis])/2;
    auto left = cell, right = cell;
    left.high[axis] = right.low[axis] = middle;
    return {left, right};
}
}
