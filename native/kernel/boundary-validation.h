#pragma once
#include "geometry-policy.h"
// Validity checks for reconstructed boundary geometry.
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <OSD_ThreadPool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>
#include <vector>

namespace boundary_move {

using Faces = std::vector<TopoDS_Face>;
inline void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
inline int count(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
    TopTools_IndexedMapOfShape map;
    TopExp::MapShapes(shape, type, map);
    return map.Extent();
}
inline double enclosedVolume(const TopoDS_Shape& shape) {
    GProp_GProps props;
    BRepGProp::VolumeProperties(shape, props);
    return props.Mass();
}
inline void valid(const TopoDS_Shape& shape, const char* stage) {
    require(BRepCheck_Analyzer(shape).IsValid(), "Invalid BRep");
    if (count(shape, TopAbs_SOLID) != 1 || count(shape, TopAbs_SHELL) != 1)
        throw std::runtime_error(std::string(stage) + ": expected one solid/shell, got "
            + std::to_string(count(shape, TopAbs_SOLID)) + "/" + std::to_string(count(shape, TopAbs_SHELL)));
    const double volume = enclosedVolume(shape);
    require(std::isfinite(volume) && volume > geometry_policy::minimumSolidVolumeMm3,
            "Expected positive volume");
    BOPAlgo_ArgumentAnalyzer check;
    check.SetShape1(shape); check.SelfInterMode() = true;
    check.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    check.Perform();
    require(!check.HasErrors() && !check.HasFaulty(), "Self-interference");
}
inline Faces faces(const TopoDS_Shape& shape) {
    Faces result;
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next())
        result.push_back(TopoDS::Face(it.Current()));
    return result;
}
}
