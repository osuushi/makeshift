// Compare each selected pool slot, not just the final minimum. Ordering affects
// subsequent PSO trajectories, including deterministic random-number consumption.
#include "particle-heap.hxx"
#include <cassert>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>

int main() {
    std::uint32_t random = 12345;
    std::size_t changes = 0;
    for (int count : {1, 2, 3, 48, 127}) {
        math_PSOParticlesPool baseline(count, 3), candidate(count, 3);
        StableParticleHeap heap(candidate, count);
        for (int step = 0; step < 100000; ++step) {
            auto* a = baseline.GetWorstParticle();
            auto* b = heap.Worst();
            assert(a - baseline.GetParticle(1) == b - candidate.GetParticle(1));
            assert(a->Distance == b->Distance);
            random = random * 1664525u + 1013904223u;
            double distance = step % 2 ? -(step / 8) : static_cast<double>(random % 97);
            if (step % 17 == 0) distance = std::numeric_limits<double>::quiet_NaN();
            if (step % 19 == 0) distance = std::numeric_limits<double>::infinity();
            if (distance < a->Distance) {
                a->Distance = distance;
                b->Distance = distance;
                heap.DecreasedWorst();
                ++changes;
            }
        }
    }
    std::cout << "500000 slot comparisons and " << changes << " replacements agree\n";
}
