#include "microscopic-patch-surface.h"
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRep_Tool.hxx>
#include <Geom_BSplineSurface.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Ax1.hxx>
#include <iostream>
#include <stdexcept>

namespace {
void require(bool value, const char* message) {
    if (!value)
        throw std::runtime_error(message);
}
Handle(Geom_BSplineSurface) patch(bool thin) {
    TColgp_Array2OfPnt poles(1, 4, 1, 4);
    for (int u = 1; u <= 4; ++u)
        for (int v = 1; v <= 4; ++v) {
            const double bulge = !thin && u > 1 && u < 4 && v > 1 && v < 4 ? .3 : 0;
            poles(u, v) = {double(u - 1) / 3, thin ? 1 + .0005 * (v - 1) / 3 : double(v - 1) / 3,
                           bulge};
        }
    TColStd_Array1OfReal knots(1, 2);
    knots(1) = 0;
    knots(2) = 1;
    TColStd_Array1OfInteger mult(1, 2);
    mult.Init(4);
    return new Geom_BSplineSurface(poles, knots, knots, mult, mult, 3, 3);
}
void preserved(bool exchanged) {
    const auto a = patch(false), b = patch(true);
    a->InsertUKnot(.6, 1, 1e-12);
    b->IncreaseDegree(5, 4);
    b->InsertUKnot(.3, 2, 1e-12);
    if (exchanged) {
        gp_Trsf placement;
        placement.SetRotation(gp_Ax1({}, gp_Dir(1, 2, 3)), .7);
        placement.SetTranslationPart(gp_Vec(130, -81, 24));
        a->Transform(placement);
        b->Transform(placement);
        b->ExchangeUV();
    }
    auto fa = BRepBuilderAPI_MakeFace(a, 1e-7).Face();
    auto fb = BRepBuilderAPI_MakeFace(b, 1e-7).Face();
    if (exchanged)
        fb.Reverse();
    BRepBuilderAPI_Sewing sew(1e-7);
    sew.Add(fa);
    sew.Add(fb);
    sew.Perform();
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(sew.SewedShape(), TopAbs_FACE, faces);
    require(faces.Extent() == 2, "Two patches must remain before joining");
    fa = TopoDS::Face(faces(1));
    fb = TopoDS::Face(faces(2));
    TopoDS_Edge shared;
    for (TopExp_Explorer x(fa, TopAbs_EDGE); x.More(); x.Next())
        for (TopExp_Explorer y(fb, TopAbs_EDGE); y.More(); y.Next())
            if (x.Current().IsSame(y.Current()))
                shared = TopoDS::Edge(x.Current());
    require(!shared.IsNull(), "Patches need a shared edge");
    const auto joined = joinMicroscopicPatchSurfaces(fa, fb, shared);
    const auto result = BRep_Tool::Surface(joined);
    // A perimeter-only refit would flatten the large patch's interior bulge.
    // Degree elevation, knot insertion and UV exchange must preserve it.
    for (int i = 0; i <= 12; ++i)
        for (int j = 0; j <= 12; ++j) {
            const double u = double(i) / 12, v = double(j) / 12;
            require(result->Value(u, v).Distance(a->Value(u, v)) < 1e-10,
                    "Large patch interior changed");
            const auto expected = exchanged ? b->Value(v, u) : b->Value(u, v);
            require(result->Value(u, 1 + v).Distance(expected) < 1e-10,
                    "Small patch interior changed");
        }
}
} // namespace
int main() {
    preserved(false);
    preserved(true);
    std::cout << "Spline patch concatenation preserves complete interiors\n";
}
