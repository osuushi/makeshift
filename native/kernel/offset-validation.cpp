#include "kernel.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepOffset_MakeOffset.hxx>
#include <BRep_Tool.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <Geom_RectangularTrimmedSurface.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopExp_Explorer.hxx>
#include <cmath>
#include <algorithm>
#include <stdexcept>

void checkOffsetFace(const TopoDS_Face& face, double distance) {
    BRepAdaptor_Surface surface(face);
    if (surface.GetType() == GeomAbs_Sphere || surface.GetType() == GeomAbs_Torus) {
        const bool sphere = surface.GetType() == GeomAbs_Sphere;
        const double radius = sphere ? surface.Sphere().Radius() : surface.Torus().MinorRadius();
        const bool direct = sphere ? surface.Sphere().Direct() : surface.Torus().Direct();
        const double sign = (face.Orientation() == TopAbs_REVERSED ? -1 : 1) * (direct ? 1 : -1);
        const double next = radius + sign * distance;
        if (next <= 1e-7 || (!sphere && next >= surface.Torus().MajorRadius() - 1e-7))
            throw std::runtime_error("Offset would collapse or self-intersect the curved face");
    }
    if (surface.GetType() == GeomAbs_Cylinder) {
        const double sign = (face.Orientation() == TopAbs_REVERSED ? -1 : 1) * (surface.Cylinder().Direct() ? 1 : -1);
        if (surface.Cylinder().Radius() + sign * distance <= 1e-7)
            throw std::runtime_error("Offset would collapse the cylindrical face");
    }
}
// A valid BRep alone is insufficient: OCCT can propagate an offset into unselected
// tangent faces. Check their continuing supports, rather than accepting that edit.
void checkUnselectedSupport(const TopoDS_Face& source, const TopoDS_Face& result) {
    auto original = BRep_Tool::Surface(source);
    // A partition changes the UV domain, not the supporting geometry. Resizing
    // may extend a surviving face beyond that temporary domain.
    while (const auto trimmed = Handle(Geom_RectangularTrimmedSurface)::DownCast(original))
        original = trimmed->BasisSurface();
    BRepAdaptor_Surface target(result);
    for (const double u : {0.2, 0.5, 0.8}) for (const double v : {0.2, 0.5, 0.8}) {
        const auto p = target.Value(target.FirstUParameter() * (1-u) + target.LastUParameter() * u,
                                    target.FirstVParameter() * (1-v) + target.LastVParameter() * v);
        GeomAPI_ProjectPointOnSurf projection(p, original);
        if (!projection.IsDone() || !projection.NbPoints() || projection.LowerDistance() > 1e-6)
            throw std::runtime_error("Offset would move an unselected neighboring face; include its tangent neighbors");
    }
}

void checkOffsetVolume(const TopoDS_Shape& before, const TopoDS_Shape& after, double distance,
                       const std::vector<TopoDS_Shape>& preservedVertices) {
    GProp_GProps props; BRepGProp::VolumeProperties(after, props);
    const double oldVolume = volume(before), next = props.Mass();
    if (next <= 1e-9 || (next - oldVolume) * (distance > 0 ? 1 : -1) < -1e-6)
        throw std::runtime_error("Kernel produced invalid geometry: offset inverted material");
    for (TopExp_Explorer v(after, TopAbs_VERTEX); v.More(); v.Next()) {
        const auto vertex = TopoDS::Vertex(v.Current());
        const double precision = BRep_Tool::Tolerance(vertex);
        if (precision <= 2e-6) continue;
        // A local reconstruction may carry an untouched, already accepted vertex.
        // Its position and tolerance must be preserved, never enlarged to admit an edit.
        const bool inherited = std::any_of(preservedVertices.begin(), preservedVertices.end(),
            [&](const auto& source) {
                const auto old = TopoDS::Vertex(source);
                return BRep_Tool::Pnt(old).Distance(BRep_Tool::Pnt(vertex)) <= 1e-12 &&
                       precision <= BRep_Tool::Tolerance(old);
            });
        if (!inherited)
            throw std::runtime_error("Kernel produced invalid geometry: offset merged distinct vertices");
    }
}
