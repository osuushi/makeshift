#include "erosion.h"
#include "erosion-coverage-cells.h"
#include "erosion-section-classifier.h"
#include "erosion-distance-bounds.h"
#include "geometry-policy.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <limits>
#include <memory>
#include <optional>
#include <queue>
#include <stdexcept>

namespace {
using namespace erosion::coverage;
constexpr double tolerance = geometry_policy::boundaryDistanceMm;
class Distance {
    struct Ball { gp_Pnt center; double radius; bool inside; };
    std::vector<Ball> balls;
    std::vector<erosion::SectionClassifier> sections;
    bool hasSections = false;
    std::optional<std::pair<gp_Pnt, bool>> lastClassification;
    std::vector<std::pair<gp_Pnt, bool>> classifiedPoints;
    std::vector<std::unique_ptr<BRepClass3d_SolidClassifier>> classifiers;
    std::vector<std::vector<Plane>> convex;
    std::vector<Bnd_Box> faces;
    BRepExtrema_DistShapeShape extrema;
    std::unique_ptr<erosion::BoundaryDistance> bounds;
    // This immutable boundary is queried repeatedly at each subdivision center.
    std::optional<std::pair<gp_Pnt, double>> lastLower;
    double lower(const gp_Pnt& point) {
        if (!lastLower || point.SquareDistance(lastLower->first) != 0)
            lastLower = std::pair{point, bounds->lower(point)};
        return lastLower->second;
    }
public:
    explicit Distance(const TopoDS_Shape& shape) {
        if (shape.IsNull()) return;
        bounds = std::make_unique<erosion::BoundaryDistance>(shape);
        for (TopExp_Explorer s(shape, TopAbs_SOLID); s.More(); s.Next()) {
            sections.emplace_back(s.Current());
            classifiers.push_back(std::make_unique<BRepClass3d_SolidClassifier>(s.Current()));
            convex.push_back(convexPlanes(s.Current()));
        }
        hasSections = std::any_of(sections.begin(),sections.end(),[](const auto& section) { return section.supported(); });
        for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
            Bnd_Box box;
            BRepBndLib::AddOptimal(f.Current(), box, false, true);
            box.Enlarge(tolerance);
            faces.push_back(box);
        }
        extrema.LoadS2(erosion::boundary(shape));
        extrema.SetDeflection(tolerance/10);
    }
    bool sectioned() const {
        return !sections.empty() && std::all_of(sections.begin(),sections.end(),[](const auto& section) {
            return section.supported();
        });
    }
    bool contains(const gp_Pnt& point) {
        if (lastClassification && point.SquareDistance(lastClassification->first) == 0)
            return lastClassification->second;
        const double minimumDistance = hasSections ? lower(point) : 0;
        bool complete = !sections.empty();
        for (const auto& section : sections) {
            const auto known = section.contains(point,minimumDistance);
            if (known && *known) return true;
            if (!known) complete = false;
        }
        if (complete) return false;

        for (const auto& ball : balls)
            if (point.SquareDistance(ball.center) < ball.radius*ball.radius) return ball.inside;
        // A segment enclosed by a boundary-free box preserves classification,
        // even when a trimmed support gives a poor inscribed-ball bound.
        for (auto it = classifiedPoints.rbegin(); it != classifiedPoints.rend(); ++it) {
            Cell span;
            for (int axis = 0; axis < 3; ++axis) {
                span.low[axis] = std::min(point.Coord(axis+1), it->first.Coord(axis+1));
                span.high[axis] = std::max(point.Coord(axis+1), it->first.Coord(axis+1));
            }
            if (!bounds->crosses(span.corners())) return it->second;
        }
        bool inside = false;
        size_t index = 0;
        for (auto& classifier : classifiers) {
            const auto known = sections[index++].contains(point,minimumDistance);
            if (known) {
                if (*known) { inside = true; break; }
                continue;
            }

            classifier->Perform(point, tolerance/10);
            if (classifier->State() == TopAbs_IN || classifier->State() == TopAbs_ON) { inside = true; break; }
            if (classifier->State() != TopAbs_OUT)
                throw std::runtime_error("Erosion could not classify the interior");
        }
        lastClassification = std::pair{point, inside};
        if (classifiedPoints.size() == 64) classifiedPoints.erase(classifiedPoints.begin());
        classifiedPoints.emplace_back(point, inside);
        const double radius = bounds ? lower(point)-tolerance : 0;
        if (radius > tolerance && balls.size() < 4096) balls.push_back({point, radius, inside});
        return inside;
    }
    double upper(const Cell& cell, double limit = -1, bool resolveTrim = false) {
        const double triangle = bounds->upper(cell.corners());
        if (triangle <= limit) return triangle;
        if (bounds->exact()) return std::min(triangle, clearance(cell.center()) + cell.radius());
        const auto center = cell.center();
        const double minimum = lower(center);
        const double upper = bounds->upper(center, limit-cell.radius()) + cell.radius();
        if (upper <= limit) return std::min(triangle, upper);
        if (!contains(center)) return std::min(triangle, cell.radius()-minimum);
        if (resolveTrim && limit > 0 && cell.radius() < limit/4 && upper-minimum-cell.radius() > tolerance)
            return std::min({triangle,upper,clearance(center)+cell.radius()});
        return std::min(triangle, upper);
    }
    bool deeper(const gp_Pnt& point, double depth) {
        return lower(point) > depth && contains(point);
    }
    bool childInside(const gp_Pnt& point, const gp_Pnt& parent, bool parentInside) {
        if (classifiers.empty()) return false;
        Cell span;
        for (int axis = 0; axis < 3; ++axis) {
            span.low[axis] = std::min(point.Coord(axis+1),parent.Coord(axis+1));
            span.high[axis] = std::max(point.Coord(axis+1),parent.Coord(axis+1));
        }
        // Classification can follow a subdivision edge only when the exact
        // surface bounds prove that its whole span is boundary-free.
        if (!bounds->crosses(span.corners())) return parentInside;
        return contains(point);
    }
    bool contains(const Cell& cell, std::optional<bool> centerInside = {}) {
        if (centerInside && !*centerInside) return false;
        const auto center = cell.center();
        const auto inside = [&] {
            if (!centerInside) centerInside = contains(center);
            return *centerInside;
        };
        for (const auto& ball : balls) {
            const double reach = ball.radius-cell.radius();
            if (reach > 0 && center.SquareDistance(ball.center) < reach*reach) return ball.inside;
        }
        for (const auto& planes : convex)
            if (!planes.empty() && std::all_of(planes.begin(), planes.end(), [&](const Plane& p) {
                    return p.clearance(center) - p.reach(cell) >= -tolerance/4;
                })) return true;
        const auto box = cell.bounds();
        // With no boundary crossing, classification at one point applies to
        // the whole connected cell. Face bounds are conservative and enlarged.
        if (classifiers.empty()) return false;
        if (!bounds->crosses(cell.corners())) return inside();
        if (std::none_of(faces.begin(), faces.end(), [&](const Bnd_Box& f) { return !f.IsOut(box); }))
            return inside();
        const double minimum = lower(center);
        if (minimum >= cell.radius() + tolerance && inside()) return true;
        // An upper bound below the cell radius cannot certify its distance
        // ball. Resolve remaining trimmed-face uncertainty with the kernel.
        if (bounds->upper(center, cell.radius()) < cell.radius() || !inside()) return false;
        return clearance(center) >= cell.radius() + tolerance/4;
    }
    double clearance(const gp_Pnt& point) {
        if (classifiers.empty()) return -std::numeric_limits<double>::infinity();
        if (convex.size() == 1 && !convex.front().empty()) {
            double distance = std::numeric_limits<double>::infinity();
            for (const auto& plane : convex.front()) distance = std::min(distance, plane.clearance(point));
            return distance; // Also an upper bound outside this convex solid.
        }
        if (bounds->exact()) {
            const double distance = lower(point);
            return contains(point) ? distance : -distance;
        }
        extrema.LoadS1(BRepBuilderAPI_MakeVertex(point).Shape());
        extrema.Perform();
        if (!extrema.IsDone()) throw std::runtime_error("Erosion could not bound distance to the body");
        const double distance = extrema.Value();
        if (!std::isfinite(distance)) throw std::runtime_error("Erosion returned a nonfinite distance");
        const bool inside = contains(point);
        if (distance > tolerance && balls.size() < 4096) balls.push_back({point, distance-tolerance, inside});
        return inside ? distance : -distance;
    }
};

}

