#include "blends.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <algorithm>
#include <cmath>

namespace {
bool contains(const std::vector<TopoDS_Face>& faces, const TopoDS_Shape& face) {
    return std::any_of(faces.begin(), faces.end(), [&](const auto& f) { return f.IsSame(face); });
}
gp_Vec normal(const TopoDS_Face& face, const BRepAdaptor_Surface& surface) {
    gp_Pnt p; gp_Vec u, v;
    surface.D1((surface.FirstUParameter()+surface.LastUParameter())/2,
               (surface.FirstVParameter()+surface.LastVParameter())/2, p, u, v);
    auto n = u.Crossed(v).Normalized();
    if (face.Orientation() == TopAbs_REVERSED) n.Reverse();
    return n;
}
gp_Vec supportNormal(const TopoDS_Face& face, const BRepAdaptor_Surface& surface, const gp_Pnt& point) {
    if (surface.GetType() != GeomAbs_Cylinder) return normal(face, surface);
    const auto cylinder = surface.Cylinder();
    const gp_Vec axis(cylinder.Axis().Direction()), delta(cylinder.Location(), point);
    auto n = (delta - axis * delta.Dot(axis)).Normalized();
    if ((face.Orientation() == TopAbs_REVERSED) != !cylinder.Direct()) n.Reverse();
    return n;
}
}
// Recognize equal-setback chamfers between planar supports, or a
// coaxial cylinder and its planar cap. This is current geometry, not ancestry.
std::vector<BlendFace> recognizeChamfers(const TopoDS_Shape& shape) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    std::vector<BlendFace> result;
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane && surface.GetType() != GeomAbs_Cone) continue;
        const auto n = normal(face, surface);
        const auto sample = surface.Value((surface.FirstUParameter()+surface.LastUParameter())/2,
                                          (surface.FirstVParameter()+surface.LastVParameter())/2);
        std::vector<TopoDS_Face> supports;
        std::vector<gp_Pnt> boundary;
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
            BRepAdaptor_Curve curve(TopoDS::Edge(e.Current()));
            if (surface.GetType() == GeomAbs_Plane && curve.GetType() != GeomAbs_Line) continue;
            if (surface.GetType() == GeomAbs_Cone && curve.GetType() != GeomAbs_Circle) continue;
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromKey(e.Current())); i.More(); i.Next()) {
                const auto other = TopoDS::Face(i.Value());
                if (other.IsSame(face) || contains(supports, other)) continue;
                BRepAdaptor_Surface support(other);
                if (support.GetType() != GeomAbs_Plane && support.GetType() != GeomAbs_Cylinder) continue;
                // Planar chamfers only recognize planar supports below. A cylinder's
                // radial normal is undefined when a diameter-cut face samples its axis.
                if (surface.GetType() == GeomAbs_Plane && support.GetType() != GeomAbs_Plane) continue;
                const auto cosine = n.Dot(supportNormal(other, support, sample));
                if (std::abs(cosine) < 1e-6 || std::abs(cosine) > 1-1e-6) continue;
                if (surface.GetType() == GeomAbs_Cone && std::abs(std::abs(cosine) - std::sqrt(0.5)) > 1e-6) continue;
                supports.push_back(other);
                boundary.push_back(curve.Value((curve.FirstParameter()+curve.LastParameter())/2));
            }
        }
        if (supports.size() != 2) continue;
        BRepAdaptor_Surface a(supports[0]), b(supports[1]);
        double size = 0;
        double distanceScale = std::sqrt(2.0);
        if (surface.GetType() == GeomAbs_Plane && a.GetType() == GeomAbs_Plane && b.GetType() == GeomAbs_Plane) {
            const auto na = normal(supports[0], a), nb = normal(supports[1], b);
            const double sine = na.Crossed(nb).Magnitude(), cosine = n.Dot(na);
            if (sine < 1e-6 || std::abs(cosine - n.Dot(nb)) > 1e-6) continue;
            size = b.Plane().Distance(boundary[0]) / sine;
            if (std::abs(a.Plane().Distance(boundary[1]) / sine - size) > 1e-6) continue;
            distanceScale = 1 / std::sqrt(1-cosine*cosine);
        } else if (surface.GetType() == GeomAbs_Cone) {
            if (a.GetType() == GeomAbs_Cylinder && b.GetType() == GeomAbs_Plane) {
                std::swap(a, b); std::swap(boundary[0], boundary[1]); std::swap(supports[0], supports[1]);
            }
            if (a.GetType() != GeomAbs_Plane || b.GetType() != GeomAbs_Cylinder) continue;
            const auto cone = surface.Cone();
            const auto cylinder = b.Cylinder();
            if (!cone.Axis().IsParallel(cylinder.Axis(), 1e-6) ||
                gp_Lin(cylinder.Axis()).Distance(cone.Location()) > 1e-6 ||
                !a.Plane().Axis().IsParallel(cylinder.Axis(), 1e-6)) continue;
            size = a.Plane().Distance(boundary[1]);
            const double radial = gp_Lin(cylinder.Axis()).Distance(boundary[0]);
            if (std::abs(std::abs(radial-cylinder.Radius()) - size) > 1e-6) continue;
        }
        if (size <= 1e-7) continue;
        const int outward = n.Dot(normal(supports[0], BRepAdaptor_Surface(supports[0]))) > 0 ? 1 : -1;
        result.push_back({face, size, outward, supports, distanceScale});
    }
    return result;
}
