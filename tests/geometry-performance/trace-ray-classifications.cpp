// Original Linux/ELF/Itanium ABI counts-only shim; no upstream code copied.
// OCCT 7.9.3 baseline a016080bf6738d6aeae020badee4e888ad1540a5:
// https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTopAdaptor/BRepTopAdaptor_TopolTool.hxx#L69
// https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTopAdaptor/BRepTopAdaptor_TopolTool.cxx#L176
// One non-const public virtual overload: Classify(const gp_Pnt2d&, double, bool).
// RecadreOnPeriodic defaults to true at the caller; all three args are forwarded.
// Symbol derived from SDK declaration, not yet checked with nm/build in this lane:
// _ZN24BRepTopAdaptor_TopolTool8ClassifyERK8gp_Pnt2ddb
// Compile (main only): c++ -O2 -std=c++20 -fPIC -shared
// -I.cache/kernel/sdk/include/opencascade tests/geometry-performance/trace-ray-classifications.cpp
// -ldl -o /tmp/trace-ray-classifications.so
// Main holds compute lock. Pair with thickness ray trace in untimed runs only.
// Counts all interposed calls, not just thickness rays. Hidden/inlined/-Bsymbolic
// calls and subclass overrides can bypass it. No counter-based speed claim.
// Exceptions are counted and rethrown unchanged; normal exit/EOF emits one JSON.
// SIGKILL/_Exit bypass the report; atomic increments invalidate native timings.
#include <BRepTopAdaptor_TopolTool.hxx>
#include <gp_Pnt2d.hxx>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>
#include <type_traits>

extern "C" TopAbs_State classify_trace(BRepTopAdaptor_TopolTool*, const gp_Pnt2d&,
                                       Standard_Real, Standard_Boolean)
  asm("_ZN24BRepTopAdaptor_TopolTool8ClassifyERK8gp_Pnt2ddb");

namespace {
using Member = TopAbs_State (BRepTopAdaptor_TopolTool::*)(const gp_Pnt2d&,
                                                        Standard_Real, Standard_Boolean);
static_assert(std::is_same_v<decltype(&BRepTopAdaptor_TopolTool::Classify), Member>);
using Function = TopAbs_State (*)(BRepTopAdaptor_TopolTool*, const gp_Pnt2d&,
                                Standard_Real, Standard_Boolean);
std::atomic<std::uint64_t> attempts{0}, inside{0}, outside{0}, on{0}, unknown{0};
std::atomic<std::uint64_t> exceptions{0}, unexpected{0};
std::atomic<bool> resolved{false};
Function original() {
  static const Function value = [] {
    constexpr const char* symbol = "_ZN24BRepTopAdaptor_TopolTool8ClassifyERK8gp_Pnt2ddb";
    dlerror();
    void* address = dlsym(RTLD_NEXT, symbol);
    const char* error = dlerror();
    const auto target = reinterpret_cast<Function>(address);
    if (error || !target || target == &classify_trace) {
      std::fprintf(stderr, "trace-ray-classifications unresolved/recursive %s: %s\n",
                   symbol, error ? error : "null or self alias");
      std::_Exit(127);
    }
    resolved.store(true, std::memory_order_relaxed);
    return target;
  }(); // C++ guarantees one thread-safe resolution, no SDK state initialized here.
  return value;
}
void returned(TopAbs_State state) {
  switch (state) {
    case TopAbs_IN: inside.fetch_add(1, std::memory_order_relaxed); break;
    case TopAbs_OUT: outside.fetch_add(1, std::memory_order_relaxed); break;
    case TopAbs_ON: on.fetch_add(1, std::memory_order_relaxed); break;
    case TopAbs_UNKNOWN: unknown.fetch_add(1, std::memory_order_relaxed); break;
    default: unexpected.fetch_add(1, std::memory_order_relaxed); break;
  }
}
unsigned long long count(const std::atomic<std::uint64_t>& value) {
  return static_cast<unsigned long long>(value.load(std::memory_order_relaxed));
}
__attribute__((destructor)) void report() {
  std::fprintf(stderr,
    "{\"type\":\"thickness_ray_classifications\",\"attempts\":%llu,"
    "\"IN\":%llu,\"OUT\":%llu,\"ON\":%llu,\"UNKNOWN\":%llu,"
    "\"exceptions\":%llu,\"unexpected_states\":%llu,\"symbol_resolved\":%s}\n",
    count(attempts), count(inside), count(outside), count(on), count(unknown),
    count(exceptions), count(unexpected), resolved.load(std::memory_order_relaxed) ? "true" : "false");
}
} // namespace

extern "C" TopAbs_State classify_trace(BRepTopAdaptor_TopolTool* self, const gp_Pnt2d& point,
                                       Standard_Real tolerance, Standard_Boolean recadre) {
  const auto function = original(); // Resolve before accounting the real SDK call.
  attempts.fetch_add(1, std::memory_order_relaxed);
  try {
    const auto result = function(self, point, tolerance, recadre);
    returned(result);
    return result;
  } catch (...) {
    exceptions.fetch_add(1, std::memory_order_relaxed);
    throw;
  }
}
