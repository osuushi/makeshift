#include "erosion-boundary-points.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <TopExp_Explorer.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <limits>

erosion::BoundaryPoints::BoundaryPoints(const TopoDS_Shape& shape) {
    TopTools_IndexedMapOfShape edges, vertices;
    TopExp::MapShapes(shape, TopAbs_VERTEX, vertices);
    for (int i = 1; i <= vertices.Extent(); ++i) {
        points.push_back(BRep_Tool::Pnt(TopoDS::Vertex(vertices(i))));
        uncertainty = std::max(uncertainty, BRep_Tool::Tolerance(TopoDS::Vertex(vertices(i))));
    }
    TopExp::MapShapes(shape, TopAbs_EDGE, edges);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        uncertainty = std::max(uncertainty, BRep_Tool::Tolerance(edge));
        if (BRep_Tool::Degenerated(edge)) continue;
        BRepAdaptor_Curve curve(edge);
        const double first = curve.FirstParameter(), last = curve.LastParameter();
        for (int j = 0; j <= 256; ++j)
            points.push_back(curve.Value(first+(last-first)*j/256));
    }
    for (TopExp_Explorer faces(shape, TopAbs_FACE); faces.More(); faces.Next()) {
        const auto face = TopoDS::Face(faces.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_BezierSurface) continue;
        uncertainty = std::max(uncertainty, BRep_Tool::Tolerance(face));
        for (int i = 0; i <= 24; ++i) for (int j = 0; j <= 24; ++j) {
            const double u = surface.FirstUParameter()+(surface.LastUParameter()-surface.FirstUParameter())*i/24;
            const double v = surface.FirstVParameter()+(surface.LastVParameter()-surface.FirstVParameter())*j/24;
            BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u,v), 1e-9);
            if (classifier.State() == TopAbs_IN)
                points.push_back(surface.Value(u,v));
        }
    }
    partition(0, points.size(), 0);
}
void erosion::BoundaryPoints::partition(size_t first, size_t last, int axis) {
    if (first == last) return;
    const size_t middle = first+(last-first)/2;
    std::nth_element(points.begin()+first, points.begin()+middle, points.begin()+last,
        [axis](const gp_Pnt& a, const gp_Pnt& b) { return a.Coord(axis+1) < b.Coord(axis+1); });
    partition(first, middle, (axis+1)%3);
    partition(middle+1, last, (axis+1)%3);
}
void erosion::BoundaryPoints::nearest(const gp_Pnt& p, size_t first, size_t last,
                                    int axis, double& squared) const {
    if (first == last) return;
    const size_t middle = first+(last-first)/2;
    squared = std::min(squared, p.SquareDistance(points[middle]));
    const double delta = p.Coord(axis+1)-points[middle].Coord(axis+1);
    const int next = (axis+1)%3;
    if (delta < 0) {
        nearest(p, first, middle, next, squared);
        if (delta*delta < squared) nearest(p, middle+1, last, next, squared);
    } else {
        nearest(p, middle+1, last, next, squared);
        if (delta*delta < squared) nearest(p, first, middle, next, squared);
    }
}
double erosion::BoundaryPoints::upper(const gp_Pnt& p) const {
    double squared = std::numeric_limits<double>::infinity();
    nearest(p, 0, points.size(), 0, squared);
    return std::sqrt(squared)+uncertainty+geometry_policy::boundaryDistanceMm;
}
