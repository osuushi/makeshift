#include "microscopic-face-size.h"
#include <numbers>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRep_Builder.hxx>
#include <Geom_Circle.hxx>
#include <GeomConvert.hxx>
#include <ShapeAnalysis_CheckSmallFace.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Wire.hxx>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace {
constexpr double cutoff = .002;
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
TopoDS_Face polygon(const std::vector<gp_Pnt>& points) {
    BRepBuilderAPI_MakePolygon wire;
    for (const auto& point : points) wire.Add(point);
    wire.Close();
    return BRepBuilderAPI_MakeFace(wire.Wire()).Face();
}
TopoDS_Wire circle(double radius, const gp_Pnt& center = {}) {
    return BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(gp_Circ(gp_Ax2(center, gp::DZ()), radius))).Wire();
}
TopoDS_Face annulus(double radius, double inner, double eccentricity = 0) {
    BRepBuilderAPI_MakeFace face(circle(radius));
    face.Add(TopoDS::Wire(circle(inner, {eccentricity,0,0}).Reversed()));
    return face.Face();
}
TopoDS_Face placed(const TopoDS_Face& face, int placement) {
    gp_Trsf transform;
    if (placement == 1) {
        transform.SetRotation(gp_Ax1({}, gp_Dir(1,2,3)), .731);
        transform.SetTranslationPart(gp_Vec(137,-81,24));
    } else if (placement == 2) transform.SetTranslation(gp_Vec(1e8,-1e8,1e8));
    return TopoDS::Face(BRepBuilderAPI_Transform(face, transform, true).Shape());
}
void inspect(const TopoDS_Face& face) {
    require(BRepCheck_Analyzer(face).IsValid(), "Test face must be valid");
    require(faceSizeGate(face, cutoff) == FaceSizeGate::inspect, "Uncertain or narrow face escaped inspection");
}
void safe(const TopoDS_Face& face) {
    require(BRepCheck_Analyzer(face).IsValid(), "Test face must be valid");
    require(faceSizeGate(face, cutoff) == FaceSizeGate::safe, "Ordinary analytic face missed fast path");
    ShapeAnalysis_CheckSmallFace check;
    TopoDS_Edge a,b;
    require(!check.CheckSpotFace(face, cutoff) && !check.CheckStripFace(face,a,b,cutoff),
            "Fast certificate contradicted detailed inspection");
}
void analyticWidths() {
    for (const double width : {.0000005, .0001, .0011, .001999, .002}) {
        for (int position = 0; position < 3; ++position) {
            inspect(placed(polygon({{0,0,0},{10,0,0},{10,width,0},{0,width,0}}), position));
            inspect(placed(annulus(4,4-width), position));
            inspect(placed(annulus(4,2,2-width), position));
        }
    }
    for (int position = 0; position < 3; ++position) {
        safe(placed(polygon({{0,0,0},{10,0,0},{10,5,0},{0,5,0}}), position));
        safe(placed(BRepBuilderAPI_MakeFace(circle(4)).Face(), position));
        safe(placed(annulus(4,2,.5), position));
    }
    // Radius subtraction at large scales must include radius/center rounding,
    // even when the sole seam vertex happens to be close to the world origin.
    inspect(annulus(10000, 10000-.0011));
    for (const double height : {.0011, 10.0}) {
        const auto cylinder = BRepPrimAPI_MakeCylinder(4,height).Shape();
        for (TopExp_Explorer f(cylinder, TopAbs_FACE); f.More(); f.Next()) {
            const auto face = TopoDS::Face(f.Current());
            if (BRepAdaptor_Surface(face).GetType() != GeomAbs_Cylinder) continue;
            for (int position = 0; position < 3; ++position)
                if (height < cutoff) inspect(placed(face,position)); else safe(placed(face,position));
        }
    }
}
void uncertainBoundaries() {
    // A large bounding box and area cannot clear a small neck.
    inspect(polygon({{-5,-5,0},{5,-5,0},{.0002,0,0},{5,5,0},{-5,5,0},{-.0002,0,0}}));
    BRepBuilderAPI_MakeFace holed(polygon({{-5,-5,0},{5,-5,0},{5,5,0},{-5,5,0}}));
    holed.Add(TopoDS::Wire(circle(1).Reversed()));
    inspect(holed.Face());
    const Handle(Geom_Circle) analytic = new Geom_Circle(gp_Ax2({}, gp::DZ()),4);
    const auto spline = GeomConvert::CurveToBSplineCurve(analytic);
    const auto curved = BRepBuilderAPI_MakeFace(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(spline))).Face();
    inspect(curved); // Even a geometrically circular spline is not an analytic certificate.
    auto uncertain = polygon({{0,0,0},{.003,0,0},{.003,5,0},{0,5,0}});
    BRep_Builder().UpdateFace(uncertain,.001);
    inspect(uncertain);
    require(faceSizeGate(uncertain,0) == FaceSizeGate::inspect, "Invalid policy must defer");
}
void screenAgreement() {
    int certified = 0, deferred = 0;
    for (const double radius : {.0005, .0015, .004, .01, 1.0, 1000.0}) {
        for (int placement = 0; placement < 2; ++placement) {
            std::vector<TopoDS_Face> faces{BRepBuilderAPI_MakeFace(circle(radius)).Face()};
            for (const double ratio : {.0001, .01, .2, .5})
                faces.push_back(annulus(radius, radius*(1-ratio)));
            for (const auto& source : faces) {
                const auto face = placed(source,placement);
                if (faceSizeGate(face,cutoff) == FaceSizeGate::safe) { safe(face); ++certified; }
                else ++deferred;
            }
        }
    }
    require(certified > 0 && deferred > 0, "Screen corpus must exercise both paths");
    inspect(BRepBuilderAPI_MakeFace(circle(.0015)).Face());
}
void timings() {
    const std::vector<TopoDS_Face> faces{
        polygon({{0,0,0},{10,0,0},{10,5,0},{0,5,0}}),
        annulus(4,2), BRepBuilderAPI_MakeFace(circle(4)).Face()};
    int checks = 0;
    auto start = std::chrono::steady_clock::now();
    for (int i=0;i<10000;++i) for (const auto& face : faces)
        checks += faceSizeGate(face,cutoff) == FaceSizeGate::safe;
    const auto fast = std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
    start = std::chrono::steady_clock::now();
    ShapeAnalysis_CheckSmallFace check;
    for (int i=0;i<10000;++i) for (const auto& face : faces) {
        TopoDS_Edge a,b;
        checks += !check.CheckSpotFace(face,cutoff) && !check.CheckStripFace(face,a,b,cutoff);
    }
    const auto detailed = std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
    require(checks == 60000, "Benchmark classification mismatch");
    std::cout << "30000 ordinary faces: broad phase " << fast << " ms; detailed " << detailed << " ms\n";
}
}
int main() { analyticWidths(); uncertainBoundaries(); screenAgreement(); timings(); }
