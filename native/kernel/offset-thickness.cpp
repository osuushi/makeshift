#include "offset-thickness.h"
#include "offset-thickness-ray.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepClass_FaceExplorer.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <ElSLib.hxx>
#include <TopTools_IndexedMapOfOrientedShape.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <gp_Sphere.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace {
constexpr double tolerance = 1e-7;
struct Candidate { int index; double delta; };
double radius(const BRepAdaptor_Surface& surface) {
    return surface.GetType() == GeomAbs_Cylinder ? surface.Cylinder().Radius() : surface.Sphere().Radius();
}
bool matchingSupport(const BRepAdaptor_Surface& a, const BRepAdaptor_Surface& b) {
    if (a.GetType() != b.GetType()) return false;
    if (a.GetType() == GeomAbs_Plane)
        return a.Plane().Axis().Direction().IsParallel(b.Plane().Axis().Direction(), 1e-9);
    if (a.GetType() == GeomAbs_Sphere)
        return a.Sphere().Location().Distance(b.Sphere().Location()) < tolerance;
    const auto x = a.Cylinder(), y = b.Cylinder();
    return x.Axis().Direction().IsParallel(y.Axis().Direction(), 1e-9) &&
           gp_Lin(x.Axis()).Distance(y.Location()) < tolerance;
}
gp_Vec normalDirection(const BRepAdaptor_Surface& surface, const gp_Pnt& point) {
    if (surface.GetType() == GeomAbs_Plane) return gp_Vec(surface.Plane().Axis().Direction());
    if (surface.GetType() == GeomAbs_Sphere) return gp_Vec(surface.Sphere().Location(), point).Normalized();
    const auto cylinder = surface.Cylinder();
    const gp_Vec axis(cylinder.Axis().Direction()), from(cylinder.Location(), point);
    return (from - axis * from.Dot(axis)).Normalized();
}
bool visible(const TopoDS_Face& face, const BRepAdaptor_Surface& surface,
             const TopoDS_Face& target, double delta, OffsetThicknessContext& context,
             double& slope) {
    if (!context.mayOverlap(face, target, delta)) return false;
    // Sample both trimmed faces so a small reference patch is not hidden by the
    // source's coarse parameter grid. Exact intersections still decide visibility.
    gp_Pnt midpoint; gp_Vec du, dv;
    surface.D1((surface.FirstUParameter()+surface.LastUParameter())/2,
               (surface.FirstVParameter()+surface.LastVParameter())/2, midpoint, du, dv);
    const double outward = (du.Crossed(dv).Dot(normalDirection(surface, midpoint)) > 0 ? 1 : -1)
        * (face.Orientation() == TopAbs_REVERSED ? -1 : 1);
    // Exact trimmed intersections at sampled locations: conservative absence,
    // never infer a facing region from display triangles or infinite supports alone.
    for (const bool reverse : {false, true}) {
        const auto& sampledFace = reverse ? target : face;
        // Visit every row and column before repeating either. Extruded walls
        // often have the same visibility along one parameter direction; exhaust
        // the same 121 samples only when the early witnesses do not resolve it.
        for (int diagonal = 0; diagonal < 11; ++diagonal) for (int u = 1; u < 12; ++u) {
            const int v = (u - 1 + diagonal) % 11 + 1;
            const auto cached = context.sample(sampledFace, u, v);
            if (!cached) continue;
            gp_Pnt point = *cached;
            const auto radial = normalDirection(surface, point);
            if (reverse) {
                point.Translate(radial * -delta);
                if (context.classify(face, point) != TopAbs_IN) continue;
            } else {
                // A ray cannot witness this candidate unless its endpoint lies
                // on the trimmed target. Reject misses before intersecting the
                // entire body, especially for many coplanar cap partitions.
                if (context.classify(target, point.Translated(radial * delta)) == TopAbs_OUT) continue;
            }
            const gp_Dir direction(radial * (delta > 0 ? 1 : -1));
            if (context.reaches(point, direction, std::abs(delta), target)) {
                slope = (delta > 0 ? -1 : 1) * outward;
                return true;
            }
        }
    }
    return false;
}
}

