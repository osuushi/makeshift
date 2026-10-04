#include "circular-rim.h"
#include <BRepAdaptor_Curve.hxx>
#include <Geom_BSplineCurve.hxx>
#include <gce_MakeCirc.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <numbers>
#include <cmath>

std::optional<gp_Circ> circularRim(const TopoDS_Edge& edge) {
    BRepAdaptor_Curve curve(edge);
    const double first = curve.FirstParameter(), last = curve.LastParameter();
    if (curve.GetType() == GeomAbs_Circle)
        return std::abs(last - first - 2 * std::numbers::pi) < 1e-8
            ? std::optional(curve.Circle()) : std::nullopt;
    // NurbsConvert's circular rims are closed rational quadratics. Do not
    // classify a general loft seam or a polynomial approximation as a circle.
    if (curve.GetType() != GeomAbs_BSplineCurve || curve.Degree() != 2 ||
        !curve.IsRational() || !curve.IsClosed()) return {};
    gce_MakeCirc fit(curve.Value(first), curve.Value(first + (last-first)/3),
        curve.Value(first + 2*(last-first)/3));
    if (!fit.IsDone()) return {};
    const auto circle = fit.Value();
    const gp_Pln plane(circle.Location(), circle.Axis().Direction());
    const auto spline = curve.BSpline();
    // Check each rational span at the strict analytic recognition tolerance,
    // independent of the construction stations and display mesh.
    for (int k = 1; k < spline->NbKnots(); ++k) {
        const double a = std::max(first, spline->Knot(k));
        const double b = std::min(last, spline->Knot(k+1));
        if (b <= a) continue;
        for (int i = 0; i <= 16; ++i) {
            const auto p = curve.Value(a + (b-a)*i/16);
            if (plane.Distance(p) > 1e-8 ||
                std::abs(p.Distance(circle.Location()) - circle.Radius()) > 1e-8) return {};
        }
    }
    return circle;
}
