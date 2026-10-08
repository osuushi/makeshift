// Original Linux ELF preload counter; public OCCT declarations checked in 7.9.3.
// Compile (main agent only): c++ -O2 -std=c++20 -fPIC -shared
// -I.cache/kernel/sdk/include/opencascade tests/geometry-performance/trace-evaluations.cpp
// -ldl -o /tmp/trace-evaluations.so
// Run under shared compute lock: LD_PRELOAD=/tmp/trace-evaluations.so volume-kernel ...
// Profiling COUNTS only. Atomic increments/interposition invalidate timing comparisons.
// No SDK objects are constructed; definitions forward immediately to RTLD_NEXT.
#include <BSplSLib_Cache.hxx>
#include <PLib.hxx>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>

namespace {
constexpr int bins = 64;
struct Counts {
  std::atomic<std::uint64_t> calls{0};
  std::atomic<std::uint64_t> degrees[bins]{};
  std::atomic<std::uint64_t> otherDegree{0};
  void add(int degree) {
    calls.fetch_add(1, std::memory_order_relaxed);
    if (degree >= 0 && degree < bins) degrees[degree].fetch_add(1, std::memory_order_relaxed);
    else otherDegree.fetch_add(1, std::memory_order_relaxed);
  }
};
std::atomic<std::uint64_t> d1Calls{0};
Counts eval, noDerivative;
template <typename Function> Function next(const char* symbol) {
  dlerror();
  void* address = dlsym(RTLD_NEXT, symbol);
  const char* error = dlerror();
  if (error || !address) {
    std::fprintf(stderr, "trace-evaluations unresolved %s: %s\n", symbol, error ? error : "null");
    std::_Exit(127);
  }
  return reinterpret_cast<Function>(address);
}
void print(const char* name, const Counts& counts) {
  std::fprintf(stderr, "\"%s\":{\"calls\":%llu,\"degree_histogram\":{", name,
               static_cast<unsigned long long>(counts.calls.load(std::memory_order_relaxed)));
  bool comma = false;
  for (int degree = 0; degree < bins; ++degree) {
    const auto count = counts.degrees[degree].load(std::memory_order_relaxed);
    if (!count) continue;
    std::fprintf(stderr, "%s\"%d\":%llu", comma ? "," : "", degree,
                 static_cast<unsigned long long>(count));
    comma = true;
  }
  std::fprintf(stderr, "},\"other_degree\":%llu}",
               static_cast<unsigned long long>(counts.otherDegree.load(std::memory_order_relaxed)));
}
__attribute__((destructor)) void report() {
  std::fprintf(stderr, "{\"type\":\"evaluation_counts\",\"d1_calls\":%llu,",
               static_cast<unsigned long long>(d1Calls.load(std::memory_order_relaxed)));
  print("eval_polynomial", eval);
  std::fputc(',', stderr);
  print("no_derivative_eval_polynomial", noDerivative);
  std::fputs("}\n", stderr);
}
} // namespace

void BSplSLib_Cache::D1(const Standard_Real& u, const Standard_Real& v,
                      gp_Pnt& point, gp_Vec& tangentU, gp_Vec& tangentV) const {
  using Function = void (*)(const BSplSLib_Cache*, const Standard_Real&, const Standard_Real&,
                            gp_Pnt&, gp_Vec&, gp_Vec&);
  static const auto original = next<Function>("_ZNK14BSplSLib_Cache2D1ERKdS1_R6gp_PntR6gp_VecS5_");
  d1Calls.fetch_add(1, std::memory_order_relaxed);
  original(this, u, v, point, tangentU, tangentV);
}
void PLib::EvalPolynomial(const Standard_Real u, const Standard_Integer derivativeOrder,
                         const Standard_Integer degree, const Standard_Integer dimension,
                         Standard_Real& coefficients, Standard_Real& results) {
  using Function = void (*)(Standard_Real, Standard_Integer, Standard_Integer, Standard_Integer,
                            Standard_Real&, Standard_Real&);
  static const auto original = next<Function>("_ZN4PLib14EvalPolynomialEdiiiRdS0_");
  eval.add(degree);
  original(u, derivativeOrder, degree, dimension, coefficients, results);
}
void PLib::NoDerivativeEvalPolynomial(const Standard_Real u, const Standard_Integer degree,
                                     const Standard_Integer dimension,
                                     const Standard_Integer degreeDimension,
                                     Standard_Real& coefficients, Standard_Real& results) {
  using Function = void (*)(Standard_Real, Standard_Integer, Standard_Integer, Standard_Integer,
                            Standard_Real&, Standard_Real&);
  static const auto original = next<Function>("_ZN4PLib26NoDerivativeEvalPolynomialEdiiiRdS0_");
  noDerivative.add(degree);
  original(u, degree, dimension, degreeDimension, coefficients, results);
}
