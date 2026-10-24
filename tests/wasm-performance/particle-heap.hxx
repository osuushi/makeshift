// Original bounded experiment: preserve the first-maximum selection of OCCT's
// std::max_element while replacing only a decreased root. The pool's initializer
// changes no other particle until this heap is no longer used. No ABI changes.
#pragma once
#include <math_PSOParticlesPool.hxx>
#include <algorithm>
#include <vector>
#ifdef MAKESHIFT_PARTICLE_TRACE
#include <atomic>
#include <cstdio>
struct ParticleHeapTrace {
    std::atomic<std::size_t> constructions{0}, updates{0};
    ~ParticleHeapTrace() {
        std::fprintf(stderr, "particle-heap constructions=%zu updates=%zu\n",
                     constructions.load(), updates.load());
    }
};
inline ParticleHeapTrace particleHeapTrace;
#endif

class StableParticleHeap {
    struct Entry { PSO_Particle* particle; int index; };
    std::vector<Entry> entries;
    static bool less(const Entry& a, const Entry& b) {
        if (a.particle->Distance != b.particle->Distance)
            return a.particle->Distance < b.particle->Distance;
        return a.index > b.index;
    }
public:
    StableParticleHeap(math_PSOParticlesPool& pool, int count) {
#ifdef MAKESHIFT_PARTICLE_TRACE
        ++particleHeapTrace.constructions;
#endif
        entries.reserve(count);
        for (int i = 1; i <= count; ++i) entries.push_back({pool.GetParticle(i), i});
        std::make_heap(entries.begin(), entries.end(), less);
    }
    PSO_Particle* Worst() const { return entries.front().particle; }
    PSO_Particle* DecreasedWorst() {
#ifdef MAKESHIFT_PARTICLE_TRACE
        ++particleHeapTrace.updates;
#endif
        std::size_t parent = 0;
        while (parent * 2 + 1 < entries.size()) {
            auto child = parent * 2 + 1;
            if (child + 1 < entries.size() && less(entries[child], entries[child + 1])) ++child;
            if (!less(entries[parent], entries[child])) break;
            std::swap(entries[parent], entries[child]);
            parent = child;
        }
        return Worst();
    }
};
