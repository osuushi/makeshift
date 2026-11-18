#include "volume-flux.h"
#include "measurement-cache.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepGProp_Domain.hxx>
#include <BRepGProp_Face.hxx>
#include <BRepGProp_VinertGK.hxx>
#include <BRep_Tool.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <array>
#include <cmath>
#include <limits>

namespace {
struct ProjectedFlux {
    double plane, datum;
    FaceFlux value;
};
using AxisFlux = std::array<std::optional<ProjectedFlux>, 3>;
MeasurementCache<AxisFlux> splineFlux(256, 12 * 1024 * 1024);

// Match the solid's integration datum, including all oriented vertex uses.
// A face's own centroid would change GK roundoff at large world coordinates.
std::optional<gp_Pnt> integrationDatum(const TopoDS_Shape& shape) {
    gp_XYZ sum(0,0,0);
    int count = 0;
    for (TopExp_Explorer it(shape, TopAbs_VERTEX); it.More(); it.Next()) {
        sum += BRep_Tool::Pnt(TopoDS::Vertex(it.Current())).XYZ();
        ++count;
    }
    if (!count) return {};
    return gp_Pnt(sum / count);
}
FaceFlux patchFlux(const TopoDS_Face& face, const gp_Pnt& datum, const gp_Pln& plane) {
    BRepGProp_VinertGK integral;
    integral.SetLocation(datum);
    BRepGProp_Face surface(face, true);
    double error;
    if (face.NbChildren()) {
        BRepGProp_Domain trim(face);
        error = integral.Perform(surface, trim, plane, 1e-10, false, false);
    } else error = integral.Perform(surface, plane, 1e-10, false, false);
    return {integral.Mass(), error};
}
}

std::optional<FaceFlux> measuredVolumeFlux(const TopoDS_Shape& shape, int axis, const gp_Pln& plane) {
    if (shape.ShapeType() != TopAbs_SOLID) return {};
    bool hasSpline = false;
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More() && !hasSpline; it.Next()) {
        const auto type = BRepAdaptor_Surface(TopoDS::Face(it.Current())).GetType();
        hasSpline = type == GeomAbs_BSplineSurface || type == GeomAbs_BezierSurface;
    }
    if (!hasSpline) return {};
    const auto datum = integrationDatum(shape);
    if (!datum) return {};
    const auto coordinate = plane.Location().Coord(axis+1), reference = datum->Coord(axis+1);
    FaceFlux sum{};
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) {
        const auto face = TopoDS::Face(it.Current());
        if (face.Orientation() != TopAbs_FORWARD && face.Orientation() != TopAbs_REVERSED) continue;
        if (BRep_Tool::Surface(face).IsNull()) return {};
        const auto type = BRepAdaptor_Surface(face).GetType();
        const auto entry = (type == GeomAbs_BSplineSurface || type == GeomAbs_BezierSurface) ?
            splineFlux.lookup(face) : nullptr;
        // For an axis-aligned plane the mass integrand uses only that axis'
        // coordinate of the datum. First moments and inertia are never requested.
        FaceFlux term;
        const auto previous = entry ? entry->value[axis] : std::nullopt;
        if (previous && previous->plane == coordinate && previous->datum == reference) term = previous->value;
        else {
            term = patchFlux(face, *datum, plane);
            if (!std::isfinite(term.mass) || !std::isfinite(term.error) || term.error < 0) return {};
            if (entry) entry->value[axis] = ProjectedFlux{coordinate, reference, term};
        }
        sum.mass += term.mass;
        sum.error += term.error;
    }
    if (!std::isfinite(sum.mass) || !std::isfinite(sum.error)) return {};
    if (sum.mass > std::numeric_limits<double>::epsilon()) sum.error /= sum.mass;
    return sum;
}
