#include "kernel.h"
#include <BRep_Tool.hxx>
#include <Interface_CheckIterator.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <STEPControl_Reader.hxx>
#include <XSControl_WorkSession.hxx>
#include <XSControl_TransferReader.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Iterator.hxx>
#include <sstream>
#include <stdexcept>

namespace {
void collect(const TopoDS_Shape& shape, std::vector<Result>& results) {
    if (shape.IsNull()) throw std::runtime_error("STEP contains empty geometry");
    if (shape.ShapeType() == TopAbs_COMPOUND || shape.ShapeType() == TopAbs_COMPSOLID) {
        TopoDS_Iterator child(shape);
        if (!child.More()) throw std::runtime_error("STEP contains an empty component");
        for (; child.More(); child.Next()) collect(child.Value(), results);
        return;
    }
    if (shape.ShapeType() != TopAbs_SOLID)
        throw std::runtime_error("STEP import requires solid bodies; open surfaces and curves are not supported");
    for (TopExp_Explorer face(shape, TopAbs_FACE); face.More(); face.Next())
        if (BRep_Tool::Surface(TopoDS::Face(face.Current())).IsNull())
            throw std::runtime_error("STEP import requires exact geometry; tessellated bodies are not supported");
    const auto before = results.size();
    solids(results, shape, {}, {});
    if (results.size() == before)
        throw std::runtime_error("STEP contains a solid with no usable volume");
}
}

std::vector<Result> importStep(const Tree& input) {
    const auto data = input.get<std::string>("step");
    if (data.empty() || data.size() > 25 * 1024 * 1024)
        throw std::runtime_error("Choose a nonempty STEP file smaller than 25 MB");
    Message::DefaultMessenger()->ChangePrinters().Clear();
    STEPControl_Reader reader;
    std::istringstream stream(data);
    if (reader.ReadStream("import.step", stream) != IFSelect_RetDone)
        throw std::runtime_error("Could not read STEP geometry");
    if (!reader.WS()->ModelCheckList().IsEmpty(true))
        throw std::runtime_error("STEP contains invalid or incomplete entity data");
    reader.SetSystemLengthUnit(1.0);
    const int roots = reader.NbRootsForTransfer();
    if (roots < 1) throw std::runtime_error("STEP contains no transferable geometry");
    for (int i = 1; i <= roots; ++i) {
        if (!reader.TransferRoot(i) || !reader.WS()->TransferReader()->LastCheckList().IsEmpty(true))
            throw std::runtime_error("Could not transfer all STEP geometry");
    }
    std::vector<Result> results;
    for (int i = 1; i <= reader.NbShapes(); ++i) collect(reader.Shape(i), results);
    if (results.empty()) throw std::runtime_error("STEP contains no solid bodies");
    return results;
}
