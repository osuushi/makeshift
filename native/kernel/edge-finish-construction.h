#pragma once
#include "kernel.h"
#include <TopoDS_Edge.hxx>

struct EdgeFinishSupports {
    Operand carrier;
    std::vector<TopoDS_Edge> edges;
    TopoDS_Shape interruptions;
    std::vector<SourceEntity> interruptionOrigins;
};

std::optional<EdgeFinishSupports> edgeFinishSupports(const Operand&, const std::vector<TopoDS_Edge>&);
Result constructEdgeFinish(const Operand&, const std::vector<TopoDS_Edge>&, double, bool chamfer,
                           const std::vector<SourceEntity>& continuingBlends = {});

TopoDS_Shape trimEdgeFinish(const TopoDS_Shape&, const TopoDS_Shape&, std::vector<SourceEntity>&);
