// Original Linux/ELF/Itanium ABI counts-only preload shim, no upstream code copied.
// Public SDK declaration: Geom_Line(const gp_Lin&). Baseline nm -D libTKG3d.so
// shows C1/C2 exported at the SAME address (0x91830 in this SDK).
// Compile (main only): c++ -O2 -std=c++20 -fPIC -shared
// -I.cache/kernel/sdk/include/opencascade tests/geometry-performance/trace-geom-line.cpp
// -ldl -o /tmp/trace-geom-line.so
// Caller owns compute lock. LD_PRELOAD this into untimed correctness/count runs.
// Counts all interposed gp_Lin constructors, not allocations or call sites.
// Hidden/inlined/-Bsymbolic calls may bypass this shim; zero is not proof of none.
// One stderr JSON at normal exit/EOF; SIGKILL/_Exit do not run the report.
// Do NOT define the C++ constructor body using Geom_Line headers: compiler-generated
// base initialization would happen before forwarding and initialize it twice.
#include <gp_Lin.hxx>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>

namespace {
using Constructor = void (*)(void*, const gp_Lin&);
struct Originals { Constructor c1; Constructor c2; bool aliases; };
std::atomic<std::uint64_t> calls{0}, completeCalls{0}, baseCalls{0}, nestedCalls{0};
std::atomic<bool> resolved{false}, resolvedAliases{false};
thread_local unsigned depth = 0;
Constructor find(const char* symbol) {
  dlerror();
  void* address = dlsym(RTLD_NEXT, symbol);
  const char* error = dlerror();
  if (error || !address) {
    std::fprintf(stderr, "trace-geom-line unresolved %s: %s\n", symbol, error ? error : "null");
    std::_Exit(127);
  }
  return reinterpret_cast<Constructor>(address);
}
const Originals& originals() {
  static const Originals value = [] {
    const auto c1 = find("_ZN9Geom_LineC1ERK6gp_Lin");
    const auto c2 = find("_ZN9Geom_LineC2ERK6gp_Lin");
    resolvedAliases.store(c1 == c2, std::memory_order_relaxed);
    resolved.store(true, std::memory_order_relaxed);
    return Originals{c1, c2, c1 == c2};
  }();
  return value;
}
struct Scope {
  Scope(bool complete) {
    if (depth++ == 0) {
      calls.fetch_add(1, std::memory_order_relaxed);
      (complete ? completeCalls : baseCalls).fetch_add(1, std::memory_order_relaxed);
    } else nestedCalls.fetch_add(1, std::memory_order_relaxed);
  }
  ~Scope() { --depth; }
};
void forward(bool complete, void* target, const gp_Lin& line) {
  const auto& original = originals();
  Scope scope(complete);
  // Original C1/C2 share the implementation in the baseline. Forward to the
  // matching original entry anyway; depth suppresses nested C1->C2 double counts.
  (complete ? original.c1 : original.c2)(target, line);
}
__attribute__((destructor)) void report() {
  std::fprintf(stderr,
    "{\"type\":\"geom_line_constructor_counts\",\"gp_lin_constructors\":%llu,"
    "\"complete_entries\":%llu,\"base_entries\":%llu,\"nested_entries_not_counted\":%llu,"
    "\"symbols_resolved\":%s,\"original_c1_c2_aliases\":%s}\n",
    static_cast<unsigned long long>(calls.load(std::memory_order_relaxed)),
    static_cast<unsigned long long>(completeCalls.load(std::memory_order_relaxed)),
    static_cast<unsigned long long>(baseCalls.load(std::memory_order_relaxed)),
    static_cast<unsigned long long>(nestedCalls.load(std::memory_order_relaxed)),
    resolved.load(std::memory_order_relaxed) ? "true" : "false",
    resolvedAliases.load(std::memory_order_relaxed) ? "true" : "false");
}
} // namespace

// Explicit-this ABI wrappers avoid any compiler-emitted Geom_Line base/member
// initialization. The gp_Lin argument remains a reference exactly as in the SDK.
extern "C" void complete(void*, const gp_Lin&) asm("_ZN9Geom_LineC1ERK6gp_Lin");
extern "C" void base(void*, const gp_Lin&) asm("_ZN9Geom_LineC2ERK6gp_Lin");
extern "C" void complete(void* target, const gp_Lin& line) { forward(true, target, line); }
extern "C" void base(void* target, const gp_Lin& line) { forward(false, target, line); }