TopoDS_Shape erosion::boundary(const TopoDS_Shape& shape) {
    TopoDS_Compound result;
    BRep_Builder builder; builder.MakeCompound(result);
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) builder.Add(result, f.Current());
    return result;
}

void erosion::checkCoverage(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth) {
    const auto [sourceFrame, candidateFrame] = coverageFrame(source, candidate);
    if (const auto covered = sphericalCoverage(sourceFrame, candidateFrame, depth)) {
        if (!*covered) throw std::runtime_error("Erosion discarded interior beyond the extra thickness allowance");
        return;
    }
    const auto root = innerBounds(sourceFrame, depth);
    for (int i = 0; i < 3; ++i) if (root.high[i]-root.low[i] <= tolerance/4) return;
    Distance original(sourceFrame), result(candidateFrame);
    const bool sectioned = result.sectioned();
    struct Region {
        Cell cell;
        double upper;
        std::optional<bool> inside;
        bool operator<(const Region& other) const { return upper < other.upper; }
    };
    std::priority_queue<Region> pending;
    const double coveredDepth = depth + tolerance/4;
    pending.push({root, original.upper(root,coveredDepth,sectioned),
                  sectioned ? std::optional(result.contains(root.center())) : std::nullopt});
    const auto start = std::chrono::steady_clock::now();
    size_t visits = 0;
    const auto limit = std::chrono::seconds(sectioned ? 30 : 8);
    while (!pending.empty()) {
        if (++visits > 100000 || std::chrono::steady_clock::now()-start > limit) {
            throw CoverageFailure("Erosion could not verify this allowance within the calculation limit",
                                  pending.top().upper, true);
        }
        const auto region = pending.top(); pending.pop();
        const auto& cell = region.cell;
        if (region.upper <= coveredDepth) continue;
        // Section children were checked before queuing. For other geometry,
        // retain source-first traversal and lazy point classification.
        if (!sectioned && result.contains(cell)) continue;
        if (original.deeper(cell.center(), depth + tolerance) &&
            !(region.inside ? *region.inside : result.contains(cell.center())))
            throw CoverageFailure("Erosion needs more allowance to preserve the required interior",
                                  region.upper, false);
        if (cell.radius() <= tolerance/16) {
            throw std::runtime_error("Erosion could not resolve an interior boundary within tolerance");
        }
        const auto [left, right] = subdivide(cell);
        // Largest unresolved clearance first: the queue's maximum is also a
        // conservative depth that covers every region not yet certified.
        // Cells wholly inside the result need no source-distance queries.
        // Otherwise stop an upper-bound search as soon as it proves the cell
        // is shallower than the required interior; its exact priority is moot.
        for (const auto& child : {left,right}) {
            std::optional<bool> inside;
            if (sectioned) {
                inside = result.childInside(child.center(),cell.center(),*region.inside);
                if (result.contains(child,inside)) continue;
            }
            const double upper = original.upper(child,coveredDepth,sectioned);
            if (upper > coveredDepth) pending.push({child,upper,inside});
        }
    }
}
