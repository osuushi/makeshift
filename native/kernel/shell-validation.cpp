#include "shell-validation.h"
#include "offset-geometry.h"
#include "timing.h"
#include <OSD_ThreadPool.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>

namespace shell_tool {
namespace {
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
double mass(const TopoDS_Shape& shape) {
    GProp_GProps p; BRepGProp::VolumeProperties(shape, p);
    return p.Mass();
}
double area(const TopoDS_Shape& shape) {
    GProp_GProps p; BRepGProp::SurfaceProperties(shape, p);
    return p.Mass();
}
template<class Operation>
TopoDS_Shape compare(const TopoDS_Shape& a, const TopoDS_Shape& b) {
    Operation op;
    TopTools_ListOfShape args, tools; args.Append(a); tools.Append(b);
    op.SetArguments(args); op.SetTools(tools); op.SetNonDestructive(true);
    op.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    op.Build();
    require(op.IsDone() && !op.HasErrors() && !op.HasWarnings(),
            "Shell verification could not establish material containment");
    validate(op.Shape());
    return op.Shape();
}
}
TopoDS_Shape oneSolid(const TopoDS_Shape& shape) {
    TopTools_IndexedMapOfShape solids;
    TopExp::MapShapes(shape, TopAbs_SOLID, solids);
    require(solids.Extent() == 1, "Shell must leave one connected wall solid");
    const auto solid = solids(1);
    for (const auto type : {TopAbs_SHELL, TopAbs_FACE, TopAbs_EDGE, TopAbs_VERTEX}) {
        TopTools_IndexedMapOfShape all, kept;
        TopExp::MapShapes(shape, type, all); TopExp::MapShapes(solid, type, kept);
        require(all.Extent() == kept.Extent(), "Shell result contains loose geometry");
    }
    return solid;
}
TopoDS_Shape subtract(const TopoDS_Shape& a, const TopoDS_Shape& b) {
    return compare<BRepAlgoAPI_Cut>(a, b);
}
void validateWall(const TopoDS_Shape& source, const TopoDS_Shape& wall,
                  const TopoDS_Shape& offsetSkin, const TopoDS_Shape& retainedSkin,
                  const TopTools_ListOfShape& openings, double thickness) {
    KernelTiming timing("shell-wall-validation");
    timing.phase("begin");
    offset_geometry::validSolid(wall, "Shell");
    timing.phase("valid-solid");
    const double sourceVolume = mass(source);
    // Whole-shape Boolean checks supplement local BRep validity and offset completion.
    const auto escaped = thickness < 0 ? compare<BRepAlgoAPI_Cut>(wall, source)
                                      : compare<BRepAlgoAPI_Common>(wall, source);
    timing.phase("containment");
    require(volume(escaped) <= std::max(1e-9, sourceVolume * 1e-10),
            "Shell material crosses the preserved surface");
    if (thickness < 0)
        require(mass(wall) < sourceVolume - 1e-9, "Shell did not leave a cavity");
    TopTools_IndexedMapOfShape originalFaces, offsetFaces;
    TopExp::MapShapes(retainedSkin, TopAbs_FACE, originalFaces);
    TopExp::MapShapes(offsetSkin, TopAbs_FACE, offsetFaces);
    require(!originalFaces.IsEmpty() && !offsetFaces.IsEmpty(), "Shell lost its offset walls");
    BRepExtrema_DistShapeShape separation;
    separation.SetMultiThread(OSD_ThreadPool::DefaultPool()->HasThreads());
    separation.LoadS1(retainedSkin); separation.LoadS2(offsetSkin);
    separation.Perform();
    timing.phase("separation");
    require(separation.IsDone() && separation.Value() >= std::abs(thickness) - boundaryDistanceMm,
            "Shell walls collide or are thinner than requested");
    // Every requested opening must lose positive area. Rim strips are allowed.
    for (const auto& face : openings) {
        const auto remaining = compare<BRepAlgoAPI_Common>(face, wall);
        require(area(remaining) < area(face) - boundaryDistanceMm * boundaryDistanceMm,
                "Shell could not open every selected face");
    }
    timing.phase("openings");
}
}