struct OffsetThicknessContext::SampleCache {
    struct Sample {
        bool checked = false;
        std::optional<gp_Pnt> point;
    };
    struct FaceSamples {
        BRepAdaptor_Surface surface;
        BRepClass_FaceExplorer explorer;
        Bnd_Box bounds;
        std::array<Sample, 121> grid;
        explicit FaceSamples(const TopoDS_Face& face)
            : surface(face), explorer(face) {}
    };
    // Unlike IsSame maps, this includes orientation as well as TShape/location.
    TopTools_IndexedMapOfOrientedShape faces;
    std::vector<std::unique_ptr<FaceSamples>> values;
    FaceSamples& get(const TopoDS_Face& face) {
        const int index = faces.Add(face);
        if (index > static_cast<int>(values.size())) values.push_back(std::make_unique<FaceSamples>(face));
        return *values[index - 1];
    }
    const Bnd_Box& bounds(const TopoDS_Face& face) {
        auto& entry = get(face);
        if (entry.bounds.IsVoid()) BRepBndLib::AddOptimal(face, entry.bounds, false, true);
        return entry.bounds;
    }
};

void presentOffsetThickness(std::ostream& out, const TopoDS_Face& face,
                            const TopTools_IndexedMapOfShape& faces, const TopoDS_Shape& body) {
    OffsetThicknessContext context(body);
    presentOffsetThickness(out, face, faces, context);
}

OffsetThicknessContext::OffsetThicknessContext(const TopoDS_Shape& shape) : body(shape) {}
OffsetThicknessContext::~OffsetThicknessContext() = default;

const BRepAdaptor_Surface& OffsetThicknessContext::surface(const TopoDS_Face& face) {
    if (!samples) samples = std::make_unique<SampleCache>();
    return samples->get(face).surface;
}

bool OffsetThicknessContext::reaches(const gp_Pnt& point, const gp_Dir& direction,
                                    double distance, const TopoDS_Face& target) {
    if (!tool) tool = std::make_unique<OffsetThicknessRay>(body);
    return tool->reaches(point, direction, distance, target);
}

std::optional<gp_Pnt> OffsetThicknessContext::sample(const TopoDS_Face& face, int u, int v) {
    if (!samples) samples = std::make_unique<SampleCache>();
    auto& entry = samples->get(face);
    auto& result = entry.grid[(u - 1) * 11 + v - 1];
    if (!result.checked) {
        const auto& surface = entry.surface;
        const gp_Pnt2d uv(surface.FirstUParameter() + (surface.LastUParameter()-surface.FirstUParameter())*u/12,
                          surface.FirstVParameter() + (surface.LastVParameter()-surface.FirstVParameter())*v/12);
        BRepClass_FaceClassifier classifier(entry.explorer, uv, tolerance);
        if (classifier.State() == TopAbs_IN) result.point = surface.Value(uv.X(), uv.Y());
        result.checked = true;
    }
    return result.point;
}

TopAbs_State OffsetThicknessContext::classify(const TopoDS_Face& face, const gp_Pnt& point) {
    if (!samples) samples = std::make_unique<SampleCache>();
    auto& entry = samples->get(face);
    const auto& surface = entry.surface;
    double u, v;
    if (surface.GetType() == GeomAbs_Plane) ElSLib::Parameters(surface.Plane(), point, u, v);
    else if (surface.GetType() == GeomAbs_Cylinder) ElSLib::Parameters(surface.Cylinder(), point, u, v);
    else if (surface.GetType() == GeomAbs_Sphere) ElSLib::Parameters(surface.Sphere(), point, u, v);
    else return BRepClass_FaceClassifier(face, point, tolerance).State();
    // Visibility needs this actual point on the face, not a distant stationary
    // projection onto another sector of the same cylindrical/spherical support.
    if (surface.Value(u, v).Distance(point) > tolerance) return TopAbs_OUT;
    const double umin = surface.FirstUParameter(), umax = surface.LastUParameter();
    const double vmin = surface.FirstVParameter(), vmax = surface.LastVParameter();
    if (surface.GetType() != GeomAbs_Plane) {
        const double period = 2 * std::acos(-1.0);
        u += period * std::round(((umin + umax) * 0.5 - u) / period);
    }
    // Keep a margin around the parameter bounds; the exact wire classifier
    // retains the existing tolerance and decides every near-boundary point.
    if (u < umin - 10 * tolerance || u > umax + 10 * tolerance ||
        v < vmin - 10 * tolerance || v > vmax + 10 * tolerance) return TopAbs_OUT;
    return BRepClass_FaceClassifier(entry.explorer, gp_Pnt2d(u, v), tolerance).State();
}

