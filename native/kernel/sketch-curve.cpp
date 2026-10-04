#include "sketch-curve.h"
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_Circle.hxx>
#include <Geom_Line.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <stdexcept>

Handle(Geom_Curve) sketchCurve(const Tree& c) {
    const auto kind = c.get<std::string>("kind");
    if (kind == "circle") {
        const auto n = point(c.get_child("normal")), x = point(c.get_child("axis"));
        return new Geom_Circle(gp_Ax2(point(c.get_child("center")), gp_Dir(n.XYZ()), gp_Dir(x.XYZ())), c.get<double>("radius"));
    }
    if (kind != "line" && kind != "arc" && kind != "bezier")
        throw std::runtime_error("Unknown sketch curve kind");
    const auto a = point(c.get_child("a")), b = point(c.get_child("b"));
    if (kind == "line") return new Geom_TrimmedCurve(new Geom_Line(a, gp_Dir(gp_Vec(a,b))), 0, a.Distance(b));
    if (kind == "arc") {
        GC_MakeArcOfCircle arc(a, point(c.get_child("mid")), b);
        if (!arc.IsDone()) throw std::runtime_error("Cannot construct circular sketch span");
        return Handle(Geom_Curve)(arc.Value());
    }
    TColgp_Array1OfPnt poles(1,4); poles(1)=a; poles(2)=point(c.get_child("c1")); poles(3)=point(c.get_child("c2")); poles(4)=b;
    return new Geom_BezierCurve(poles);
}
