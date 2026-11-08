#pragma once
#include <BRepTools_ReShape.hxx>
#include <TopoDS_Shape.hxx>
#include <utility>
#include <vector>

// Join a sub-resolution spline edge to a degree-two neighbor, preserving both
// spatial pieces and both incident pcurves, including C0 joins.
struct MicroscopicEdgeChains {
    Handle(BRepTools_ReShape) context;
    std::vector<std::pair<TopoDS_Shape, TopoDS_Shape>> aliases;
    TopoDS_Shape mapped(const TopoDS_Shape&) const;
};
MicroscopicEdgeChains joinMicroscopicEdgeChains(const TopoDS_Shape&);
