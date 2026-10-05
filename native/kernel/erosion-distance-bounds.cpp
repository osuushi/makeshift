#include "erosion-distance-bounds.h"
#include "erosion-analytic-spans.h"
#include "geometry-policy.h"
#include "erosion-boundary-points.h"
#include "erosion-bezier-bounds.h"
#include "erosion-surface-witness.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepClass_FaceExplorer.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <ElSLib.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <tuple>
#include <vector>

namespace {
double segmentDistance(const gp_Pnt& p, const gp_Pnt& a, const gp_Pnt& b) {
    const gp_Vec edge(a, b), v(a, p);
    const double t = edge.SquareMagnitude() > 0
        ? std::clamp(v.Dot(edge)/edge.SquareMagnitude(), 0.0, 1.0) : 0;
    return (v-edge*t).Magnitude();
}
struct Triangle {
    gp_Pnt a, b, c;
    double distance(const gp_Pnt& p) const {
        const gp_Vec u(a, b), v(a, c), w(a, p);
        const double uu = u.Dot(u), vv = v.Dot(v), uv = u.Dot(v);
        const double determinant = uu*vv-uv*uv;
        if (determinant > 0) {
            const double x = (w.Dot(u)*vv-w.Dot(v)*uv)/determinant;
            const double y = (w.Dot(v)*uu-w.Dot(u)*uv)/determinant;
            if (x >= 0 && y >= 0 && x+y <= 1)
                return std::abs(w.Dot(u.Crossed(v)))/std::sqrt(determinant);
        }
        return std::min({segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, c, a)});
    }
};
struct Support {
    TopoDS_Face face;
    BRepAdaptor_Surface surface;
    erosion::BezierBounds bezier;
    erosion::SurfaceWitness witness;
    std::unique_ptr<BRepClass_FaceExplorer> explorer;
    bool polygon;
    bool fullSphere = false;
    double lo[3], hi[3];
    std::vector<std::pair<double, double>> fullBands;
    Support(const TopoDS_Face& face, bool polygon) : face(face), surface(face), bezier(surface), witness(surface),
        explorer(std::make_unique<BRepClass_FaceExplorer>(face)), polygon(polygon) {
        explorer->SetUseBndBox(true);
        explorer->SetMaxTolerance(geometry_policy::parameterCorrespondenceMm);
        Bnd_Box box;
        BRepBndLib::AddOptimal(face, box, false, true);
        box.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
        if (surface.GetType() == GeomAbs_Sphere) {
            fullSphere = true;
            for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
                const auto edge = TopoDS::Edge(e.Current());
                if (!BRep_Tool::Degenerated(edge) && !BRep_Tool::IsClosed(edge, face)) fullSphere = false;
            }
        }
        if (surface.GetType() == GeomAbs_Cylinder) {
            std::vector<std::pair<double, double>> axialBoundaries;
            gp_Trsf frame; frame.SetTransformation(surface.Cylinder().Position());
            for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
                if (BRep_Tool::IsClosed(TopoDS::Edge(e.Current()), face)) continue;
                Bnd_Box bounds;
                BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(e.Current(), frame, true).Shape(), bounds, false, true);
                double x0, y0, z0, x1, y1, z1;
                bounds.Get(x0, y0, z0, x1, y1, z1);
                axialBoundaries.emplace_back(z0, z1);
            }
            std::vector<double> ends;
            for (const auto& [first, last] : axialBoundaries) {
                ends.push_back(first); ends.push_back(last);
            }
            std::sort(ends.begin(), ends.end());
            for (size_t i = 1; i < ends.size(); ++i) {
                const double middle = (ends[i-1]+ends[i])/2;
                if (ends[i]-ends[i-1] <= geometry_policy::boundaryDistanceMm) continue;
                if (std::any_of(axialBoundaries.begin(), axialBoundaries.end(), [&](const auto& edge) {
                    return edge.first <= middle && edge.second >= middle;
                })) continue;
                if (std::isfinite(upper(ElSLib::Value(0, middle, surface.Cylinder()))))
                    fullBands.emplace_back(ends[i-1], ends[i]);
            }
        }
    }
    double lower(const gp_Pnt& p, double limit) const {
        double squared = 0;
        for (int i = 0; i < 3; ++i) {
            const double delta = std::max({lo[i]-p.Coord(i+1), p.Coord(i+1)-hi[i], 0.0});
            squared += delta*delta;
        }
        if (squared >= limit*limit) return std::sqrt(squared);
        double distance = bezier.lower(p);
        switch (surface.GetType()) {
            case GeomAbs_Plane: distance = surface.Plane().Distance(p); break;
            case GeomAbs_Cylinder: {
                const auto cylinder = surface.Cylinder();
                const gp_Vec v(cylinder.Location(), p), axis(cylinder.Axis().Direction());
                distance = std::abs((v-axis*v.Dot(axis)).Magnitude()-cylinder.Radius());
                break;
            }
            case GeomAbs_Sphere: {
                const auto sphere = surface.Sphere();
                distance = std::abs(p.Distance(sphere.Location())-sphere.Radius());
                break;
            }
            case GeomAbs_Torus: {
                const auto torus = surface.Torus();
                const gp_Vec v(torus.Location(), p), axis(torus.Axis().Direction());
                const double z = v.Dot(axis), radial = (v-axis*z).Magnitude();
                distance = std::abs(std::hypot(radial-torus.MajorRadius(), z)-torus.MinorRadius());
                break;
            }
            default: break;
        }
        // Trimming can only increase distance to a support. Its enclosing box
        // supplies an independent lower bound, particularly beyond a join.
        return std::max(distance, std::sqrt(squared));
    }
    double upper(const gp_Pnt& p) const {
        double u, v;
        switch (surface.GetType()) {
            case GeomAbs_Plane: ElSLib::Parameters(surface.Plane(), p, u, v); break;
            case GeomAbs_Cylinder: ElSLib::Parameters(surface.Cylinder(), p, u, v); break;
            case GeomAbs_Sphere: ElSLib::Parameters(surface.Sphere(), p, u, v); break;
            case GeomAbs_Torus: ElSLib::Parameters(surface.Torus(), p, u, v); break;
            case GeomAbs_BSplineSurface: std::tie(u,v) = witness.closest(p); break;
            default: return std::numeric_limits<double>::infinity();
        }
        if (surface.IsUPeriodic()) u += std::ceil((surface.FirstUParameter()-u)/surface.UPeriod())*surface.UPeriod();
        if (surface.IsVPeriodic()) v += std::ceil((surface.FirstVParameter()-v)/surface.VPeriod())*surface.VPeriod();
        BRepClass_FaceClassifier classifier(*explorer, gp_Pnt2d(u, v), 1e-9);
        if (classifier.State() != TopAbs_IN && classifier.State() != TopAbs_ON)
            return std::numeric_limits<double>::infinity();
        // An actual point of a trimmed face gives an upper bound. This does not
        // assume its untrimmed support is the nearest part of the solid.
        return p.Distance(surface.Value(u, v)) + geometry_policy::boundaryDistanceMm;
    }
    double bandUpper(const std::array<gp_Pnt, 8>& corners) const {
        if (fullSphere) {
            const auto sphere = surface.Sphere();
            gp_Pnt nearest;
            double maximum = 0;
            for (int i = 1; i <= 3; ++i)
                nearest.SetCoord(i, std::clamp(sphere.Location().Coord(i), corners[0].Coord(i), corners[7].Coord(i)));
            for (const auto& p : corners) maximum = std::max(maximum, p.Distance(sphere.Location()));
            return std::max(std::abs(nearest.Distance(sphere.Location())-sphere.Radius()),
                            std::abs(maximum-sphere.Radius()))+geometry_policy::boundaryDistanceMm;
        }
        if (surface.GetType() != GeomAbs_Cylinder) return std::numeric_limits<double>::infinity();
        const auto cylinder = surface.Cylinder();
        const gp_Vec axis(cylinder.Axis().Direction());
        const gp_Pnt center((corners[0].XYZ()+corners[7].XYZ())/2);
        double low = std::numeric_limits<double>::infinity(), high = -low, reach = 0, maximum = 0;
        for (const auto& p : corners) {
            const gp_Vec v(cylinder.Location(), p), delta(center, p);
            const double z = v.Dot(axis);
            low = std::min(low, z); high = std::max(high, z);
            maximum = std::max(maximum, (v-axis*z).Magnitude());
            reach = std::max(reach, (delta-axis*delta.Dot(axis)).Magnitude());
        }
        constexpr double tolerance = geometry_policy::boundaryDistanceMm;
        if (std::none_of(fullBands.begin(), fullBands.end(), [&](const auto& band) {
            return low > band.first+tolerance && high < band.second-tolerance;
        })) return std::numeric_limits<double>::infinity();
        // With no non-seam trimming edge in this axial interval, the connected
        // cylindrical band containing the classified point belongs to the face.
        // Radial reach ignores axial length, avoiding cubic cells along a tube.
        const gp_Vec v(cylinder.Location(), center);
        const double minimum = std::max(0.0, (v-axis*v.Dot(axis)).Magnitude()-reach);
        return std::max(std::abs(minimum-cylinder.Radius()), std::abs(maximum-cylinder.Radius()))+tolerance;
    }
    bool crosses(const std::array<gp_Pnt, 8>& points) const {
        constexpr double tolerance = geometry_policy::boundaryDistanceMm;
        for (int i = 0; i < 3; ++i)
            if (points[7].Coord(i+1) < lo[i]-tolerance || points[0].Coord(i+1) > hi[i]+tolerance) return false;
        if (surface.GetType() == GeomAbs_Plane) {
            const auto plane = surface.Plane();
            double low = std::numeric_limits<double>::infinity(), high = -low;
            for (const auto& p : points) {
                const double d = gp_Vec(plane.Location(), p).Dot(gp_Vec(plane.Axis().Direction()));
                low = std::min(low, d); high = std::max(high, d);
            }
            return low <= tolerance && high >= -tolerance;
        }
        if (surface.GetType() == GeomAbs_Cylinder &&
            !erosion::cylinderCrosses(surface.Cylinder(), points, tolerance)) return false;
        if (surface.GetType() == GeomAbs_Torus &&
            !erosion::torusCrosses(surface.Torus(), points, tolerance)) return false;
        if (surface.GetType() == GeomAbs_Sphere) {
            const auto sphere = surface.Sphere();
            gp_Pnt nearest;
            for (int i = 1; i <= 3; ++i)
                nearest.SetCoord(i, std::clamp(sphere.Location().Coord(i), points[0].Coord(i), points[7].Coord(i)));
            if (nearest.Distance(sphere.Location()) > sphere.Radius()+tolerance) return false;
            if (std::all_of(points.begin(), points.end(), [&](const gp_Pnt& p) {
                return p.Distance(sphere.Location()) < sphere.Radius()-tolerance;
            })) return false;
        }
        return bezier.crosses(points);
    }
};
bool planarPolygon(const TopoDS_Shape& shape) {
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next())
        if (BRepAdaptor_Surface(TopoDS::Face(f.Current())).GetType() != GeomAbs_Plane) return false;
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next())
        if (BRepAdaptor_Curve(TopoDS::Edge(e.Current())).GetType() != GeomAbs_Line) return false;
    return true;
}
}

