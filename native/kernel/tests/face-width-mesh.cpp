#include "face-width-mesh.h"
#include "microscopic-face-width.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <GeomConvert.hxx>
#include <Geom_Circle.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Ax2.hxx>
#include <gp_Circ.hxx>
#include <iostream>
#include <numbers>
#include <stdexcept>

using face_width::Class;
void require(bool value, const char *message) {
    if (!value)
        throw std::runtime_error(message);
}
face_width::Mesh rectangle(double length, double width) {
    const gp_Pnt a(0, 0, 0), b(length, 0, 0), c(length, width, 0), d(0, width, 0);
    return {{{a, b, c}, {a, c, d}}, {{a, b}, {b, c}, {c, d}, {d, a}}};
}
TopoDS_Wire circle(double radius, const gp_Pnt &center = {}) {
    return BRepBuilderAPI_MakeWire(
               BRepBuilderAPI_MakeEdge(gp_Circ(gp_Ax2(center, gp::DZ()), radius)))
        .Wire();
}
void meshInteriors() {
    for (double width : {.0002, .0005, .0009, .0011, .01, 5.0}) {
        const auto mesh = rectangle(10, width);
        require(face_width::classify(mesh, .001) == (width < .001 ? Class::thin : Class::wide),
                "Rectangle interior width mismatch");
    }
    // Every original triangle vertex is on the perimeter: vertex-only sampling
    // would misclassify this wide square. Internal diagonal is not a perimeter.
    require(face_width::classify(rectangle(10, 10), .001) == Class::wide,
            "Triangle interiors were missed");
    require(face_width::classify(rectangle(10, .0009), .001, 0) == Class::uncertain,
            "Exhausted work must not mean safe");
    for (double width : {.0005, .01}) {
        auto mesh = rectangle(10, width);
        gp_Trsf placement;
        placement.SetRotation(gp_Ax1({}, gp_Dir(1, 2, 3)), .73);
        placement.SetTranslationPart(gp_Vec(10000, -20000, 30000));
        for (auto &triangle : mesh.triangles)
            for (auto &p : triangle)
                p.Transform(placement);
        for (auto &edge : mesh.perimeter)
            for (auto &p : edge)
                p.Transform(placement);
        require(face_width::classify(mesh, .001) == (width < .001 ? Class::thin : Class::wide),
                "Width must not depend on placement");
    }
}
void trimmedFaces() {
    // A periodic seam is bookkeeping, not an extra perimeter through the face.
    const auto cylinder = BRepPrimAPI_MakeCylinder(4, .0005).Shape();
    for (TopExp_Explorer f(cylinder, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        if (BRepAdaptor_Surface(face).GetType() == GeomAbs_Cylinder)
            require(microscopicFaceWidth(face, .001) == FaceWidth::thin,
                    "Periodic wall width must use both physical rims");
    }
    const auto disk = BRepBuilderAPI_MakeFace(circle(4)).Face();
    require(microscopicFaceWidth(disk, .001) == FaceWidth::healthy, "Disk is healthy");
    for (double width : {.0005, .0011, .01}) {
        BRepBuilderAPI_MakeFace ring(circle(4));
        ring.Add(TopoDS::Wire(circle(4 - width).Reversed()));
        const auto expected = width < .001   ? FaceWidth::thin
                              : width < .002 ? FaceWidth::candidate
                                             : FaceWidth::healthy;
        const auto actual = microscopicFaceWidth(ring.Face(), .001);
        std::cout << "ring " << width << " class " << static_cast<int>(actual) << std::endl;
        require(actual == expected, "Ring whole-face width mismatch");
    }
    BRepBuilderAPI_MakePolygon wire;
    for (const auto &p : {gp_Pnt(-5, -5, 0), gp_Pnt(5, -5, 0), gp_Pnt(5, 5, 0), gp_Pnt(-5, 5, 0)})
        wire.Add(p);
    wire.Close();
    BRepBuilderAPI_MakeFace holes(wire.Wire());
    holes.Add(TopoDS::Wire(circle(1, {-2, 0, 0}).Reversed()));
    holes.Add(TopoDS::Wire(circle(1, {.0005, 0, 0}).Reversed()));
    require(microscopicFaceWidth(holes.Face(), .001) == FaceWidth::healthy,
            "A narrow gap between holes does not make the whole face thin");
    // Differently represented perimeters: four analytic outer arcs and one
    // rational B-spline inner loop still describe the same thin band.
    BRepBuilderAPI_MakeWire segments;
    const gp_Circ outer(gp_Ax2({}, gp::DZ()), 4);
    for (int i = 0; i < 4; ++i)
        segments.Add(BRepBuilderAPI_MakeEdge(outer, i * std::numbers::pi / 2,
                                             (i + 1) * std::numbers::pi / 2));
    const auto spline =
        GeomConvert::CurveToBSplineCurve(new Geom_Circle(gp_Ax2({}, gp::DZ()), 3.9995));
    BRepBuilderAPI_MakeFace mixed(segments.Wire());
    mixed.Add(
        TopoDS::Wire(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(spline)).Wire().Reversed()));
    require(microscopicFaceWidth(mixed.Face(), .001) == FaceWidth::thin,
            "Different perimeter representations must not change classification");
    const auto rectangleWire = [](double x0, double y0, double x1, double y1) {
        BRepBuilderAPI_MakePolygon p;
        p.Add({x0, y0, 0});
        p.Add({x1, y0, 0});
        p.Add({x1, y1, 0});
        p.Add({x0, y1, 0});
        p.Close();
        return p.Wire();
    };
    BRepBuilderAPI_MakeFace network(rectangleWire(0, 0, 1, .004));
    network.Add(TopoDS::Wire(rectangleWire(.0002, .0002, .4999, .0038).Reversed()));
    network.Add(TopoDS::Wire(rectangleWire(.5001, .0002, .9998, .0038).Reversed()));
    require(microscopicFaceWidth(network.Face(), .001) == FaceWidth::thin,
            "Three-perimeter thin network must be detected");
}
int main() {
    meshInteriors();
    trimmedFaces();
    std::cout << "mesh width tests passed\n";
}
