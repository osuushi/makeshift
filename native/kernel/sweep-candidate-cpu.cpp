#include "sweep-candidates.h"
#include <algorithm>
#include <numeric>
#include <limits>

namespace {
// Balanced spatial index supplies seeds for exact trimmed-face refinement.
class SampleIndex {
    const std::vector<SweepSample>& samples;
    std::vector<int> order;
    void build(size_t begin, size_t end, int axis) {
        if (begin == end) return;
        const auto middle = (begin + end) / 2;
        std::nth_element(order.begin() + begin, order.begin() + middle, order.begin() + end,
            [&](int a, int b) { return samples[a].point.Coord(axis) < samples[b].point.Coord(axis); });
        build(begin, middle, axis % 3 + 1);
        build(middle + 1, end, axis % 3 + 1);
    }
    void search(const gp_Pnt& point, size_t begin, size_t end, int axis,
                double& distance, int& closest) const {
        if (begin == end) return;
        const auto middle = (begin + end) / 2;
        const int index = order[middle];
        const auto& sample = samples[index].point;
        const double squared = sample.SquareDistance(point);
        if (squared < distance || (squared == distance && index < closest)) {
            distance = squared;
            closest = index;
        }
        const double delta = point.Coord(axis) - sample.Coord(axis);
        if (delta < 0) {
            search(point, begin, middle, axis % 3 + 1, distance, closest);
            if (delta * delta <= distance) search(point, middle + 1, end, axis % 3 + 1, distance, closest);
        } else {
            search(point, middle + 1, end, axis % 3 + 1, distance, closest);
            if (delta * delta <= distance) search(point, begin, middle, axis % 3 + 1, distance, closest);
        }
    }
public:
    explicit SampleIndex(const std::vector<SweepSample>& values) : samples(values), order(values.size()) {
        std::iota(order.begin(), order.end(), 0);
        build(0, order.size(), 1);
    }
    int nearest(const gp_Pnt& point) const {
        double distance = std::numeric_limits<double>::infinity();
        int result = -1;
        search(point, 0, order.size(), 1, distance, result);
        return result;
    }
};
}
std::vector<int> sweepCpuCandidates(const std::vector<SweepSample>& samples,
                                   const std::vector<gp_Pnt>& points) {
    SampleIndex index(samples);
    std::vector<int> result;
    result.reserve(points.size());
    for (const auto& point : points) result.push_back(index.nearest(point));
    return result;
}