struct erosion::BoundaryDistance::Impl {
    bool exact;
    BoundaryPoints points;
    std::vector<Triangle> triangles;
    std::vector<Support> supports;
    explicit Impl(const TopoDS_Shape& shape) : exact(planarPolygon(shape)), points(shape) {
        const auto copy = BRepBuilderAPI_Copy(shape, true, false).Shape();
        for (TopExp_Explorer f(copy, TopAbs_FACE); f.More(); f.Next()) {
            const bool polygon = planarPolygon(f.Current());
            supports.emplace_back(TopoDS::Face(f.Current()), polygon);
            if (!polygon) continue;
            BRepMesh_IncrementalMesh mesh(f.Current(), 0.01, false, 0.1, false);
            TopLoc_Location location;
            const auto triangulation = BRep_Tool::Triangulation(TopoDS::Face(f.Current()), location);
            if (triangulation.IsNull()) throw std::runtime_error("Erosion could not partition a planar face");
            for (int i = 1; i <= triangulation->NbTriangles(); ++i) {
                int a, b, c; triangulation->Triangle(i).Get(a, b, c);
                triangles.push_back({triangulation->Node(a).Transformed(location.Transformation()),
                    triangulation->Node(b).Transformed(location.Transformation()),
                    triangulation->Node(c).Transformed(location.Transformation())});
            }
        }
    }
};

