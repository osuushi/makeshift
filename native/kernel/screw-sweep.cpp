#include "screw-sweep.h"
#include "timing.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepGProp.hxx>
#include <BRepLib.hxx>
#include <BRepOffsetAPI_MakePipeShell.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include <BOPAlgo_MakerVolume.hxx>
#include <GProp_GProps.hxx>
#include <Geom2d_Line.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <TopExp_Explorer.hxx>
#include <TopExp.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopTools_MapOfShape.hxx>
#include <OSD_ThreadPool.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <cmath>
#include <stdexcept>
#include <limits>

namespace {
TopoDS_Wire spine(const TopoDS_Face& face, const gp_Ax1& axis, double angle, double height) {
    GProp_GProps props; BRepGProp::SurfaceProperties(face, props);
    const gp_Pnt center = props.CentreOfMass();
    const gp_Vec along(axis.Direction()), offset(axis.Location(), center);
    const gp_Pnt origin = axis.Location().Translated(along * offset.Dot(along));
    const gp_Vec radial(origin, center);
    if (radial.Magnitude() < 1e-7) throw std::runtime_error("Helical section must lie beside the axis");
    Handle(Geom_CylindricalSurface) cylinder = new Geom_CylindricalSurface(
        gp_Ax3(origin, axis.Direction(), gp_Dir(radial)), radial.Magnitude());
    Handle(Geom2d_Line) path = new Geom2d_Line(gp_Pnt2d(0,0), gp_Dir2d(angle, height));
    const auto edge = BRepBuilderAPI_MakeEdge(path, cylinder, 0, std::hypot(angle, height)).Edge();
    // Derivative accuracy matters at r=0: the previous default approximation
    // turned the collapsed axial side into a small, self-intersecting sliver.
    if (!BRepLib::BuildCurve3d(edge, 1e-11)) throw std::runtime_error("Cannot construct helical path");
    return BRepBuilderAPI_MakeWire(edge).Wire();
}
TopoDS_Wire sectionWire(const TopoDS_Wire& source, const gp_Ax1& axis) {
    // A curved edge with both ends on the axis would sweep one face whose two
    // axial boundaries overlap. Split that edge analytically before sweeping,
    // so the volume builder can intersect distinct boundary faces instead.
    BRepBuilderAPI_MakeWire result;
    const gp_Lin line(axis);
    for (BRepTools_WireExplorer e(source); e.More(); e.Next()) {
        const auto edge = e.Current();
        BRepAdaptor_Curve curve(edge);
        if (curve.GetType() == GeomAbs_Line || line.Distance(curve.Value(curve.FirstParameter())) > 1e-7
            || line.Distance(curve.Value(curve.LastParameter())) > 1e-7) {
            result.Add(edge); continue;
        }
        double first, last; const auto geometry = BRep_Tool::Curve(edge, first, last);
        const double middle = (first + last) / 2;
        auto a = BRepBuilderAPI_MakeEdge(geometry, first, middle).Edge();
        auto b = BRepBuilderAPI_MakeEdge(geometry, middle, last).Edge();
        if (edge.Orientation() == TopAbs_REVERSED) { result.Add(TopoDS::Edge(b.Reversed())); result.Add(TopoDS::Edge(a.Reversed())); }
        else { result.Add(a); result.Add(b); }
    }
    if (!result.IsDone()) throw std::runtime_error("Cannot prepare helical section boundary");
    return result.Wire();
}
TopoDS_Shape sweepWire(const TopoDS_Wire& source, const TopoDS_Wire& path, const gp_Ax1& axis) {
    const auto wire = sectionWire(source, axis);
    BRepOffsetAPI_MakePipeShell pipe(path);
    pipe.SetMode(true); // Constant-pitch Frenet frame = rigid screw rotation.
    pipe.SetTolerance(1e-9, 1e-9, 1e-9); pipe.SetMaxDegree(14); pipe.SetMaxSegments(200);
    TopoDS_Vertex start, end; TopExp::Vertices(path, start, end);
    pipe.Add(wire, start, false, false); pipe.Build();
    if (!pipe.IsDone()) throw std::runtime_error("Cannot build helical section");
    TopTools_MapOfShape collapsed;
    const gp_Lin line(axis);
    for (TopExp_Explorer e(wire, TopAbs_EDGE); e.More(); e.Next()) {
        BRepAdaptor_Curve curve(TopoDS::Edge(e.Current()));
        if (curve.GetType() == GeomAbs_Line && line.Distance(curve.Value(curve.FirstParameter())) < 1e-7
            && line.Distance(curve.Value(curve.LastParameter())) < 1e-7)
            for (const auto& face : pipe.Generated(e.Current())) collapsed.Add(face);
    }
    if (collapsed.IsEmpty()) {
        if (!pipe.MakeSolid()) throw std::runtime_error("Cannot close helical section");
        validate(pipe.Shape()); return pipe.Shape();
    }
    // The axis edge sweeps a line, not a face. Intersect the remaining boundary
    // faces to split their overlapping axial edges and close the actual volume.
    BOPAlgo_MakerVolume volume;
    volume.SetAvoidInternalShapes(true);
    for (TopExp_Explorer e(pipe.Shape(), TopAbs_FACE); e.More(); e.Next())
        if (!collapsed.Contains(e.Current())) volume.AddArgument(e.Current());
    // Close explicitly: MakeSolid assumes every cap edge has a side face,
    // which is false for a collapsed axis edge.
    volume.AddArgument(BRepBuilderAPI_MakeFace(TopoDS::Wire(pipe.FirstShape())).Face());
    volume.AddArgument(BRepBuilderAPI_MakeFace(TopoDS::Wire(pipe.LastShape())).Face());
    volume.Perform();
    if (volume.HasErrors()) throw std::runtime_error("Cannot close helical section at the axis");
    validateSweptSolids(volume.Shape());
    return volume.Shape();
}
TopoDS_Shape piece(const TopoDS_Face& face, const gp_Ax1& axis, double angle, double height) {
    const auto path = spine(face, axis, angle, height), outer = BRepTools::OuterWire(face);
    auto solid = sweepWire(outer, path, axis);
    for (TopExp_Explorer e(face, TopAbs_WIRE); e.More(); e.Next()) {
        if (e.Current().IsSame(outer)) continue;
        const auto hole = sweepWire(TopoDS::Wire(e.Current().Reversed()), path, axis);
        std::vector<SourceEntity> unused; solid = booleanShape(solid, hole, "subtract", unused);
    }
    return solid;
}
}
void validateSweptSolids(const TopoDS_Shape& shape) {
    KernelTiming timing("sweep-validation");
    validate(shape);
    timing.phase("brep");
    int count = 0;
    for (TopExp_Explorer e(shape, TopAbs_SOLID); e.More(); e.Next()) {
        ++count;
        GProp_GProps props; BRepGProp::VolumeProperties(e.Current(), props);
        timing.phase("volume");
        if (props.Mass() <= 1e-10) throw std::runtime_error("Swept solid has invalid material orientation or no volume");
        BOPAlgo_ArgumentAnalyzer check;
        check.SetShape1(e.Current()); check.SelfInterMode() = true;
        check.SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
        check.Perform();
        timing.phase("self-intersection");
        if (check.HasFaulty()) throw std::runtime_error("Cannot resolve swept material into a non-intersecting solid");
    }
    if (!count) throw std::runtime_error("Sweep produced no closed solid");
}
TopoDS_Shape screwSweep(const TopoDS_Face& face, const gp_Ax1& axis, double angle, double height) {
    KernelTiming timing("screw-sweep");
    // Each <=180° piece is injective away from the axis. Unioning them resolves
    // full-turn closure and overlapping turns without publishing an invalid pipe.
    const double pieces = std::ceil(std::abs(angle) / std::acos(-1.0));
    if (!std::isfinite(pieces) || pieces > std::numeric_limits<int>::max())
        throw std::runtime_error("Revolution angle is too large to construct");
    const int count = static_cast<int>(pieces);
    const double step = angle / count, rise = height / count;
    const auto first = piece(face, axis, step, rise);
    timing.phase("first-piece");
    auto shape = first;
    for (int i = 1; i < count; ++i) {
        gp_Trsf transform; transform.SetRotation(axis, step * i);
        transform.SetTranslationPart(gp_Vec(transform.TranslationPart()) + gp_Vec(axis.Direction()) * (rise * i));
        const auto next = BRepBuilderAPI_Transform(first, transform, true).Shape();
        std::vector<SourceEntity> unused; shape = booleanShape(shape, next, "union", unused);
    }
    timing.phase("piece-unions");
    return shape;
}
