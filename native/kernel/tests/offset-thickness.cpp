#include "offset-thickness.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <gp_Pln.hxx>
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
}
int main() {
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
