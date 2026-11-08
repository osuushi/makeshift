#pragma once
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>

// Concatenate complete rectangular spline patches along a shared isoparametric
// boundary. No interior fit: all original control rows survive. The only row
// reconciliation is bounded below the ordinary boundary precision.
TopoDS_Face joinMicroscopicPatchSurfaces(const TopoDS_Face&, const TopoDS_Face&,
                                         const TopoDS_Edge&);
