#pragma once
#include <TopoDS_Shape.hxx>
#include <string>
#include <vector>
struct ValidationCase {
    std::string name;
    TopoDS_Shape shape;
    bool faulty;
};
std::vector<ValidationCase> sweepValidationCases();
std::string serializedValidationShape(const TopoDS_Shape& shape);