erosion::BoundaryDistance::BoundaryDistance(const TopoDS_Shape& shape) : impl(std::make_unique<Impl>(shape)) {}
erosion::BoundaryDistance::~BoundaryDistance() = default;
bool erosion::BoundaryDistance::exact() const { return impl->exact; }
double erosion::BoundaryDistance::lower(const gp_Pnt& point) const {
    double distance = std::numeric_limits<double>::infinity();
    for (const auto& triangle : impl->triangles) distance = std::min(distance, triangle.distance(point));
    for (const auto& support : impl->supports)
        if (!support.polygon) distance = std::min(distance, support.lower(point,distance));
    return distance;
}
double erosion::BoundaryDistance::upper(const gp_Pnt& point, double limit) const {
    double distance = impl->points.upper(point);
    for (const auto& support : impl->supports) {
        if (distance <= limit) break;
        // A support farther away than an existing boundary witness cannot
        // improve that upper bound, so its trimmed-face classification is moot.
        if (support.lower(point,distance) >= distance) continue;
        distance = std::min(distance, support.upper(point));
    }
    return distance;
}
bool erosion::BoundaryDistance::crosses(const std::array<gp_Pnt, 8>& corners) const {
    return std::any_of(impl->supports.begin(), impl->supports.end(), [&](const Support& support) {
        return support.crosses(corners);
    });
}
double erosion::BoundaryDistance::upper(const std::array<gp_Pnt, 8>& corners) const {
    double distance = std::numeric_limits<double>::infinity();
    // Distance to a convex triangle is convex: its maximum over a box is
    // attained at a corner. Each triangle belongs to the actual boundary.
    for (const auto& triangle : impl->triangles) {
        double maximum = 0;
        for (const auto& corner : corners) maximum = std::max(maximum, triangle.distance(corner));
        distance = std::min(distance, maximum);
    }
    for (const auto& support : impl->supports) distance = std::min(distance, support.bandUpper(corners));
    return distance;
}
