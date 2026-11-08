// Synthetic tube with a stepped periodic seam; no captured user geometry.
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepLib.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <Geom2d_Line.hxx>
#include <Geom_Circle.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <TopExp.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pln.hxx>
#include <gp_Circ.hxx>
#include <cmath>
#include <iostream>
#include <iomanip>
#include <numbers>
#include <sstream>

void writeBody(const TopoDS_Shape& solid) {
    std::ostringstream stream;
    BRepTools::Write(solid, stream, false, false, TopTools_FormatVersion_CURRENT);
    std::cout << std::setprecision(17) << "{\"id\":\"segmented-seam-tube\",\"brep\":\"";
    for (const unsigned char byte : stream.str())
        std::cout << "0123456789abcdef"[byte >> 4] << "0123456789abcdef"[byte & 15];
    std::cout << '"';
    for (const auto type : {TopAbs_FACE, TopAbs_EDGE}) {
        const bool face = type == TopAbs_FACE;
        std::cout << (face ? ",\"faces\":[" : ",\"edges\":[");
        TopTools_IndexedMapOfShape shapes;
        TopExp::MapShapes(solid, type, shapes);
        for (int i = 1; i <= shapes.Extent(); ++i) {
            if (i > 1) std::cout << ',';
            const auto shape = shapes(i);
            GProp_GProps props;
            if (face) BRepGProp::SurfaceProperties(shape, props);
            else BRepGProp::LinearProperties(shape, props);
            const int support = face ? int(BRepAdaptor_Surface(TopoDS::Face(shape)).GetType())
                : int(BRepAdaptor_Curve(TopoDS::Edge(shape)).GetType());
            const auto center = props.CentreOfMass();
            std::cout << "{\"id\":\"" << (face ? 'f' : 'e') << i << "\",\"signature\":["
                      << support << ',' << int(shape.Orientation()) << ',' << props.Mass() << ','
                      << center.X() << ',' << center.Y() << ',' << center.Z() << "]}";
        }
        std::cout << ']';
    }
    std::cout << "}\n";
}

int main() {
    constexpr double radius = 5, height = 12, step = 4, angle = 0.4;
    constexpr double period = 2 * std::numbers::pi;
    const auto point = [](double u, double z) {
        return gp_Pnt(radius * std::cos(u), radius * std::sin(u), z);
    };
    const auto a = BRepBuilderAPI_MakeVertex(point(0, 0)).Vertex();
    const auto b = BRepBuilderAPI_MakeVertex(point(0, step)).Vertex();
    const auto c = BRepBuilderAPI_MakeVertex(point(angle, step)).Vertex();
    const auto d = BRepBuilderAPI_MakeVertex(point(angle, height)).Vertex();
    const auto circle = [](double z) {
        return Handle(Geom_Circle)(new Geom_Circle(gp_Ax2(gp_Pnt(0, 0, z), gp::DZ()), radius));
    };
    const auto bottom = BRepBuilderAPI_MakeEdge(circle(0), a, a, 0, period).Edge();
    const auto top = BRepBuilderAPI_MakeEdge(circle(height), d, d, angle, angle + period).Edge();
    const auto lower = BRepBuilderAPI_MakeEdge(a, b).Edge();
    const auto middle = BRepBuilderAPI_MakeEdge(circle(step), b, c, 0, angle).Edge();
    const auto upper = BRepBuilderAPI_MakeEdge(c, d).Edge();
    BRep_Builder builder;
    TopoDS_Face bore;
    builder.MakeFace(bore, new Geom_CylindricalSurface(gp_Ax3(), radius), 1e-7);
    const auto horizontal = [](double u, double z) {
        return Handle(Geom2d_Curve)(new Geom2d_Line(gp_Pnt2d(u, z), gp_Dir2d(1, 0)));
    };
    const auto vertical = [](double u, double z) {
        return Handle(Geom2d_Curve)(new Geom2d_Line(gp_Pnt2d(u, z), gp_Dir2d(0, 1)));
    };
    builder.UpdateEdge(bottom, horizontal(0, 0), bore, 1e-7);
    builder.UpdateEdge(top, horizontal(0, height), bore, 1e-7);
    builder.UpdateEdge(lower, vertical(period, 0), vertical(0, 0), bore, 1e-7);
    builder.UpdateEdge(middle, horizontal(period, step), horizontal(0, step), bore, 1e-7);
    builder.UpdateEdge(upper, vertical(period + angle, step), vertical(angle, step), bore, 1e-7);
    TopoDS_Wire wire;
    builder.MakeWire(wire);
    for (const auto& edge : {bottom, lower, middle, upper,
                            TopoDS::Edge(top.Reversed()), TopoDS::Edge(upper.Reversed()),
                            TopoDS::Edge(middle.Reversed()), TopoDS::Edge(lower.Reversed())})
        builder.Add(wire, edge);
    builder.Add(bore, wire);
    BRepLib::SameParameter(bore, 1e-7, true);
    if (!BRepCheck_Analyzer(bore).IsValid()) return 1;

    BRepBuilderAPI_Sewing sewing(1e-7);
    sewing.Add(bore.Reversed());
    for (TopExp_Explorer it(BRepPrimAPI_MakeCylinder(10, height).Shape(), TopAbs_FACE);
         it.More(); it.Next()) {
        const auto face = TopoDS::Face(it.Current());
        if (BRep_Tool::Surface(face)->IsKind(STANDARD_TYPE(Geom_CylindricalSurface))) sewing.Add(face);
    }
    for (const double z : {0.0, height}) {
        const auto outer = BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(
            gp_Circ(gp_Ax2(gp_Pnt(0, 0, z), gp::DZ()), 10)).Edge()).Wire();
        const auto inner = BRepBuilderAPI_MakeWire(
            TopoDS::Edge((z == 0 ? bottom : top).Reversed())).Wire();
        BRepBuilderAPI_MakeFace cap(gp_Pln(gp_Pnt(0, 0, z), gp::DZ()), outer);
        cap.Add(inner);
        auto face = cap.Face();
        if (z == 0) face.Reverse();
        sewing.Add(face);
    }
    sewing.Perform();
    if (sewing.SewedShape().ShapeType() != TopAbs_SHELL) return 2;
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(sewing.SewedShape())).Solid();
    if (!BRepLib::OrientClosedSolid(solid) || !BRepCheck_Analyzer(solid).IsValid()) return 3;
    writeBody(solid);
}
