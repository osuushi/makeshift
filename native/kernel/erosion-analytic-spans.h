#pragma once
#include <gp_Cylinder.hxx>
#include <gp_Torus.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>

namespace erosion {
// A cylinder cannot cross a cell wholly inside or wholly outside its radius.
// Radial distance is convex, and its change is bounded by projected reach.
inline bool cylinderCrosses(const gp_Cylinder& cylinder,
                            const std::array<gp_Pnt,8>& corners, double tolerance) {
    const gp_Vec axis(cylinder.Axis().Direction());
    const gp_Pnt center((corners[0].XYZ()+corners[7].XYZ())/2);
    const gp_Vec radial(cylinder.Location(),center);
    double maximum = 0, reach = 0;
    for (const auto& point : corners) {
        const gp_Vec v(cylinder.Location(),point), delta(center,point);
        maximum = std::max(maximum,(v-axis*v.Dot(axis)).Magnitude());
        reach = std::max(reach,(delta-axis*delta.Dot(axis)).Magnitude());
    }
    const double minimum = (radial-axis*radial.Dot(axis)).Magnitude()-reach;
    return maximum >= cylinder.Radius()-tolerance && minimum <= cylinder.Radius()+tolerance;
}

// Bound the tube's radial/axial cross-section by a rectangle enclosing the cell.
inline bool torusCrosses(const gp_Torus& torus,
                         const std::array<gp_Pnt,8>& corners, double tolerance) {
    if (torus.MajorRadius() <= torus.MinorRadius()) return true;
    const gp_Vec axis(torus.Axis().Direction());
    const gp_Pnt center((corners[0].XYZ()+corners[7].XYZ())/2);
    const gp_Vec radial(torus.Location(),center);
    double maximum = 0, reach = 0;
    double low = std::numeric_limits<double>::infinity(), high = -low;
    for (const auto& point : corners) {
        const gp_Vec v(torus.Location(),point), delta(center,point);
        maximum = std::max(maximum,(v-axis*v.Dot(axis)).Magnitude());
        reach = std::max(reach,(delta-axis*delta.Dot(axis)).Magnitude());
        low = std::min(low,v.Dot(axis)); high = std::max(high,v.Dot(axis));
    }
    const double minimum = std::max(0.0,(radial-axis*radial.Dot(axis)).Magnitude()-reach);
    const double major = torus.MajorRadius(), minor = torus.MinorRadius();
    const double nearest = std::hypot(std::clamp(major,minimum,maximum)-major,
                                      std::clamp(0.0,low,high));
    const double farthest = std::hypot(std::max(std::abs(minimum-major),std::abs(maximum-major)),
                                       std::max(std::abs(low),std::abs(high)));
    return nearest <= minor+tolerance && farthest >= minor-tolerance;
}
}
