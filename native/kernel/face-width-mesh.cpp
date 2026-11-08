#include "face-width-mesh.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>

namespace face_width {
namespace {
double distance2(const gp_Pnt &p, const Segment &edge) {
    const gp_XYZ delta = edge[1].XYZ() - edge[0].XYZ();
    const double length = delta.SquareModulus();
    const double t =
        length > 0 ? std::clamp((p.XYZ() - edge[0].XYZ()).Dot(delta) / length, 0.0, 1.0) : 0;
    return p.SquareDistance(gp_Pnt(edge[0].XYZ() + delta * t));
}
struct Box {
    gp_XYZ lo{INFINITY, INFINITY, INFINITY}, hi{-INFINITY, -INFINITY, -INFINITY};
    void add(const gp_Pnt &p) {
        for (int a = 1; a <= 3; ++a) {
            lo.SetCoord(a, std::min(lo.Coord(a), p.Coord(a)));
            hi.SetCoord(a, std::max(hi.Coord(a), p.Coord(a)));
        }
    }
    double distance2(const gp_Pnt &p) const {
        double d = 0;
        for (int a = 1; a <= 3; ++a) {
            const double v = std::max({lo.Coord(a) - p.Coord(a), 0.0, p.Coord(a) - hi.Coord(a)});
            d += v * v;
        }
        return d;
    }
};
struct Node {
    Box box;
    size_t begin = 0, end = 0;
    int left = -1, right = -1;
};
class Perimeter {
    const std::vector<Segment> &edges;
    std::vector<size_t> order;
    std::vector<Node> nodes;
    int build(size_t begin, size_t end) {
        Node node;
        node.begin = begin;
        node.end = end;
        for (size_t i = begin; i < end; ++i)
            for (const auto &p : edges[order[i]])
                node.box.add(p);
        const int index = static_cast<int>(nodes.size());
        nodes.push_back(node);
        if (end - begin <= 8)
            return index;
        const auto extent = node.box.hi - node.box.lo;
        int axis = 1;
        for (int a = 2; a <= 3; ++a)
            if (extent.Coord(a) > extent.Coord(axis))
                axis = a;
        const size_t mid = begin + (end - begin) / 2;
        std::nth_element(order.begin() + begin, order.begin() + mid, order.begin() + end,
                         [&](size_t a, size_t b) {
                             return edges[a][0].Coord(axis) + edges[a][1].Coord(axis) <
                                    edges[b][0].Coord(axis) + edges[b][1].Coord(axis);
                         });
        const int left = build(begin, mid), right = build(mid, end);
        nodes[index].left = left;
        nodes[index].right = right;
        return index;
    }
    void visit(int index, const gp_Pnt &p, double &best, size_t &edge) const {
        const auto &node = nodes[index];
        if (node.box.distance2(p) > best)
            return;
        if (node.left < 0) {
            for (size_t i = node.begin; i < node.end; ++i) {
                const double d = distance2(p, edges[order[i]]);
                if (d < best) {
                    best = d;
                    edge = order[i];
                }
            }
        } else {
            int a = node.left, b = node.right;
            if (nodes[a].box.distance2(p) > nodes[b].box.distance2(p))
                std::swap(a, b);
            visit(a, p, best, edge);
            visit(b, p, best, edge);
        }
    }

  public:
    explicit Perimeter(const std::vector<Segment> &segments)
        : edges(segments), order(segments.size()) {
        std::iota(order.begin(), order.end(), 0);
        build(0, order.size());
    }
    std::pair<double, size_t> nearest(const gp_Pnt &p) const {
        double best = INFINITY;
        size_t edge = 0;
        visit(0, p, best, edge);
        return {best, edge};
    }
};
gp_Pnt middle(const gp_Pnt &a, const gp_Pnt &b) { return gp_Pnt((a.XYZ() + b.XYZ()) / 2); }
struct Bounds {
    double lower = 0, upper = INFINITY;
};
Bounds bounds(const Triangle &triangle, const std::vector<Segment> &edges,
              const Perimeter &perimeter) {
    Bounds result;
    const std::array<gp_Pnt, 7> samples{
        triangle[0],
        triangle[1],
        triangle[2],
        middle(triangle[0], triangle[1]),
        middle(triangle[1], triangle[2]),
        middle(triangle[2], triangle[0]),
        gp_Pnt((triangle[0].XYZ() + triangle[1].XYZ() + triangle[2].XYZ()) / 3)};
    for (const auto &point : samples) {
        const auto [distance, index] = perimeter.nearest(point);
        result.lower = std::max(result.lower, distance);
        double upper = 0;
        for (const auto &vertex : triangle)
            upper = std::max(upper, distance2(vertex, edges[index]));
        // Distance to one segment is convex: its vertex maximum bounds the
        // whole triangle. Nearest-boundary distance is no larger than that.
        result.upper = std::min(result.upper, upper);
    }
    return result;
}
} // namespace
Class classify(const Mesh &mesh, double width, size_t workLimit) {
    if (mesh.triangles.empty() || !(width > 0) || !std::isfinite(width))
        return Class::uncertain;
    const auto finite = [](const gp_Pnt &p) {
        return std::isfinite(p.X()) && std::isfinite(p.Y()) && std::isfinite(p.Z());
    };
    for (const auto &triangle : mesh.triangles)
        for (const auto &p : triangle)
            if (!finite(p))
                return Class::uncertain;
    for (const auto &edge : mesh.perimeter)
        for (const auto &p : edge)
            if (!finite(p))
                return Class::uncertain;
    if (mesh.perimeter.empty())
        return Class::wide; // Closed face has no boundary to collapse onto.
    const Perimeter perimeter(mesh.perimeter);
    const double radius2 = width * width / 4;
    std::vector<Triangle> pending = mesh.triangles;
    size_t work = 0;
    while (!pending.empty()) {
        if (++work > workLimit)
            return Class::uncertain;
        const auto triangle = pending.back();
        pending.pop_back();
        const auto b = bounds(triangle, mesh.perimeter, perimeter);
        if (b.lower > radius2)
            return Class::wide;
        if (b.upper <= radius2)
            continue;
        const auto ab = middle(triangle[0], triangle[1]), bc = middle(triangle[1], triangle[2]),
                   ca = middle(triangle[2], triangle[0]);
        if (ab.IsEqual(triangle[0], 0) || bc.IsEqual(triangle[1], 0) || ca.IsEqual(triangle[2], 0))
            return Class::uncertain;
        pending.push_back({triangle[0], ab, ca});
        pending.push_back({ab, triangle[1], bc});
        pending.push_back({ca, bc, triangle[2]});
        pending.push_back({ab, bc, ca});
    }
    return Class::thin;
}
} // namespace face_width