bool OffsetThicknessContext::mayOverlap(const TopoDS_Face& face, const TopoDS_Face& target, double delta) {
    if (!samples) samples = std::make_unique<SampleCache>();
    const auto& surface = samples->get(face).surface;
    const auto type = surface.GetType();
    gp_Pnt center;
    gp_Vec axis;
    double scale = 1;
    if (type == GeomAbs_Plane) axis = gp_Vec(surface.Plane().Axis().Direction());
    else if (type == GeomAbs_Cylinder || type == GeomAbs_Sphere) {
        const double r = radius(surface);
        if (r <= 2 * tolerance) return true;
        scale += delta / r;
        if (type == GeomAbs_Cylinder) {
            center = surface.Cylinder().Location();
            axis = gp_Vec(surface.Cylinder().Axis().Direction());
        } else center = surface.Sphere().Location();
    } else return true;
    double lo[3], hi[3];
    const auto& bounds = samples->bounds(face);
    if (bounds.IsVoid() || bounds.IsOpen()) return true;
    bounds.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    Bnd_Box projected;
    // Parallel planes translate; concentric sphere/cylinder normal offsets
    // scale all/radial coordinates. Their affine image of a box contains the
    // entire projected face, independently of its trimming or sampling.
    for (int corner = 0; corner < 8; ++corner) {
        gp_Pnt point(corner & 1 ? hi[0] : lo[0], corner & 2 ? hi[1] : lo[1], corner & 4 ? hi[2] : lo[2]);
        if (type == GeomAbs_Plane) point.Translate(axis * delta);
        else {
            const gp_Vec from(center, point);
            const gp_Vec axial = type == GeomAbs_Cylinder ? axis * from.Dot(axis) : gp_Vec();
            point = center.Translated(axial + (from - axial) * scale);
        }
        projected.Add(point);
    }
    // Reverse samples may lie within tolerance of the source support. Include
    // that displacement and its radial scaling before rejecting either route.
    projected.Enlarge(4 * tolerance * (1 + std::abs(scale - 1)));
    return !projected.IsOut(samples->bounds(target));
}

void presentOffsetThickness(std::ostream& out, const TopoDS_Face& face,
                            const TopTools_IndexedMapOfShape& faces, OffsetThicknessContext& context) {
    out << ",\"thickness\":";
    const auto& surface = context.surface(face);
    if (surface.GetType() != GeomAbs_Plane && surface.GetType() != GeomAbs_Cylinder && surface.GetType() != GeomAbs_Sphere) { out << "null"; return; }
    std::vector<Candidate> candidates;
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (faces(i).IsSame(face)) continue;
        const auto& other = context.surface(TopoDS::Face(faces(i)));
        if (!matchingSupport(surface, other)) continue;
        const double delta = surface.GetType() == GeomAbs_Plane
            ? gp_Vec(surface.Plane().Location(), other.Plane().Location()).Dot(gp_Vec(surface.Plane().Axis().Direction()))
            : radius(other) - radius(surface);
        if (std::abs(delta) > tolerance) candidates.push_back({i, delta});
    }
    std::sort(candidates.begin(), candidates.end(), [](const auto& a, const auto& b) { return std::abs(a.delta) < std::abs(b.delta); });
    if (!candidates.empty()) {
        for (const auto& candidate : candidates) {
            double slope;
            if (!visible(face, surface, TopoDS::Face(faces(candidate.index)), candidate.delta, context, slope)) continue;
            out << "{\"faceIndex\":" << candidate.index-1 << ",\"distance\":" << std::abs(candidate.delta)
                << ",\"slope\":" << slope << '}';
            return;
        }
    }
    out << "null";
}
