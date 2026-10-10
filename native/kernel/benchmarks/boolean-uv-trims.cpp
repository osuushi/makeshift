#include "boolean-uv-trims.h"
#include <BRepAdaptor_Curve2d.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BndLib_Add2dCurve.hxx>
#include <Precision.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp.hxx>
#include <gp_Pln.hxx>
#include <cmath>
#include <stdexcept>

boolean_uv::TrimRegion::TrimRegion(const TopoDS_Face& source)
    : face(TopoDS::Face(source.Oriented(TopAbs_FORWARD))) {
    try {
        for (TopExp_Explorer edges(face,TopAbs_EDGE); edges.More(); edges.Next()) {
            // Explorer retains both oriented occurrences of a seam edge.
            BRepAdaptor_Curve2d curve(TopoDS::Edge(edges.Current()),face);
            const auto type = curve.GetType();
            if (type == GeomAbs_OtherCurve || type == GeomAbs_OffsetCurve) return;
            const double first = curve.FirstParameter(), last = curve.LastParameter();
            if (!std::isfinite(first) || !std::isfinite(last)) return;
            for (int i = 0; i < 16; ++i) {
                Bnd_Box2d box;
                BndLib_Add2dCurve::Add(curve,first+(last-first)*i/16,
                    first+(last-first)*(i+1)/16,Precision::PConfusion()*10,box);
                if (box.IsVoid() || box.IsWhole()) return;
                boundaries.push_back(box);
            }
        }
        usable = !boundaries.empty();
    } catch (const Standard_Failure&) { usable = false; }
}
bool boolean_uv::TrimRegion::outside(const std::array<double,4>& uv) const {
    if (!usable) return false;
    Bnd_Box2d cell;
    cell.Add(gp_Pnt2d(uv[0],uv[2])); cell.Add(gp_Pnt2d(uv[1],uv[3]));
    cell.Enlarge(Precision::PConfusion()*10);
    for (const auto& boundary : boundaries) if (!cell.IsOut(boundary)) return false;
    try {
        // No boundary enters this connected rectangle: classify one interior point.
        const gp_Pnt2d center((uv[0]+uv[1])/2,(uv[2]+uv[3])/2);
        BRepClass_FaceClassifier classifier(face,center,Precision::PConfusion()*10);
        return classifier.State() == TopAbs_OUT;
    } catch (const Standard_Failure&) { return false; }
}
void boolean_uv::testTrimRegions() {
    const auto square = [](double x, double y, double size) {
        BRepBuilderAPI_MakePolygon polygon;
        polygon.Add(gp_Pnt(x,y,0)); polygon.Add(gp_Pnt(x+size,y,0));
        polygon.Add(gp_Pnt(x+size,y+size,0)); polygon.Add(gp_Pnt(x,y+size,0));
        polygon.Close(); return polygon.Wire();
    };
    const gp_Pln plane(gp::XOY());
    BRepBuilderAPI_MakeFace face(plane,square(-10,-10,20));
    face.Add(TopoDS::Wire(square(-3,-3,6).Reversed()));
    TrimRegion region(face.Face());
    if (!region.outside({-0.5,0.5,-0.5,0.5}))
        throw std::runtime_error("Trim hole interior was not excluded");
    if (region.outside({5,6,5,6}) || region.outside({2.9,3.1,-0.5,0.5}))
        throw std::runtime_error("Trim material or boundary cell was excluded");
    // A small material island misses the center and corners of this cell.
    TrimRegion island(BRepBuilderAPI_MakeFace(plane,square(0.2,0.2,0.01)).Face());
    if (island.outside({-1,1,-1,1}))
        throw std::runtime_error("Small trim island was incorrectly excluded");
}
