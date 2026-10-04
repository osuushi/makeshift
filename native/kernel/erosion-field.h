#pragma once
#include "mesh-fit.h"
#include <functional>

namespace erosion {
// Temporary level-set proposal only. Its samples are not an erosion certificate.
mesh_fit::Mesh contourField(const mesh_fit::V& low,const mesh_fit::V& high,double spacing,
                           const std::function<double(const mesh_fit::V&)>& field, bool refineRoots = false, bool adaptive = false);
std::vector<mesh_fit::Mesh> interiorComponents(const mesh_fit::Mesh&);
mesh_fit::Mesh offsetInteriorMesh(const mesh_fit::Mesh&,double radius,double spacing);
std::optional<TopoDS_Shape> boxInterior(const TopoDS_Shape&,const mesh_fit::Mesh&);
TopoDS_Shape sectionInterior(const mesh_fit::Mesh&,double spacing,int maxFaces);
struct FastSettings { int detail = 1, maxFaces = 128; };
struct FastResult {
    TopoDS_Shape shape;
    double spacing = 0, sampledMin = 0, sampledMax = 0, sampledDeviation = 0;
    int triangles = 0, faces = 0, samples = 0;
};
FastResult reconstructInterior(const TopoDS_Shape&,double thickness,const FastSettings&);

}
