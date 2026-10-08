// Original Linux ELF counts-only preload; pinned OCCT 7.9.3 declarations/symbols.
// Orchestrator build: c++ -O2 -std=c++20 -fPIC -shared
// -I.cache/kernel/sdk/include/opencascade tests/geometry-performance/trace-thickness-rays.cpp
// -ldl -o /tmp/trace-thickness-rays.so
// Serial diagnostic only: LD_PRELOAD=... KERNEL. No latency/memory inference.
// Does not cache results, change queries, or construct OCCT objects.
#include <IntCurvesFace_ShapeIntersector.hxx>
#include <gp_Lin.hxx>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>
#include <mutex>
#include <unordered_map>
#include <unordered_set>

namespace {
using Key = std::array<std::uint64_t, 8>;
constexpr std::size_t keyLimit = 8192, ownerLimit = 64;
struct Hash {
  std::size_t operator()(const Key& key) const {
    std::size_t hash = 0;
    for (const auto value : key)
      hash ^= std::hash<std::uint64_t>{}(value) + 0x9e3779b9 + (hash << 6) + (hash >> 2);
    return hash;
  }
};
struct Owner {
  std::uint64_t generation = 0, queries = 0, finite = 0, repeated = 0;
  std::uint64_t notStored = 0;
  std::unordered_set<Key, Hash> keys;
};
struct Store {
  std::mutex mutex;
  std::unordered_map<const IntCurvesFace_ShapeIntersector*, Owner> owners;
  std::uint64_t generation = 0, loads = 0, unknownQueries = 0;
};
Store& store() {
  // Intentional process-lifetime storage: destructor-report ordering is explicit.
  static auto* value = new Store;
  return *value;
}
template <typename Function> Function next(const char* symbol) {
  dlerror();
  void* address = dlsym(RTLD_NEXT, symbol);
  const char* error = dlerror();
  if (error || !address) {
    std::fprintf(stderr, "trace-thickness-rays unresolved %s: %s\n",
                 symbol, error ? error : "null");
    std::_Exit(127);
  }
  return reinterpret_cast<Function>(address);
}
void reportOwner(const void* pointer, const Owner& value, const char* reason) {
  std::fprintf(stderr,
    "{\"type\":\"thickness_ray_counts\",\"owner\":\"%p\",\"generation\":%llu,"
    "\"reason\":\"%s\",\"queries\":%llu,\"finiteQueries\":%llu,"
    "\"repeatedExactQueries\":%llu,\"storedUniqueFiniteKeys\":%zu,"
    "\"notStoredDueToCap\":%llu,\"keyLimit\":%zu}\n",
    pointer, static_cast<unsigned long long>(value.generation), reason,
    static_cast<unsigned long long>(value.queries),
    static_cast<unsigned long long>(value.finite),
    static_cast<unsigned long long>(value.repeated), value.keys.size(),
    static_cast<unsigned long long>(value.notStored), keyLimit);
}
void loaded(const IntCurvesFace_ShapeIntersector* pointer) {
  auto& state = store();
  std::lock_guard lock(state.mutex);
  ++state.loads;
  auto found = state.owners.find(pointer);
  if (found != state.owners.end()) {
    reportOwner(pointer, found->second, "load-reset");
    state.owners.erase(found);
  }
  if (state.owners.size() >= ownerLimit) {
    // Evicted owners' later queries count as unknown until their next Load.
    const auto victim = state.owners.begin();
    reportOwner(victim->first, victim->second, "owner-cap-eviction");
    state.owners.erase(victim);
  }
  auto& owner = state.owners[pointer];
  owner.generation = ++state.generation;
}
void query(const IntCurvesFace_ShapeIntersector* pointer, const gp_Lin& line,
           double minimum, double maximum) {
  const auto& point = line.Location();
  const auto& direction = line.Direction();
  const std::array<double, 8> fields = {point.X(), point.Y(), point.Z(),
    direction.X(), direction.Y(), direction.Z(), minimum, maximum};
  Key key{};
  bool finite = true;
  for (std::size_t i = 0; i < fields.size(); ++i) {
    finite = finite && std::isfinite(fields[i]);
    key[i] = std::bit_cast<std::uint64_t>(fields[i]);
  }
  auto& state = store();
  std::lock_guard lock(state.mutex);
  const auto found = state.owners.find(pointer);
  if (found == state.owners.end()) { ++state.unknownQueries; return; }
  auto& owner = found->second;
  ++owner.queries;
  if (!finite) return;
  ++owner.finite;
  if (owner.keys.contains(key)) ++owner.repeated;
  else if (owner.keys.size() < keyLimit) owner.keys.insert(key);
  else ++owner.notStored;
}
__attribute__((destructor)) void report() {
  auto& state = store();
  std::lock_guard lock(state.mutex);
  for (const auto& [pointer, owner] : state.owners) reportOwner(pointer, owner, "exit");
  std::fprintf(stderr,
    "{\"type\":\"thickness_ray_totals\",\"successfulLoads\":%llu,"
    "\"unknownOwnerQueries\":%llu,\"ownerLimit\":%zu}\n",
    static_cast<unsigned long long>(state.loads),
    static_cast<unsigned long long>(state.unknownQueries), ownerLimit);
}
} // namespace

void IntCurvesFace_ShapeIntersector::Load(const TopoDS_Shape& shape, const Standard_Real tolerance) {
  using Function = void (*)(IntCurvesFace_ShapeIntersector*, const TopoDS_Shape&, Standard_Real);
  static const auto original = next<Function>(
    "_ZN30IntCurvesFace_ShapeIntersector4LoadERK12TopoDS_Shaped");
  original(this, shape, tolerance);
  loaded(this);
}
void IntCurvesFace_ShapeIntersector::Perform(const gp_Lin& line,
                                          const Standard_Real minimum,
                                          const Standard_Real maximum) {
  using Function = void (*)(IntCurvesFace_ShapeIntersector*, const gp_Lin&, Standard_Real, Standard_Real);
  static const auto original = next<Function>(
    "_ZN30IntCurvesFace_ShapeIntersector7PerformERK6gp_Lindd");
  query(this, line, minimum, maximum);
  original(this, line, minimum, maximum);
}
