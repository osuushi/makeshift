#include "erosion-field.h"
#include <cmath>
#include <stdexcept>

namespace erosion {
mesh_fit::Mesh offsetInteriorMesh(const mesh_fit::Mesh& mesh,double radius,double spacing) {
    if(!std::isfinite(radius)||!std::isfinite(spacing)||spacing<=0)
        throw std::runtime_error("Invalid mesh offset spacing");
    if(mesh.vertices.empty()||std::abs(radius)<1e-12) return mesh;
    auto low=mesh.vertices[0],high=low;
    for(const auto& p:mesh.vertices) for(int axis=1;axis<=3;++axis) {
        low.SetCoord(axis,std::min(low.Coord(axis),p.Coord(axis)));
        high.SetCoord(axis,std::max(high.Coord(axis),p.Coord(axis)));
    }
    const double growth=std::max(0.0,radius);
    const mesh_fit::V margin(growth+spacing*1.371,growth+spacing*1.371,growth+spacing*1.371);
    mesh_fit::Search search(mesh);
    auto inside=[&](const mesh_fit::V& p) {
        if(const auto value=search.contains(p)) return *value;
        const double jitter=std::min(std::abs(radius)*0.001,1e-7);
        if(const auto value=search.contains(p+mesh_fit::V(jitter,0,0))) return *value;
        throw std::runtime_error("Erode could not classify the smoothed interior");
    };
    auto result=contourField(low-margin,high+margin,spacing,[&](const mesh_fit::V& p) {
        const double distance=std::sqrt(search.closest(p).distance2);
        if(distance<=std::abs(radius)/2) return radius/2;
        return radius+(inside(p)?distance:-distance);
    },true);
    return result;
}
}
