#include "offset-thickness.h"
#include "offset-thickness-ray.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <gp_Pln.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Sphere.hxx>
#include <gp_Lin.hxx>
#include <IntCurvesFace_ShapeIntersector.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRep_Builder.hxx>
#include <TopExp.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopLoc_Location.hxx>
#include <gp_Trsf.hxx>
#include <sstream>
#include <stdexcept>
#include <iostream>
#include <vector>
#include <utility>
#include <cmath>

namespace {
TopoDS_Face wall(double radius, double z = 0, double x = 0) {
    const auto solid = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, 0, z), gp_Dir(0, 0, 1)), radius, 10).Shape();
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    for (int i = 1; i <= faces.Extent(); ++i)
        if (BRepAdaptor_Surface(TopoDS::Face(faces(i))).GetType() == GeomAbs_Cylinder) return TopoDS::Face(faces(i));
    throw std::runtime_error("Missing cylindrical face");
}
std::string measure(const std::vector<TopoDS_Face>& walls) {
    BRep_Builder builder;
    TopoDS_Compound body;
    builder.MakeCompound(body);
    for (const auto& face : walls) builder.Add(body, face);
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(body, TopAbs_FACE, faces);
    std::ostringstream output;
    presentOffsetThickness(output, walls.front(), faces, body);
    return output.str();
}
void expect(const std::string& value, const std::string& expected) {
    if (value != ",\"thickness\":" + expected) throw std::runtime_error(value);
}
void expectShared(const std::vector<TopoDS_Face>& walls,
                  const std::vector<std::pair<TopoDS_Face, std::string>>& queries) {
    BRep_Builder builder;
    TopoDS_Compound body;
    builder.MakeCompound(body);
    for (const auto& face : walls) builder.Add(body, face);
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(body, TopAbs_FACE, faces);
    OffsetThicknessContext context(body);
    for (const auto& [face, expected] : queries) {
        std::ostringstream output;
        presentOffsetThickness(output, face, faces, context);
        expect(output.str(), expected);
    }
}
void sectors() {
    const gp_Ax3 frame(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1));
    const double pi = std::acos(-1.0);
    for (const bool spherical : {false, true}) {
        const auto patch = [&](double radius, double first, double last) {
            return spherical
                ? BRepBuilderAPI_MakeFace(gp_Sphere(frame, radius), first, last, -0.3, 0.3).Face()
                : BRepBuilderAPI_MakeFace(gp_Cylinder(frame, radius), first, last, -3, 3).Face();
        };
        const auto source = patch(40, -0.1, 0.1), opposite = patch(20, pi - 0.1, pi + 0.1);
        const auto target = patch(20, -0.1, 0.1);
        expect(measure({source, opposite}), "null");
        expect(measure({source, opposite, target}), "{\"faceIndex\":2,\"distance\":20,\"slope\":1}");
        OffsetThicknessContext context(source);
        if (context.classify(source, gp_Pnt(40, 0, 0)) != TopAbs_IN ||
            context.classify(source, gp_Pnt(-40, 0, 0)) != TopAbs_OUT ||
            context.classify(source, gp_Pnt(41, 0, 0)) != TopAbs_OUT)
            throw std::runtime_error("Analytic classification accepted a distant projected point");
        const auto seam = patch(20, 2 * pi - 0.1, 2 * pi + 0.1);
        expect(measure({source, seam}), "{\"faceIndex\":1,\"distance\":20,\"slope\":1}");
        gp_Trsf move;
        move.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(1, 2, 3)), 0.7);
        move.SetTranslationPart(gp_Vec(17, -23, 31));
        expect(measure({TopoDS::Face(source.Moved(TopLoc_Location(move))),
                        TopoDS::Face(seam.Moved(TopLoc_Location(move)))}),
               "{\"faceIndex\":1,\"distance\":20,\"slope\":1}");
    }
}
bool referenceReach(IntCurvesFace_ShapeIntersector& ray, const gp_Pnt& point,
                    const gp_Dir& direction, double distance, const TopoDS_Face& target) {
    constexpr double tolerance = 1e-7;
    ray.Perform(gp_Lin(point, direction), 10 * tolerance, distance + tolerance);
    if (!ray.IsDone()) return false;
    double first = distance + 2 * tolerance;
    bool hit = false;
    for (int i = 1; i <= ray.NbPnt(); ++i) {
        const double position = ray.WParameter(i);
        if (position < first - tolerance) {
            first = position;
            hit = ray.Face(i).IsSame(target);
        } else if (std::abs(position - first) <= tolerance && !ray.Face(i).IsSame(target)) hit = false;
    }
    return hit && std::abs(first - distance) < tolerance;
}
void rayAgreement() {
    BRep_Builder builder;
    TopoDS_Compound body;
    builder.MakeCompound(body);
    builder.Add(body, BRepPrimAPI_MakeBox(10, 10, 10).Shape());
    builder.Add(body, BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(5, 5, 2), gp_Dir(0, 0, 1)), 2, 6).Shape());
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(body, TopAbs_FACE, faces);
    OffsetThicknessRay fast(body);
    IntCurvesFace_ShapeIntersector reference;
    reference.Load(body, 1e-7);
    // Repeat queries in both distance orders so cached obstructions cannot hide
    // a nearer valid target. Include edge ties, cylinder seams and inside starts.
    for (const double z : {-2.0, 0.0, 3.0}) for (const double x : {0.0, 2.0, 3.0, 5.0, 7.0, 10.0})
        for (const double y : {0.0, 3.0, 5.0, 7.0, 10.0})
            for (const double distance : {12.0, 10.0, 8.0, 7.0, 5.0, 2.0, 8.0, 10.0, 12.0})
                for (int i = 1; i <= faces.Extent(); ++i) {
                    const auto target = TopoDS::Face(faces(i));
                    const gp_Pnt point(x, y, z);
                    const gp_Dir direction(0, 0, 1);
                    if (fast.reaches(point, direction, distance, target) !=
                        referenceReach(reference, point, direction, distance, target))
                        throw std::runtime_error("Targeted visibility differs from all-face intersections");
                }
}
}
int main() {
    sectors();
    rayAgreement();
    expect(measure({wall(3), wall(8), wall(5)}), "{\"faceIndex\":2,\"distance\":2,\"slope\":-1}");
    expect(measure({wall(8), wall(3), wall(5)}), "{\"faceIndex\":2,\"distance\":3,\"slope\":1}");
    expect(measure({wall(3), wall(8, 20)}), "null");
    expect(measure({wall(3), wall(8), wall(5, 0, 0.2)}), "null");
    // A nearer concentric support without trimmed overlap must not hide a valid one.
    expect(measure({wall(3), wall(5, 20), wall(8)}), "{\"faceIndex\":2,\"distance\":5,\"slope\":-1}");
    const auto plane = [](double z, double x = 0) {
        return BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(x, 0, z), gp_Dir(0, 0, 1)), -5, 5, -5, 5).Face();
    };
    expect(measure({plane(0), plane(4), plane(8)}), "{\"faceIndex\":1,\"distance\":4,\"slope\":-1}");
    expect(measure({plane(8), plane(0), plane(4)}), "{\"faceIndex\":2,\"distance\":4,\"slope\":1}");
    expect(measure({plane(0), plane(4, 20)}), "null");
    expect(measure({plane(0), plane(2, 20), plane(4)}), "{\"faceIndex\":2,\"distance\":4,\"slope\":-1}");
    const auto tiny = BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(4.9, 4.9, 2), gp_Dir(0, 0, 1)), -0.01, 0.01, -0.01, 0.01).Face();
    expect(measure({plane(0), plane(4), tiny}), "{\"faceIndex\":2,\"distance\":2,\"slope\":-1}");
    // The tiny reference requires reverse sampling. Querying it next must use
    // its original position, unaffected by the previous projection onto stock.
    const auto stock = plane(0), cap = plane(4);
    expectShared({stock, cap, tiny}, {
        {stock, "{\"faceIndex\":2,\"distance\":2,\"slope\":-1}"},
        {tiny, "{\"faceIndex\":0,\"distance\":2,\"slope\":1}"},
        {stock, "{\"faceIndex\":2,\"distance\":2,\"slope\":-1}"},
    });
    // Located instances share support topology but occupy different world planes.
    // Switching source sides and orientation must preserve distance and sign.
    gp_Trsf middleMove, topMove;
    middleMove.SetTranslation(gp_Vec(0, 0, 4));
    topMove.SetTranslation(gp_Vec(0, 0, 8));
    const auto middle = TopoDS::Face(stock.Moved(TopLoc_Location(middleMove)));
    const auto top = TopoDS::Face(stock.Moved(TopLoc_Location(topMove)));
    expectShared({stock, middle, top}, {
        {stock, "{\"faceIndex\":1,\"distance\":4,\"slope\":-1}"},
        {top, "{\"faceIndex\":1,\"distance\":4,\"slope\":1}"},
        {TopoDS::Face(top.Reversed()), "{\"faceIndex\":1,\"distance\":4,\"slope\":-1}"},
        {top, "{\"faceIndex\":1,\"distance\":4,\"slope\":1}"},
    });
    std::cout << "Nearest, trimmed overlap and obstructed radial thickness checks passed\n";
}
