#include "shape-measurements.h"
#include "measurement-cache.h"
#include "kernel.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepGProp.hxx>
#include <BRep_Builder.hxx>
#include <Geom_BezierSurface.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GeomConvert.hxx>
#include <OSD_ThreadPool.hxx>
#include <TopLoc_Location.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <cmath>
#include <stdexcept>

namespace {
void check(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
std::array<double, 6> dimensions(const Bnd_Box& box) {
    std::array<double, 6> d;
    box.Get(d[0], d[1], d[2], d[3], d[4], d[5]);
    return d;
}
void checkBounds(const TopoDS_Shape& shape) {
    Bnd_Box expected;
    BRepBndLib::AddOptimal(shape, expected, false, false);
    check(dimensions(exactShapeBounds(shape)) == dimensions(expected), "Changed exact extrema");
}
void checkFace(const TopoDS_Face& face) {
    checkBounds(face);
    const auto cached = measuredSurface(face);
    GProp_GProps reference;
    BRepGProp::SurfaceProperties(face, reference);
    check(cached.Mass() == reference.Mass(), "Changed patch area");
    check(cached.CentreOfMass().Distance(reference.CentreOfMass()) < 1e-12, "Changed patch centroid");
}
void checkSolids() {
    gp_Trsf shift;
    shift.SetTranslation(gp_Vec(-130, 12, 0.25));
    const auto solid = BRepBuilderAPI_NurbsConvert(BRepPrimAPI_MakeBox(3, 5, 9).Shape()).Shape();
    const auto moved = solid.Moved(TopLoc_Location(shift));
    for (const auto& shape : {solid, moved, solid.Reversed(), solid}) {
        const double sign = shape.Orientation() == TopAbs_REVERSED ? -1 : 1;
        check(std::abs(signedSolidMass(shape) - sign * 135) < 1e-9, "Changed signed solid mass");
        std::optional<std::array<double, 6>> bounds;
        check(std::abs(volume(shape, -1, &bounds) - 135) < 1e-9, "Changed integrated volume");
        check(bounds == dimensions(exactShapeBounds(shape)), "Volume returned another placement's bounds");
        check(std::abs(volume(shape, 2) - 135) < 1e-9, "Changed axis-specific volume");
    }
}
void checkBoundaryKeys() {
    const auto solid = BRepPrimAPI_MakeBox(2, 3, 4).Shape();
    const auto edge = TopoDS::Edge(TopExp_Explorer(solid, TopAbs_EDGE).Current());
    const auto key = measurementKey(solid);
    check(!key.empty(), "Missing exact source key");
    BRep_Builder builder;
    builder.UpdateEdge(edge, 0.002);
    const auto relaxed = measurementKey(solid);
    check(relaxed != key, "Changing an edge tolerance reused a source check");
    builder.SameParameter(edge, false);
    check(relaxed != measurementKey(solid), "Changing edge parameter correspondence reused a source check");
}
}
int main() {
    OSD_ThreadPool::DefaultPool(4);
    TColgp_Array2OfPnt poles(1, 3, 1, 3);
    TColStd_Array2OfReal weights(1, 3, 1, 3);
    for (int i = 1; i <= 3; ++i) for (int j = 1; j <= 3; ++j) {
        poles(i, j) = gp_Pnt(i * 2.0, j * 3.0, i == 2 && j == 2 ? 5.0 : 0.0);
        weights(i, j) = i == 2 && j == 2 ? 1.75 : 1.0;
    }
    Handle(Geom_BezierSurface) bezier = new Geom_BezierSurface(poles, weights);
    const auto spline = GeomConvert::SurfaceToBSplineSurface(bezier);
    const auto cap = BRepBuilderAPI_MakeFace(bezier, 1e-7).Face();
    const auto trim = BRepBuilderAPI_MakeFace(spline, 0.15, 0.85, 0.25, 0.95, 1e-7).Face();
    gp_Trsf shift;
    shift.SetRotation(gp_Ax1(gp_Pnt(1, 2, 3), gp_Dir(1, 1, 2)), 0.79);
    shift.SetTranslationPart(gp_Vec(120, -135, 42));
    const auto moved = TopoDS::Face(trim.Moved(TopLoc_Location(shift)));
    TopoDS_Compound compound;
    BRep_Builder builder;
    builder.MakeCompound(compound);
    for (const auto& face : {cap, trim, moved}) builder.Add(compound, face);
    // Initially all three spline entries miss together. Repeat in a different
    // order with trimmed, reversed and located versions of the same support.
    checkBounds(compound);
    for (const auto& face : {moved, cap, TopoDS::Face(trim.Reversed()), trim}) {
        checkFace(face);
        const auto bounds = conservativeFaceBounds(face);
        const BRepAdaptor_Surface surface(face);
        for (double u : {0.2, 0.5, 0.8}) for (double v : {0.3, 0.5, 0.9})
            check(!bounds.IsOut(surface.Value(u, v)), "Rejection box excluded a patch point");
    }
    const double before = measuredSurface(cap).Mass();
    bezier->SetPole(2, 2, gp_Pnt(4, 6, -12));
    checkFace(cap);
    check(measuredSurface(cap).Mass() > before, "A mutated support reused old measurements");
    builder.Add(compound, BRepBuilderAPI_MakeEdge(gp_Pnt(-85, -80, -70), gp_Pnt(-60, 2, 3)).Edge());
    builder.Add(compound, BRepBuilderAPI_MakeVertex(gp_Pnt(500, 375, 210)).Vertex());
    checkBounds(compound);
    checkSolids();
    checkBoundaryKeys();
}
