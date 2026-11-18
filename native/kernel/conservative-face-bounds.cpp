#include "shape-measurements.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRep_Tool.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_BezierSurface.hxx>
#include <algorithm>
#include <optional>

namespace {
template<class Surface>
std::optional<Bnd_Box> poleBounds(const BRepAdaptor_Surface& trim, const Handle(Surface)& surface) {
    double u0, u1, v0, v1;
    surface->Bounds(u0, u1, v0, v1);
    if ((!surface->IsUPeriodic() && (trim.FirstUParameter() < u0 || trim.LastUParameter() > u1)) ||
        (!surface->IsVPeriodic() && (trim.FirstVParameter() < v0 || trim.LastVParameter() > v1)))
        return {};
    // Positive rational weights enclose every in-domain surface point in
    // the control hull. The adaptor's poles include the face placement.
    Bnd_Box bounds;
    for (const auto& pole : surface->Poles()) bounds.Add(pole);
    const auto& face = trim.Face();
    bounds.Enlarge(std::max({BRep_Tool::Tolerance(face), BRep_Tool::MaxTolerance(face, TopAbs_EDGE),
                             BRep_Tool::MaxTolerance(face, TopAbs_VERTEX)}));
    return bounds;
}
}

Bnd_Box conservativeFaceBounds(const TopoDS_Face& face) {
    const BRepAdaptor_Surface surface(face);
    std::optional<Bnd_Box> hull;
    if (surface.GetType() == GeomAbs_BSplineSurface) hull = poleBounds(surface, surface.BSpline());
    if (surface.GetType() == GeomAbs_BezierSurface) hull = poleBounds(surface, surface.Bezier());
    if (hull) return *hull;
    Bnd_Box box;
    BRepBndLib::AddOptimal(face, box, false, true);
    return box;
}
