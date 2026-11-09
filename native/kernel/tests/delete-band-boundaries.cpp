#include "delete-band.h"
#include <boost/property_tree/json_parser.hpp>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace {
void check(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}
std::pair<Operand, std::vector<SourceEntity>> capture(const std::string& root, const std::string& name) {
    Tree json;
    boost::property_tree::read_json(root + "/delete-band-" + name + ".json", json);
    const auto& body = json.get_child("document.bodies").front().second;
    const auto hex = body.get<std::string>("brep");
    std::string bytes;
    for (size_t i = 0; i < hex.size(); i += 2) bytes += char(std::stoi(hex.substr(i, 2), nullptr, 16));
    Operand operand;
    BRep_Builder builder;
    std::istringstream stream(bytes);
    BRepTools::Read(operand.shape, stream, builder);
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(operand.shape, TopAbs_FACE, faces);
    int index = 1;
    for (const auto& f : body.get_child("faces"))
        operand.entities.push_back({f.second.get<std::string>("id"), faces(index++)});
    std::vector<SourceEntity> selected;
    for (const auto& id : json.get_child("faces"))
        for (const auto& face : operand.entities)
            if (face.id == id.second.get_value<std::string>()) selected.push_back(face);
    return {operand, selected};
}
void rejected(const Operand& body, const std::vector<SourceEntity>& faces, const std::string& reason) {
    bool refused = false;
    try { delete_band::inspect(body, faces); }
    catch (const std::runtime_error& error) {
        refused = true;
        check(std::string(error.what()).find(reason) != std::string::npos, "Unexpected transition refusal reason");
    }
    check(refused, "Unsafe transition classification was accepted");
}
void captured(const std::string& root) {
    for (const auto& name : {"cylinder", "rectangle", "nonplanar"}) {
        const auto [body, selected] = capture(root, name);
        const auto band = delete_band::inspect(body, selected);
        check(band.loops.size() == 2, "Expected two transition boundaries");
        const int planes = int(bool(band.planes[0])) + int(bool(band.planes[1]));
        check(planes == (std::string(name) == "nonplanar" ? 1 : 2), "Incorrect planar loop classification");
        if (selected.size() > 1) {
            // These subsets may succeed in rigorous defeaturing; they must never
            // qualify for the transition-band fallback itself.
            rejected(body, {selected[0]}, "annular");
            rejected(body, {selected[0], selected[1], selected[2]}, "annular");
        }
    }
    const auto [expected, selected] = capture(root, "expected");
    int shelves = 0;
    for (const auto& source : expected.entities) {
        BRepAdaptor_Surface support(TopoDS::Face(source.shape));
        if (support.GetType() == GeomAbs_Plane &&
            std::abs(support.Plane().Location().Z() - 15) < 1e-7) {
            rejected(expected, {source}, "coplanar");
            ++shelves;
        }
    }
    check(shelves == 1, "Expected one sharp reference shelf");
}
void obliqueRim() {
    const auto cylinder = BRepPrimAPI_MakeCylinder(5, 10).Shape();
    gp_Trsf rotation;
    rotation.SetRotation(gp_Ax1(gp_Pnt(0, 0, 5), gp_Dir(1, 0, 0)), 0.25);
    const auto tool = BRepBuilderAPI_Transform(
        BRepPrimAPI_MakeBox(gp_Pnt(-20, -20, 5), 40, 40, 20).Shape(), rotation, true).Shape();
    Operand body;
    body.shape = BRepAlgoAPI_Cut(cylinder, tool).Shape();
    std::vector<SourceEntity> selected;
    for (TopExp_Explorer f(body.shape, TopAbs_FACE); f.More(); f.Next())
        if (BRepAdaptor_Surface(TopoDS::Face(f.Current())).GetType() == GeomAbs_Cylinder)
            selected.push_back({"wall", f.Current()});
    check(selected.size() == 1, "Expected one obliquely trimmed wall");
    rejected(body, selected, "parallel");
}
}
int main(int argc, char** argv) {
    try {
        check(argc == 2, "Pass fixture directory");
        captured(argv[1]);
        obliqueRim();
        std::cout << "Transition boundaries: complete bands, incomplete selections, coplanar and oblique refusals passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
