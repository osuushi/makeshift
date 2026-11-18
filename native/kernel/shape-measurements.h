#pragma once
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <TopoDS_Face.hxx>
#include <array>

struct Result;
Bnd_Box exactShapeBounds(const TopoDS_Shape&);
Bnd_Box conservativeFaceBounds(const TopoDS_Face&);
std::array<double, 6> resultBounds(const Result&);
double signedSolidMass(const TopoDS_Shape&);
GProp_GProps measuredSurface(const TopoDS_Face&);
