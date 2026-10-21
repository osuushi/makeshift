#include "sweep-boxes.h"
#include <BOPDS_Tools.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_BezierSurface.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <unordered_map>

namespace {
void addPole(Bnd_Box& box, const gp_Pnt& point, double weight) {
    if (!std::isfinite(weight) || weight <= 0 || !std::isfinite(point.X()) ||
        !std::isfinite(point.Y()) || !std::isfinite(point.Z()))
        throw Standard_Failure("Invalid rational support");
    box.Add(point);
}
template<class Surface>
Bnd_Box surfaceHull(const Surface& surface, double padding) {
    Bnd_Box box;
    for (int u = 1; u <= surface->NbUPoles(); ++u)
        for (int v = 1; v <= surface->NbVPoles(); ++v) {
            addPole(box,surface->Pole(u,v),surface->Weight(u,v));
        }
    box.Enlarge(padding);
    return box;
}
template<class Curve>
Bnd_Box curveHull(const Curve& curve, double padding) {
    Bnd_Box box;
    for (int i = 1; i <= curve->NbPoles(); ++i) {
        addPole(box,curve->Pole(i),curve->Weight(i));
    }
    box.Enlarge(padding);
    return box;
}
bool finiteRange(double first, double last) {
    return std::isfinite(first) && std::isfinite(last) && first < last &&
        std::abs(first) < 1e100 && std::abs(last) < 1e100;
}
std::vector<Bnd_Box> faceBoxes(const TopoDS_Face& face, double padding, int n) {
    BRepAdaptor_Surface surface(face);
    const double u0 = surface.FirstUParameter(), u1 = surface.LastUParameter();
    const double v0 = surface.FirstVParameter(), v1 = surface.LastVParameter();
    if (!finiteRange(u0,u1) || !finiteRange(v0,v1)) return {};
    const auto type = surface.GetType();
    if (type != GeomAbs_BSplineSurface && type != GeomAbs_BezierSurface && type != GeomAbs_Plane) return {};
    if (type == GeomAbs_Plane) n = 1;
    std::vector<Bnd_Box> boxes;
    for (int i = 0; i < n; ++i) for (int j = 0; j < n; ++j) {
        const double ua = u0+(u1-u0)*i/n, ub = i+1 == n ? u1 : u0+(u1-u0)*(i+1)/n;
        const double va = v0+(v1-v0)*j/n, vb = j+1 == n ? v1 : v0+(v1-v0)*(j+1)/n;
        if (type == GeomAbs_BSplineSurface) {
            auto patch = surface.BSpline();
            patch->Segment(ua,ub,va,vb); boxes.push_back(surfaceHull(patch,padding));
        } else if (type == GeomAbs_BezierSurface) {
            auto patch = surface.Bezier();
            patch->Segment(ua,ub,va,vb); boxes.push_back(surfaceHull(patch,padding));
        } else {
            Bnd_Box box;
            box.Add(surface.Value(ua,va)); box.Add(surface.Value(ua,vb));
            box.Add(surface.Value(ub,va)); box.Add(surface.Value(ub,vb));
            box.Enlarge(padding); boxes.push_back(box);
        }
    }
    return boxes;
}
std::vector<Bnd_Box> edgeBoxes(const TopoDS_Edge& edge, double padding, int n) {
    if (BRep_Tool::Degenerated(edge)) return {};
    BRepAdaptor_Curve curve(edge);
    const double t0 = curve.FirstParameter(), t1 = curve.LastParameter();
    if (!finiteRange(t0,t1)) return {};
    const auto type = curve.GetType();
    if (type != GeomAbs_BSplineCurve && type != GeomAbs_BezierCurve && type != GeomAbs_Line) return {};
    if (type == GeomAbs_Line) n = 1;
    std::vector<Bnd_Box> boxes;
    for (int i = 0; i < n; ++i) {
        const double a = t0+(t1-t0)*i/n, b = i+1 == n ? t1 : t0+(t1-t0)*(i+1)/n;
        if (type == GeomAbs_BSplineCurve) {
            auto patch = Handle(Geom_BSplineCurve)::DownCast(curve.BSpline()->Copy()); patch->Segment(a,b);
            boxes.push_back(curveHull(patch,padding));
        } else if (type == GeomAbs_BezierCurve) {
            auto patch = Handle(Geom_BezierCurve)::DownCast(curve.Bezier()->Copy()); patch->Segment(a,b);
            boxes.push_back(curveHull(patch,padding));
        } else {
            Bnd_Box box; box.Add(curve.Value(a)); box.Add(curve.Value(b));
            box.Enlarge(padding); boxes.push_back(box);
        }
    }
    return boxes;
}
}
std::vector<Bnd_Box> sweepBoxes(const TopoDS_Shape& shape, double padding, int divisions) {
    try {
        if (shape.ShapeType() == TopAbs_FACE) return faceBoxes(TopoDS::Face(shape),padding,divisions);
        if (shape.ShapeType() == TopAbs_EDGE) return edgeBoxes(TopoDS::Edge(shape),padding,divisions);
    } catch (const Standard_Failure&) { /* Retain the original pair on uncertain geometry. */ }
    return {};
}
int SweepIterator::filter(TopAbs_ShapeEnum first, TopAbs_ShapeEnum second, int divisions) {
    // Rebuild bounds at each stage, after earlier stages may have increased tolerances.
    double padding = 1e-7;
    for (int i = 0; i < myDS->NbShapes(); ++i) {
        const auto& shape = myDS->Shape(i);
        if (shape.ShapeType() == TopAbs_FACE) padding = std::max(padding,BRep_Tool::Tolerance(TopoDS::Face(shape)));
        if (shape.ShapeType() == TopAbs_EDGE) padding = std::max(padding,BRep_Tool::Tolerance(TopoDS::Edge(shape)));
        if (shape.ShapeType() == TopAbs_VERTEX) padding = std::max(padding,BRep_Tool::Tolerance(TopoDS::Vertex(shape)));
    }
    padding = 4*padding+1e-7;
    const int type = BOPDS_Tools::TypeToInteger(first,second);
    const auto original = myLists(type);
    myLists(type).Clear();
    std::unordered_map<int,std::vector<Bnd_Box>> boxes;
    int rejected = 0;
    for (int i = 0; i < original.Size(); ++i) {
        int a,b; original(i).Indices(a,b);
        for (int index : {a,b})
            if (!boxes.count(index)) boxes[index] = sweepBoxes(myDS->Shape(index),padding,divisions);
        bool overlap = boxes[a].empty() || boxes[b].empty();
        for (const auto& x : boxes[a]) {
            for (const auto& y : boxes[b]) if (!x.IsOut(y)) { overlap = true; break; }
            if (overlap) break;
        }
        if (overlap) myLists(type).Append(original(i)); else ++rejected;
    }
    return rejected;
}
