#include "edit-intersections.h"
#include "measurement-cache.h"
#include "shape-measurements.h"
#include "timing.h"
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include <BRepBndLib.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <OSD_ThreadPool.hxx>
#include <Precision.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Iterator.hxx>
#include <algorithm>
#include <array>
#include <optional>
#include <vector>

namespace {
struct Patch {
    TopoDS_Face face;
    Bnd_Box box;
    bool near;
};
struct Regions {
    TopoDS_Compound remote, local;
};
using Checks = MeasurementCache<std::array<bool, 2>>;
Checks verifiedRemote(4, 16 * 1024 * 1024);
Checks verifiedSolid(2, 8 * 1024 * 1024);

Bnd_Box boundaryBounds(const TopoDS_Face& face) {
    auto box = conservativeFaceBounds(face);
    // Include physical 3D trims as well as the supporting surface. The extra
    // margin also covers both sides' tolerances in OCCT's interference boxes.
    for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
        BRepBndLib::Add(e.Current(), box, false);
    for (TopExp_Explorer v(face, TopAbs_VERTEX); v.More(); v.Next())
        box.Add(BRep_Tool::Pnt(TopoDS::Vertex(v.Current())));
    box.Enlarge(4 * (Precision::Confusion() + std::max({BRep_Tool::Tolerance(face),
        BRep_Tool::MaxTolerance(face, TopAbs_EDGE), BRep_Tool::MaxTolerance(face, TopAbs_VERTEX)})));
    return box;
}
std::optional<Regions> partition(const TopoDS_Shape& solid, const Bnd_Box& focus) {
    if (solid.ShapeType() != TopAbs_SOLID || focus.IsVoid()) return {};
    TopoDS_Iterator children(solid);
    if (!children.More() || children.Value().ShapeType() != TopAbs_SHELL) return {};
    const auto shell = children.Value();
    children.Next();
    if (children.More() || shell.NbChildren() < 16 || !BRep_Tool::IsClosed(shell)) return {};
    std::vector<Patch> faces;
    Bnd_Box localBounds;
    for (TopoDS_Iterator it(shell); it.More(); it.Next()) {
        if (it.Value().ShapeType() != TopAbs_FACE ||
            (it.Value().Orientation() != TopAbs_FORWARD && it.Value().Orientation() != TopAbs_REVERSED)) return {};
        const auto face = TopoDS::Face(it.Value());
        const auto box = boundaryBounds(face);
        if (box.IsVoid() || box.IsOpen()) return {};
        const bool near = !box.IsOut(focus);
        faces.push_back({face, box, near});
        if (near) localBounds.Add(box);
    }
    if (localBounds.IsVoid()) return {};
    Regions groups;
    BRep_Builder builder;
    builder.MakeCompound(groups.remote);
    builder.MakeCompound(groups.local);
    for (const auto& patch : faces) {
        if (!patch.near) builder.Add(groups.remote, patch.face);
        if (!localBounds.IsOut(patch.box)) builder.Add(groups.local, patch.face);
    }
    if (groups.local.NbChildren() + 4 >= static_cast<int>(faces.size())) return {};
    return groups;
}
bool localCheck(const TopoDS_Shape& shape) {
    BOPAlgo_ArgumentAnalyzer check;
    check.SetShape1(shape);
    check.SelfInterMode() = true;
    check.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    check.Perform();
    return !check.HasErrors() && !check.HasFaulty();
}
}

void validateEditIntersections(const TopoDS_Shape& shape, const Bnd_Box& focus, IntersectionPolicy policy,
                               const std::function<void(const TopoDS_Shape&)>& fullCheck) {
    KernelTiming timing("edit-intersections");
    std::shared_ptr<Checks::Entry> entry, whole;
    const auto index = static_cast<size_t>(policy);
    try {
        TopoDS_Iterator shell(shape);
        if (shape.ShapeType() == TopAbs_SOLID && shell.More() && shell.Value().NbChildren() >= 16)
            whole = verifiedSolid.lookup(shape);
        if (whole && whole->value[index]) return;
        const auto regions = partition(shape, focus);
        if (regions) {
            // One compound key preserves the actual shared edges and vertices,
            // trims, orientations, placements and tolerances between remote faces.
            entry = verifiedRemote.lookup(regions->remote);
            if (entry && entry->value[index] && localCheck(regions->local)) {
                if (whole) whole->value[index] = true;
                timing.phase("local");
                return;
            }
        }
    } catch (const Standard_Failure&) {}
    fullCheck(shape);
    if (entry) entry->value[index] = true;
    if (whole) {
        whole->value[index] = true;
        // The offset check requires the original OCCT checker to succeed. It
        // satisfies the finish check on this exact solid, including shared trims.
        if (policy == IntersectionPolicy::offset) whole->value[static_cast<size_t>(IntersectionPolicy::finish)] = true;
    }
    timing.phase("whole");
}
