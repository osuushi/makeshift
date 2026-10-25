#include "offset-thickness-ray.h"
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <IntCurvesFace_Intersector.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <vector>

namespace {
constexpr double tolerance = 1e-7;
struct FaceRay {
    TopoDS_Face face;
    Bnd_Box bounds;
    std::unique_ptr<IntCurvesFace_Intersector> tool;
    explicit FaceRay(const TopoDS_Face& value) : face(value) {
        BRepBndLib::AddOptimal(face, bounds, false, true);
        bounds.Enlarge(tolerance);
    }
    IntCurvesFace_Intersector& intersect(const gp_Lin& ray, double end) {
        if (!tool) tool = std::make_unique<IntCurvesFace_Intersector>(face, tolerance);
        tool->Perform(ray, tolerance * 10, end);
        return *tool;
    }
};
}

struct OffsetThicknessRay::Data {
    struct Hit { int face; double distance; };
    TopTools_IndexedMapOfShape faces;
    std::vector<FaceRay> entries;
    std::map<std::array<double, 6>, Hit> knownHits;
    explicit Data(const TopoDS_Shape& body) {
        TopExp::MapShapes(body, TopAbs_FACE, faces);
        entries.reserve(faces.Extent());
        for (int i = 1; i <= faces.Extent(); ++i) entries.emplace_back(TopoDS::Face(faces(i)));
    }
};

OffsetThicknessRay::OffsetThicknessRay(const TopoDS_Shape& body) : data(std::make_unique<Data>(body)) {}
OffsetThicknessRay::~OffsetThicknessRay() = default;

bool OffsetThicknessRay::reaches(const gp_Pnt& point, const gp_Dir& direction,
                               double distance, const TopoDS_Face& target) {
    const int index = data->faces.FindIndex(target);
    if (!index) return false;
    const std::array<double, 6> key{point.X(), point.Y(), point.Z(), direction.X(), direction.Y(), direction.Z()};
    const auto known = data->knownHits.find(key);
    // A previous exact intersection on this identical ray can obstruct a
    // farther candidate. It never proves visibility or substitutes a nearby ray.
    if (known != data->knownHits.end() && known->second.face != index &&
        known->second.distance < distance - 2 * tolerance) return false;
    const gp_Lin ray(point, direction);
    auto& hit = data->entries[index - 1].intersect(ray, distance + tolerance);
    if (!hit.IsDone() || !hit.NbPnt()) return false;
    double nearest = hit.WParameter(1);
    for (int i = 2; i <= hit.NbPnt(); ++i) nearest = std::min(nearest, hit.WParameter(i));
    if (std::abs(nearest - distance) >= tolerance) return false;
    data->knownHits.insert_or_assign(key, Data::Hit{index, nearest});
    Bnd_Box segment;
    segment.Add(point);
    segment.Add(point.Translated(gp_Vec(direction) * (nearest + tolerance)));
    segment.Enlarge(tolerance);
    // Exact intersections only need to establish whether anything obstructs
    // this known target. Conservative boxes reject misses; any earlier or tied
    // hit rejects immediately, including a different face at the target edge.
    for (int i = 0; i < static_cast<int>(data->entries.size()); ++i) {
        if (i == index - 1) continue;
        auto& entry = data->entries[i];
        if (entry.bounds.IsOut(segment) || entry.bounds.IsOut(ray)) continue;
        auto& obstruction = entry.intersect(ray, nearest + tolerance);
        if (!obstruction.IsDone()) return false;
        for (int j = 1; j <= obstruction.NbPnt(); ++j) {
            const double position = obstruction.WParameter(j);
            if (position <= nearest + tolerance) {
                data->knownHits.insert_or_assign(key, Data::Hit{i + 1, position});
                return false;
            }
        }
    }
    return true;
}
