#include "offset-continuation.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>
#include <Geom_SurfaceOfLinearExtrusion.hxx>
#include <Geom_BSplineSurface.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <optional>
#include <stdexcept>

namespace {
std::optional<gp_Vec> generator(const TopoDS_Face& face) {
    const BRepAdaptor_Surface surface(face);
    if (surface.GetType() == GeomAbs_Cylinder) return gp_Vec(surface.Cylinder().Axis().Direction());
    if (surface.GetType() == GeomAbs_SurfaceOfExtrusion) return gp_Vec(surface.Direction());
    if (surface.GetType() != GeomAbs_BSplineSurface) return std::nullopt;
    const auto spline = surface.BSpline();
    // Tensor-product control rows certify a translational support. Sampling a
    // few surface tangents cannot establish that an arbitrary bend is straight.
    for (const bool alongU : {false, true}) {
        if ((alongU ? spline->UDegree() : spline->VDegree()) != 1 ||
            (alongU ? spline->NbUPoles() : spline->NbVPoles()) != 2) continue;
        const int count = alongU ? spline->NbVPoles() : spline->NbUPoles();
        std::optional<gp_Vec> direction;
        bool linear = true;
        for (int i = 1; i <= count; ++i) {
            const auto a = alongU ? spline->Pole(1, i) : spline->Pole(i, 1);
            const auto b = alongU ? spline->Pole(2, i) : spline->Pole(i, 2);
            const auto wa = alongU ? spline->Weight(1, i) : spline->Weight(i, 1);
            const auto wb = alongU ? spline->Weight(2, i) : spline->Weight(i, 2);
            const gp_Vec travel(a, b);
            if (std::abs(wa - wb) > 1e-12 || travel.Magnitude() < 1e-9 ||
                (direction && (travel - *direction).Magnitude() > 1e-9)) { linear = false; break; }
            direction = travel;
        }
        if (linear && direction) return direction;
    }
    return std::nullopt;
}
}
gp_Vec offsetContinuation(const TopoDS_Shape& body, const TopoDS_Face& cap, double distance) {
    const auto plane = BRepAdaptor_Surface(cap).Plane();
    auto normal = gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection()));
    if (cap.Orientation() == TopAbs_REVERSED) normal.Reverse();
    TopTools_IndexedMapOfShape rims;
    TopExp::MapShapes(cap, TopAbs_EDGE, rims);
    std::vector<TopoDS_Face> neighbors;
    std::optional<gp_Vec> direction;
    for (TopExp_Explorer it(body, TopAbs_FACE); it.More(); it.Next()) {
        const auto face = TopoDS::Face(it.Current());
        if (face.IsSame(cap)) continue;
        bool adjacent = false;
        for (TopExp_Explorer edge(face, TopAbs_EDGE); edge.More(); edge.Next()) adjacent |= rims.Contains(edge.Current());
        if (!adjacent) continue;
        neighbors.push_back(face);
        if (BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane) continue;
        auto axis = generator(face);
        if (!axis || (direction && !axis->IsParallel(*direction, 1e-10)))
            throw std::runtime_error("Cap neighbors have no common straight continuation");
        direction = axis;
    }
    auto travel = direction.value_or(normal);
    const double projection = travel.Dot(normal);
    if (std::abs(projection) < 1e-10) throw std::runtime_error("Cap continuation is parallel to the moved plane");
    travel *= distance / projection;
    for (const auto& face : neighbors) {
        const BRepAdaptor_Surface support(face);
        if (support.GetType() == GeomAbs_Plane &&
            std::abs(travel.Dot(gp_Vec(support.Plane().Axis().Direction()))) > 1e-7)
            throw std::runtime_error("Cap continuation would change an adjoining plane");
    }
    return travel;
}
