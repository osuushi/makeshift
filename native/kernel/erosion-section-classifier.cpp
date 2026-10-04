#include "erosion-section-classifier.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve2d.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepTools.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_BezierSurface.hxx>
#include <GeomConvert_BSplineSurfaceToBezierSurface.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <math_DirectPolynomialRoots.hxx>
#include <algorithm>
#include <cmath>
#include <limits>

namespace {
constexpr double tolerance = geometry_policy::boundaryDistanceMm;
using Poles = std::array<double,4>;
double value(const Poles& p,double t) {
    const double s = 1-t;
    return s*s*s*p[0]+3*s*s*t*p[1]+3*s*t*t*p[2]+t*t*t*p[3];
}
math_DirectPolynomialRoots roots(const Poles& p) {
    return {p[3]-3*p[2]+3*p[1]-p[0],3*(p[2]-2*p[1]+p[0]),3*(p[1]-p[0]),p[0]};
}
bool rectangle(const TopoDS_Face& face,double u0,double u1,double v0,double v1) {
    int wires = 0;
    for (TopExp_Explorer w(face,TopAbs_WIRE); w.More(); w.Next()) ++wires;
    if (wires != 1) return false;
    for (TopExp_Explorer e(face,TopAbs_EDGE); e.More(); e.Next()) {
        BRepAdaptor_Curve2d curve(TopoDS::Edge(e.Current()),face);
        if (curve.GetType() != GeomAbs_Line) return false;
        const auto a = curve.Value(curve.FirstParameter()), b = curve.Value(curve.LastParameter());
        const bool u = std::abs(a.X()-b.X()) < 1e-10 &&
            (std::abs(a.X()-u0) < 1e-10 || std::abs(a.X()-u1) < 1e-10);
        const bool v = std::abs(a.Y()-b.Y()) < 1e-10 &&
            (std::abs(a.Y()-v0) < 1e-10 || std::abs(a.Y()-v1) < 1e-10);
        if (!u && !v) return false;
    }
    return true;
}
std::optional<int> crossings(const Poles& x,const Poles& y,double uncertainty) {
    if (*std::max_element(x.begin(),x.end()) < -tolerance ||
        *std::min_element(y.begin(),y.end()) > tolerance ||
        *std::max_element(y.begin(),y.end()) < -tolerance) return 0;
    const auto solutions = roots(y);
    if (!solutions.IsDone() || solutions.InfiniteRoots()) return {};
    double xSlope = 0, curvature = 0;
    for (int i = 1; i < 4; ++i) xSlope = std::max(xSlope,3*std::abs(x[i]-x[i-1]));
    for (int i = 2; i < 4; ++i) curvature = std::max(curvature,6*std::abs(y[i]-2*y[i-1]+y[i-2]));
    int count = 0;
    for (int i = 1; i <= solutions.NbSolutions(); ++i) {
        const double t = solutions.Value(i);
        if (t < -1e-7 || t > 1+1e-7) continue;
        const double horizontal = value(x,t);
        if (horizontal < -tolerance) continue;
        const double slope = 3*((1-t)*(1-t)*(y[1]-y[0])+2*(1-t)*t*(y[2]-y[1])+t*t*(y[3]-y[2]));
        const double residual = std::abs(value(y,t))+uncertainty;
        if (std::abs(slope) < 1e-9) return {};
        const double error = 2*residual/std::abs(slope);
        if (t <= error+1e-7 || t >= 1-error-1e-7 || horizontal <= tolerance ||
            curvature*error > std::abs(slope)/2 || xSlope*error+uncertainty > tolerance/8) return {};
        ++count;
    }
    return count;
}
}
erosion::SectionClassifier::SectionClassifier(const TopoDS_Shape& shape) {
    try {
        if (shape.ShapeType() != TopAbs_SOLID) return;
        std::optional<gp_Ax3> axes;
        for (TopExp_Explorer f(shape,TopAbs_FACE); f.More(); f.Next()) {
            BRepAdaptor_Surface support(TopoDS::Face(f.Current()));
            if (support.GetType() == GeomAbs_Plane) { axes = support.Plane().Position(); break; }
        }
        if (!axes) return;
        if (!axes->Direct()) axes->YReverse();
        frame.SetTransformation(*axes);
        for (TopExp_Explorer f(shape,TopAbs_FACE); f.More(); f.Next()) {
            const auto face = TopoDS::Face(f.Current());
            BRepAdaptor_Surface support(face);
            if (support.GetType() == GeomAbs_Plane) {
                auto plane = support.Plane(); plane.Transform(frame);
                if (std::hypot(plane.Axis().Direction().X(),plane.Axis().Direction().Y()) > 1e-12) return;
                planes.push_back(plane.Location().Z());
                continue;
            }
            if (support.GetType() != GeomAbs_BSplineSurface) return;
            auto surface = Handle(Geom_BSplineSurface)::DownCast(support.BSpline()->Copy());
            if (surface->IsURational() || surface->IsVRational() || surface->UDegree() != 3 || surface->VDegree() != 3) return;
            double u0,u1,v0,v1; BRepTools::UVBounds(face,u0,u1,v0,v1);
            if (!rectangle(face,u0,u1,v0,v1)) return;
            surface->Segment(u0,u1,v0,v1); surface->Transform(frame);
            GeomConvert_BSplineSurfaceToBezierSurface pieces(surface);
            if (patches.size()+size_t(pieces.NbUPatches())*pieces.NbVPatches() > 20000) return;
            for (int i = 1; i <= pieces.NbUPatches(); ++i) for (int j = 1; j <= pieces.NbVPatches(); ++j) {
                const auto piece = pieces.Patch(i,j);
                Patch patch;
                for (int u = 0; u < 4; ++u) for (int v = 0; v < 4; ++v) {
                    patch.poles[u][v] = piece->Pole(u+1,v+1);
                    patch.heightError = std::max(patch.heightError,std::abs(patch.poles[u][v].Z()-piece->Pole(1,v+1).Z()));
                }
                if (patch.heightError > 1e-9) return;
                const double first = patch.poles[0][0].Z(), last = patch.poles[0][3].Z();
                if (std::abs(last-first) <= tolerance) return;
                patch.minimumSlope = std::numeric_limits<double>::infinity();
                for (int v = 1; v < 4; ++v) {
                    const double slope = 3*(patch.poles[0][v].Z()-patch.poles[0][v-1].Z())*(last > first ? 1 : -1);
                    if (slope <= 0) return;
                    patch.minimumSlope = std::min(patch.minimumSlope,slope);
                    for (int u = 0; u < 4; ++u)
                        patch.maximumSlope = std::max(patch.maximumSlope,3*patch.poles[u][v].Distance(patch.poles[u][v-1]));
                }
                patch.low = std::min(first,last); patch.high = std::max(first,last);
                patches.push_back(patch);
            }
        }
        ready = !patches.empty() && planes.size() >= 2;
    } catch (const Standard_Failure&) {}
}
std::optional<bool> erosion::SectionClassifier::contains(const gp_Pnt& original,double minimumDistance) const {
    if (!ready || !std::isfinite(minimumDistance)) return {};
    const auto point = original.Transformed(frame);
    for (double plane : planes) if (std::abs(point.Z()-plane) <= tolerance) return {};
    int intersections = 0;
    for (const auto& patch : patches) {
        if (point.Z() < patch.low-tolerance || point.Z() > patch.high+tolerance) continue;
        if (std::abs(point.Z()-patch.low) <= tolerance || std::abs(point.Z()-patch.high) <= tolerance) return {};
        Poles height;
        for (int v = 0; v < 4; ++v) height[v] = patch.poles[0][v].Z()-point.Z();
        const auto vertical = roots(height);
        if (!vertical.IsDone() || vertical.InfiniteRoots()) return {};
        double parameter = -1;
        for (int i = 1; i <= vertical.NbSolutions(); ++i) if (vertical.Value(i) > 0 && vertical.Value(i) < 1) {
            if (parameter >= 0) return {};
            parameter = vertical.Value(i);
        }
        if (parameter < 0) return {};
        const double uncertainty = 1e-11+(patch.heightError+std::abs(value(height,parameter)))*patch.maximumSlope/patch.minimumSlope;
        if (uncertainty > tolerance/16) return {};
        Poles x,y;
        for (int u = 0; u < 4; ++u) {
            Poles xp,yp;
            for (int v = 0; v < 4; ++v) {
                xp[v] = patch.poles[u][v].X()-point.X();
                yp[v] = patch.poles[u][v].Y()-point.Y();
            }
            x[u] = value(xp,parameter); y[u] = value(yp,parameter);
        }
        const auto count = crossings(x,y,uncertainty);
        if (!count) return {};
        intersections += *count;
    }
    // OCCT treats both the interior and its tolerance band as contained. An
    // unambiguous interior answer agrees even when the hull distance is loose.
    // An exterior answer needs separation proof to exclude that tolerance band.
    if (intersections%2 == 1) return true;
    if (minimumDistance <= tolerance*4) return {};
    return false;
}
