#pragma once
#include <optional>
#include <gp_Pnt.hxx>
#include <TopoDS_Wire.hxx>
TopoDS_Wire twistSectionParameters(const TopoDS_Wire&);
std::optional<gp_Pnt> twistCircleCenter(const TopoDS_Wire&);
TopoDS_Wire twistLoftSection(const TopoDS_Wire&);
