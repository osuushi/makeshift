#pragma once
#include <Bnd_Box.hxx>
#include <TopoDS_Shape.hxx>
#include <functional>

enum class IntersectionPolicy { offset, finish };
void validateEditIntersections(const TopoDS_Shape&, const Bnd_Box& focus, IntersectionPolicy,
                               const std::function<void(const TopoDS_Shape&)>& fullCheck);
