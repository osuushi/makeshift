#include "delete-band.h"
#include "boundary-validation.h"
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>

namespace delete_band {
using boundary_move::require;
namespace {
TopoDS_Face disk(const TopoDS_Wire& wire) {
    BRepBuilderAPI_MakeFace face(wire, true);
    require(face.IsDone() && BRepCheck_Analyzer(face.Face()).IsValid(), "Transition loop is not a simple planar boundary");
    return face.Face();
}
bool contains(const TopoDS_Face& face, const TopoDS_Wire& wire) {
    for (TopExp_Explorer v(wire, TopAbs_VERTEX); v.More(); v.Next()) {
        BRepClass_FaceClassifier check(face, BRep_Tool::Pnt(TopoDS::Vertex(v.Current())), 1e-7);
        if (check.State() != TopAbs_IN) return false;
    }
    return true;
}
int outerLoop(const TopoDS_Wire& a, const TopoDS_Wire& b) {
    BRepExtrema_DistShapeShape distance(a, b);
    require(distance.IsDone() && distance.Value() > boundary_move::boundaryDistanceMm,
            "Transition boundaries cross or touch on the replacement plane");
    const auto fa = disk(a), fb = disk(b);
    const bool aOutside = contains(fa, b), bOutside = contains(fb, a);
    require(aOutside != bOutside, "Transition boundaries must nest on the replacement plane");
    return aOutside ? 0 : 1;
}
TopoDS_Face shelf(const Band& band, const boundary_move::Edit& edit) {
    const auto a = mappedWire(band.loops[0], edit), b = mappedWire(band.loops[1], edit);
    const int outer = outerLoop(a, b);
    const auto fa = disk(a), fb = disk(b);
    // MakeFace normalizes the outer wire direction; a hole has the opposite traversal.
    BRepBuilderAPI_MakeFace result(outer == 0 ? fa : fb);
    for (TopExp_Explorer w(outer == 0 ? fb : fa, TopAbs_WIRE); w.More(); w.Next())
        result.Add(TopoDS::Wire(w.Current().Reversed()));
    require(result.IsDone() && BRepCheck_Analyzer(result.Face()).IsValid(), "Cannot construct a planar transition shelf");
    return result.Face();
}
}
Result flattenBand(const Operand& body, const std::vector<SourceEntity>& selected) {
    const auto band = inspect(body, selected);
    int anchor = band.planes[0] ? 0 : 1;
    if (band.planes[0] && band.planes[1]) {
        // Determine nesting before rebuilding neighbors: the other candidate
        // plane may consume a wall even when the preferred outer plane is safe.
        const gp_Vec normal(band.planes[0]->Axis().Direction());
        const double distance = gp_Vec(band.planes[1]->Location(), band.planes[0]->Location()).Dot(normal);
        gp_Trsf translation;
        translation.SetTranslation(normal * distance);
        const auto projected = TopoDS::Wire(BRepBuilderAPI_Transform(band.loops[1], translation, true).Shape());
        anchor = outerLoop(band.loops[0], projected);
    }
    const auto edit = flatten(body, band, anchor);
    return rebuild(body, band, edit, shelf(band, edit));
}
}
