#include "microscopic-cover.h"
#include "geometry-policy.h"
#include "kernel.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <optional>
#include <stdexcept>

namespace {
std::optional<TopoDS_Shape> subtract(const TopoDS_Shape& material, const TopoDS_Shape& cover) {
    try {
        BRepAlgoAPI_Cut cut;
        TopTools_ListOfShape arguments, tools;
        arguments.Append(material);
        tools.Append(cover);
        cut.SetArguments(arguments);
        cut.SetTools(tools);
        cut.SetNonDestructive(true);
        cut.Build();
        if (!cut.IsDone() || cut.HasErrors() || cut.HasWarnings())
            return {};
        validate(cut.Shape());
        return cut.Shape();
    } catch (const Standard_Failure&) {
        return {};
    } catch (const std::runtime_error&) {
        return {};
    }
}
bool empty(const TopoDS_Shape& shape) {
    for (TopExp_Explorer s(shape, TopAbs_SOLID); s.More(); s.Next())
        if (std::abs(volume(s.Current())) > geometry_policy::minimumSolidVolumeMm3)
            return false;
    return true;
}
std::vector<gp_Vec> directions(const TopoDS_Shape& source) {
    std::vector<gp_Vec> result;
    const auto add = [&](gp_Vec direction) {
        direction.Normalize();
        for (const auto& existing : result)
            if ((existing - direction).Magnitude() < 1e-9)
                return;
        result.push_back(direction);
    };
    for (TopExp_Explorer f(source, TopAbs_FACE); f.More(); f.Next()) {
        const BRepAdaptor_Surface surface(TopoDS::Face(f.Current()));
        if (surface.GetType() != GeomAbs_Plane)
            continue;
        const gp_Vec normal(surface.Plane().Axis().Direction());
        add(normal);
        add(-normal);
    }
    for (int count = 1; count <= 3; ++count)
        for (int x : {-1, 0, 1})
            for (int y : {-1, 0, 1})
                for (int z : {-1, 0, 1})
                    if ((x != 0) + (y != 0) + (z != 0) == count)
                        add(gp_Vec(x, y, z));
    return result;
}
} // namespace
bool microscopicCoverContains(const TopoDS_Shape& source, const TopoDS_Shape& candidate) {
    auto remaining = candidate;
    if (const auto next = subtract(remaining, source))
        remaining = *next;
    if (empty(remaining))
        return true;
    for (const auto& direction : directions(source)) {
        gp_Trsf transform;
        transform.SetTranslation(direction * geometry_policy::minimumTopologyExtentMm);
        const auto shifted = BRepBuilderAPI_Transform(source, transform, false).Shape();
        if (const auto next = subtract(remaining, shifted))
            remaining = *next;
        if (empty(remaining))
            return true;
    }
    return false;
}
