#include "sweep-validation-cases.h"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepOffsetAPI_ThruSections.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Circ.hxx>
#include <gp_Trsf.hxx>
#include <sstream>

namespace {
TopoDS_Shape folded(bool ruled) {
    BRepOffsetAPI_ThruSections loft(true, ruled);
    for (const auto& point : {gp_Pnt(5,0,0), gp_Pnt(8,0,20), gp_Pnt(10,0,10)}) {
        const gp_Circ circle(gp_Ax2(gp_Pnt(0,0,point.Z()),gp_Dir(0,0,1)),point.X());
        loft.AddWire(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(circle)).Wire());
    }
    loft.Build(); return loft.Shape();
}
TopoDS_Shape crossing(double offset) {
    // Distinct overlapping boundaries exercise edge/face and face/face faults.
    BRep_Builder builder; TopoDS_Compound shape; builder.MakeCompound(shape);
    builder.Add(shape,BRepPrimAPI_MakeBox(10,10,10).Shape());
    builder.Add(shape,BRepPrimAPI_MakeBox(gp_Pnt(offset,3,4),10,10,10).Shape());
    return shape;
}
}
std::vector<ValidationCase> sweepValidationCases() {
    auto fold = folded(false);
    gp_Trsf location;
    location.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,2,3)),0.7);
    location.SetTranslationPart(gp_Vec(1e5,-2e5,3e5));
    return {
        {"box",BRepPrimAPI_MakeBox(10,10,10).Shape(),false},
        {"cylinder-seam",BRepPrimAPI_MakeCylinder(3,10).Shape(),false},
        {"torus-seams",BRepPrimAPI_MakeTorus(5,1).Shape(),false},
        {"folded-ruled",folded(true),true},
        {"folded-smooth",fold,true},
        {"located-fold",BRepBuilderAPI_Transform(fold,location,true).Shape(),true},
        {"crossing-boxes",crossing(5),true},
        {"near-separated-boxes",crossing(10+1e-4),false},
        {"touching-boxes",crossing(10),true},
        {"within-tolerance-boxes",crossing(10+5e-8),true},
    };
}
std::string serializedValidationShape(const TopoDS_Shape& shape) {
    std::ostringstream output; BRepTools::Write(shape,output); return output.str();
}
