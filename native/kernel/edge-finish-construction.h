#pragma once
#include "kernel.h"
#include <TopoDS_Edge.hxx>
#include <set>

struct EdgeFinishSupports {
    Operand carrier;
    std::vector<TopoDS_Edge> edges;
    TopoDS_Shape interruptions;
    std::vector<SourceEntity> interruptionOrigins;
    std::set<std::string> seamIds;
};

std::optional<EdgeFinishSupports> edgeFinishSupports(const Operand&, const std::vector<TopoDS_Edge>&);
Result constructEdgeFinish(const Operand&, const std::vector<TopoDS_Edge>&, double, bool chamfer,
                           const std::vector<SourceEntity>& continuingBlends = {});

TopoDS_Shape trimEdgeFinish(const TopoDS_Shape&, const TopoDS_Shape&, std::vector<SourceEntity>&,
                            const std::set<std::string>&);

TopoDS_Shape partitionClosedFinishFaces(const TopoDS_Shape&, std::vector<SourceEntity>&, int cuts);

std::set<std::string> finishSeamIds(const TopoDS_Shape&, const std::vector<SourceEntity>&);

// Internal construction paths return unmeasured temporary geometry.
Result constructEdgeFinishOnSupports(const Operand&, const std::vector<TopoDS_Edge>&, double, bool,
                                     const std::vector<SourceEntity>&);
Result constructLocalEdgeFinish(const Operand&, const std::vector<TopoDS_Edge>&, double, bool,
                                const std::vector<SourceEntity>&);
