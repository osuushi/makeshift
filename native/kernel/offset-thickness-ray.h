#pragma once
#include <TopoDS_Face.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <memory>

// Exact candidate visibility for one immutable body's thickness presentation.
class OffsetThicknessRay {
    struct Data;
    std::unique_ptr<Data> data;
public:
    explicit OffsetThicknessRay(const TopoDS_Shape&);
    ~OffsetThicknessRay();
    bool reaches(const gp_Pnt&, const gp_Dir&, double distance, const TopoDS_Face& target);
};
