#pragma once
#include <TopoDS_Shape.hxx>
#include <Bnd_Box.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <array>
#include <cmath>
#include <utility>
#include <vector>

namespace erosion::coverage {
struct Cell {
    std::array<double, 3> low, high;
    gp_Pnt center() const {
        return {(low[0]+high[0])/2, (low[1]+high[1])/2, (low[2]+high[2])/2};
    }
    double radius() const {
        return std::hypot(high[0]-low[0], high[1]-low[1], high[2]-low[2])/2;
    }
    Bnd_Box bounds() const {
        Bnd_Box box;
        box.Update(low[0], low[1], low[2], high[0], high[1], high[2]);
        return box;
    }
    std::array<gp_Pnt, 8> corners() const {
        std::array<gp_Pnt, 8> points;
        for (int i = 0; i < 8; ++i)
            points[i] = {i&1 ? high[0] : low[0], i&2 ? high[1] : low[1], i&4 ? high[2] : low[2]};
        return points;
    }
};
struct Plane {
    gp_Pnt origin;
    gp_Vec outward;
    double clearance(const gp_Pnt& p) const { return -gp_Vec(origin, p).Dot(outward); }
    double reach(const Cell& cell) const {
        double result = 0;
        for (int i = 0; i < 3; ++i)
            result += std::abs(outward.Coord(i+1)) * (cell.high[i]-cell.low[i])/2;
        return result;
    }
};

std::vector<Plane> convexPlanes(const TopoDS_Shape&);
Cell innerBounds(const TopoDS_Shape&,double depth);
std::pair<Cell,Cell> subdivide(const Cell&);
}
