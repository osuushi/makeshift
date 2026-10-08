#include "offset-geometry.h"
#include <OSD_ThreadPool.hxx>
#include "offset-repair.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepLib.hxx>
#include <BRep_Tool.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include <Geom_OffsetSurface.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>

namespace offset_geometry {
namespace {
void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}
double mass(const TopoDS_Shape& shape) {
    GProp_GProps p; BRepGProp::VolumeProperties(shape, p);
    return p.Mass();
}
std::vector<double> samples(const BRepAdaptor_Surface& surface, bool u) {
    const int count = u ? surface.NbUIntervals(GeomAbs_C2) : surface.NbVIntervals(GeomAbs_C2);
    TColStd_Array1OfReal bounds(1, count + 1);
    if (u) surface.UIntervals(bounds, GeomAbs_C2);
    else surface.VIntervals(bounds, GeomAbs_C2);
    std::vector<double> result;
    for (int i = 1; i <= count; ++i)
        for (double fraction : {0.2, 0.5, 0.8})
            result.push_back(bounds(i) * (1 - fraction) + bounds(i + 1) * fraction);
    return result;
}
}
bool freeform(const TopoDS_Shape& shape) {
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) {
        const auto type = BRepAdaptor_Surface(TopoDS::Face(it.Current())).GetType();
        if (type != GeomAbs_Plane && type != GeomAbs_Cylinder && type != GeomAbs_Cone &&
            type != GeomAbs_Sphere && type != GeomAbs_Torus) return true;
    }
    return false;
}
std::string encoding(const TopoDS_Shape& shape) {
    // Boolean tools may change root container ownership without changing geometry.
    auto copy = shape;
    const bool free = copy.Free();
    copy.Free(false);
    const auto result = encode(copy);
    copy.Free(free);
    return result;
}
Operand prepare(const Operand& original, const char* context, std::vector<TopoDS_Face>* selected,
                bool forceCopy) {
    if (!freeform(original.shape) && !forceCopy) return original;
    // Recompute parameter correspondence, retaining the spatial supports/curves.
    // Never mutate the accepted operand or take orientation from local copy history.
    BRepBuilderAPI_Copy copy(original.shape, true, false);
    Operand result{original.id, copy.Shape(), {}};
    TopTools_IndexedMapOfShape copied;
    TopExp::MapShapes(result.shape, copied);
    for (const auto& entity : original.entities) {
        const auto index = copied.FindIndex(copy.ModifiedShape(entity.shape));
        require(index != 0, std::string(context) + " preparation lost a source entity");
        result.entities.push_back({entity.id, copied(index)});
    }
    if (selected) for (auto& face : *selected) {
        const auto index = copied.FindIndex(copy.ModifiedShape(face));
        require(index != 0, std::string(context) + " preparation lost a selected face");
        face = TopoDS::Face(copied(index));
    }
    // Preserve an already precise parameterization. Forcing SameParameter on
    // trimmed periodic Boolean edges can replace valid pcurves with invalid ones.
    try {
        tightenGeneratedBoundaries(result.shape, original.shape, false);
        validSolid(result.shape, context);
        return result;
    } catch (const std::runtime_error&) { /* Repair only when verification requires it. */ }
    BRepLib::SameParameter(result.shape, geometry_policy::parameterCorrespondenceMm, true);
    // Boolean/fillet inputs can retain conservative bounds despite tight geometry.
    // Verify before reducing them on this private copy; no vertex motion is allowed.
    tightenGeneratedBoundaries(result.shape, original.shape, false);
    validSolid(result.shape, context);
    return result;
}
void checkParallel(const TopoDS_Face& source, const TopoDS_Face& offset, double thickness,
                   const char* context, bool preserveOrientation) {
    const auto support = BRep_Tool::Surface(source);
    const Handle(Geom_OffsetSurface) expectedOffset = new Geom_OffsetSurface(support,
        thickness * (source.Orientation() == TopAbs_REVERSED ? -1 : 1));
    // OCCT supplies the exact analytic equivalent when available. Projecting onto
    // the generic offset wrapper needlessly invokes numerical surface extrema.
    Handle(Geom_Surface) expected = expectedOffset->Surface();
    if (expected.IsNull()) expected = expectedOffset;
    BRepAdaptor_Surface actual(offset);
    // Include every C2 span for freeform supports, rather than sampling only
    // three positions over the entire spline. This remains a numerical check,
    // supplemented by exact BRep validity and whole-skin minimum separation.
    for (double u : samples(actual, true)) for (double v : samples(actual, false)) {
        const auto p = actual.Value(u, v);
        GeomAPI_ProjectPointOnSurf projection(p, expected);
        require(projection.IsDone() && projection.NbPoints() && projection.LowerDistance() <= boundaryDistanceMm,
                std::string(context) + " surface does not match the requested thickness");
        if (preserveOrientation) {
            GeomAPI_ProjectPointOnSurf basisProjection(p, support);
            require(basisProjection.IsDone() && basisProjection.NbPoints(),
                    std::string(context) + " could not verify surface orientation");
            double a, b; basisProjection.LowerDistanceParameters(a, b);
            gp_Pnt point; gp_Vec du, dv, targetU, targetV;
            support->D1(a, b, point, du, dv);
            actual.D1(u, v, point, targetU, targetV);
            const double sign = source.Orientation() == offset.Orientation() ? 1 : -1;
            require(sign * du.Crossed(dv).Dot(targetU.Crossed(targetV)) > 0,
                    std::string(context) + " inverted a continuing surface");
        }
    }
    if (expected == expectedOffset) {
        BRepAdaptor_Surface original(source);
        for (double u : samples(original, true)) for (double v : samples(original, false)) {
            gp_Pnt p; gp_Vec du, dv, offsetU, offsetV;
            support->D1(u, v, p, du, dv);
            expectedOffset->D1(u, v, p, offsetU, offsetV);
            const auto normal = du.Crossed(dv), offsetNormal = offsetU.Crossed(offsetV);
            require(normal.SquareMagnitude() > 1e-24 && offsetNormal.SquareMagnitude() > 1e-24 &&
                    normal.Dot(offsetNormal) > 0,
                    std::string(context) + " offset folds or collapses a curved surface");
        }
    }
}
void validSolid(const TopoDS_Shape& shape, const char* context) {
    // Arc joins carry conservative vertex bounds above 1e-6 mm in OCCT.
    // Keep a separate 2e-6 mm topology budget; geometric distance stays at 1e-6.
    using geometry_policy::offsetTopologyToleranceMm;
    require(!shape.IsNull() && shape.ShapeType() == TopAbs_SOLID,
            std::string(context) + " must produce exactly one solid per body");
    const bool parallel = OSD_ThreadPool::DefaultPool()->HasThreads();
    BRepCheck_Analyzer validity(shape, true, parallel, true);
    require(validity.IsValid(), std::string(context) + " has invalid boundaries or surface geometry");
    const double v = mass(shape);
    require(std::isfinite(v) && v > geometry_policy::minimumSolidVolumeMm3,
            std::string(context) + " has collapsed or inverted material");
    BRepClass3d_SolidClassifier classifier(shape);
    classifier.PerformInfinitePoint(boundaryDistanceMm);
    require(classifier.State() == TopAbs_OUT, std::string(context) + " has inverted orientation");
    for (TopExp_Explorer it(shape, TopAbs_SHELL); it.More(); it.Next())
        require(BRep_Tool::IsClosed(it.Current()), std::string(context) + " wall has an open boundary");
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next())
        require(BRep_Tool::Tolerance(TopoDS::Face(it.Current())) <= offsetTopologyToleranceMm,
                std::string(context) + " exceeds the surface tolerance");
    for (TopExp_Explorer it(shape, TopAbs_EDGE); it.More(); it.Next())
        require(BRep_Tool::Tolerance(TopoDS::Edge(it.Current())) <= offsetTopologyToleranceMm,
                std::string(context) + " exceeds the edge tolerance");
    for (TopExp_Explorer it(shape, TopAbs_VERTEX); it.More(); it.Next())
        require(BRep_Tool::Tolerance(TopoDS::Vertex(it.Current())) <= offsetTopologyToleranceMm,
                std::string(context) + " exceeds the vertex tolerance");
    BOPAlgo_ArgumentAnalyzer check;
    check.SetShape1(shape); check.SelfInterMode() = true;
    check.SetRunParallel(parallel); check.Perform();
    require(!check.HasErrors() && !check.HasFaulty(), std::string(context) + " contains self-intersections");
}
}
