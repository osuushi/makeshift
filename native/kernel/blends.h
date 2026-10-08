#pragma once
#include "kernel.h"
struct BlendFace {
    TopoDS_Face face;
    double radius;
    int outward;
    std::vector<TopoDS_Face> supports;
    double distanceScale = 1;
};
std::vector<BlendFace> recognizeBlends(const TopoDS_Shape&);
std::vector<BlendFace> recognizeChamfers(const TopoDS_Shape&);
std::vector<Result> resizeBlends(const Tree&, const std::vector<Operand>&, std::vector<std::string>&);
std::optional<Result> collapseOffsetFinish(const Operand&, const std::vector<TopoDS_Face>&, double);
std::vector<TopoDS_Face> blendGroup(const std::vector<BlendFace>&, const std::vector<TopoDS_Face>&);
