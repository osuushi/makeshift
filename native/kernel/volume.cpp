#include "kernel.h"
#include "timing.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>

namespace {
// Directional normal energy is only an integration-order hint. Near-tangent
// spline flux can make relative quadrature spend seconds resolving roundoff.
// Geometry, the requested integration tolerance and failure checks are unchanged.
std::array<double, 3> splineFlux(const TopoDS_Shape& shape) {
    std::array<double, 3> weakest{1, 1, 1};
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) {
        BRepAdaptor_Surface surface(TopoDS::Face(it.Current()));
        if (surface.GetType() != GeomAbs_BSplineSurface &&
            surface.GetType() != GeomAbs_BezierSurface) continue;
        std::array<double, 3> energy{};
        int count = 0;
        for (double u : {0.2, 0.5, 0.8}) for (double v : {0.2, 0.5, 0.8}) {
            gp_Pnt point; gp_Vec du, dv;
            surface.D1(std::lerp(surface.FirstUParameter(), surface.LastUParameter(), u),
                       std::lerp(surface.FirstVParameter(), surface.LastVParameter(), v), point, du, dv);
            const auto normal = du.Crossed(dv);
            const double square = normal.SquareMagnitude();
            if (!std::isfinite(square) || square <= 1e-24) continue;
            for (int axis = 0; axis < 3; ++axis)
                energy[axis] += normal.Coord(axis + 1) * normal.Coord(axis + 1) / square;
            ++count;
        }
        if (count) for (int axis = 0; axis < 3; ++axis)
            weakest[axis] = std::min(weakest[axis], energy[axis] / count);
    }
    return weakest;
}
std::array<int, 3> integrationAxes(const TopoDS_Shape& shape, const double* lo, const double* hi) {
    std::array<int, 3> axes{0, 1, 2};
    std::stable_sort(axes.begin(), axes.end(), [&](int a, int b) { return hi[a]-lo[a] < hi[b]-lo[b]; });
    try {
        const auto energy = splineFlux(shape);
        const double strongest = *std::max_element(energy.begin(), energy.end());
        // Keep the nearby-plane order unless an axis is markedly more tangent
        // than an available alternative. Exact analytic faces need no such hint.
        std::stable_partition(axes.begin(), axes.end(), [&](int axis) {
            return energy[axis] >= strongest / 16;
        });
    } catch (const Standard_Failure&) {
        // Optional sampling must not reject a shape the integrator can handle.
    }
    return axes;
}
}
double volume(const TopoDS_Shape& shape, int referenceAxis,
              std::optional<std::array<double, 6>>* exactBounds) {
    KernelTiming timing("volume");
    if (exactBounds) exactBounds->reset();
    if (shape.IsNull()) return 0;
    GProp_GProps props;
    bool planar = true;
    for (TopExp_Explorer e(shape, TopAbs_FACE); e.More(); e.Next())
        if (BRepAdaptor_Surface(TopoDS::Face(e.Current())).GetType() != GeomAbs_Plane) planar = false;
    double error;
    if (planar) error = BRepGProp::VolumeProperties(shape, props, 1e-10);
    else {
        Bnd_Box bounds; BRepBndLib::AddOptimal(shape, bounds, false, false);
        timing.phase("bounds");
        if (bounds.IsVoid()) return 0;
        double lo[3], hi[3]; bounds.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
        if (exactBounds) *exactBounds = std::array{lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]};
        // Integrate across spline spans. Ordinary adaptive quadrature can converge
        // to different volumes for the same solid after its faces are repartitioned.
        // A nearby exterior plane avoids near-zero integrals on trimmed faces,
        // without amplifying boundary tolerances along the body's longest axis.
        auto axes = integrationAxes(shape, lo, hi);
        if (referenceAxis >= 0 && referenceAxis < 3 && shape.ShapeType() == TopAbs_SOLID) {
            const auto preferred = std::find(axes.begin(), axes.end(), referenceAxis);
            std::rotate(axes.begin(), preferred, preferred + 1);
        }
        for (const int axis : axes) {
            gp_Pnt origin(lo[0],lo[1],lo[2]);
            origin.SetCoord(axis+1,lo[axis]-1);
            const gp_Dir normal(axis == 0,axis == 1,axis == 2);
            error = BRepGProp::VolumePropertiesGK(shape,props,gp_Pln(origin,normal),1e-10,false,true);
            if (std::isfinite(error) && error >= 0) break;
            // A failed face aborts GK before all properties are accumulated. Try a
            // different integral reference, never accept its partial mass or error.
            if (std::getenv("MAKESHIFT_KERNEL_TIMING"))
                std::cerr << "volume integration reference " << axis << " failed: " << error << std::endl;
        }
    }
    if (!std::isfinite(error) || error < 0) throw std::runtime_error("Solid volume integration failed");
    const double value = std::abs(props.Mass());
    timing.phase("integrate");
    if (!std::isfinite(value)) throw std::runtime_error("Non-finite solid volume");
    return value;
}
