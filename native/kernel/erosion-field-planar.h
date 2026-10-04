#pragma once
#include "erosion-field-sampling.h"
#include <chrono>

namespace erosion::sections {
using Loop = std::vector<mesh_fit::V>;
using Loops = std::vector<Loop>;
struct Frame {
    mesh_fit::V x, y, axis, low, high;
    Frame(const mesh_fit::Mesh&, const mesh_fit::V& axis);
    mesh_fit::V point(double u,double v,double h) const { return x*u+y*v+axis*h; }
};
struct Budget {
    size_t samples = 0;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    void check();
};
Loops meshContours(const mesh_fit::Mesh&,const mesh_fit::V& axis,double height);
Loops contour(const InteriorField&,const Frame&,double height,double depth,double spacing,Budget&);
void order(Loops&,const Loops& previous,const mesh_fit::V& axis);
Loop controls(const Loop&,const Loop& previous,int count = 128);
TopoDS_Shape solid(const std::vector<Loops>& rows,const std::array<mesh_fit::V,2>& capNormals,double spacing,int maxFaces = 256,bool periodic = false);
}
namespace erosion {
std::optional<TopoDS_Shape> curvedInterior(const TopoDS_Shape&,const mesh_fit::Mesh&,double spacing,int maxFaces,int euler);
std::optional<TopoDS_Shape> contourInterior(const TopoDS_Shape&,const InteriorField&,const mesh_fit::Mesh&,double thickness,double spacing,int maxFaces);
}
