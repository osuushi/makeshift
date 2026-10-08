// Original Linux ELF public-API preload diagnostic; COUNTS ONLY, no timing claims.
// OCCT 7.9.3 pin a016080bf6738d6aeae020badee4e888ad1540a5.
// Symbols verified with nm -D against .cache/kernel/sdk/lib/libTKMath.so.
// Compile/run only under /tmp/makeshift-geometry-compute.lock:
// c++ -O2 -std=c++20 -fPIC -shared -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/trace-kronrod-iterations.cpp -ldl -o /tmp/trace-kronrod.so
// LD_PRELOAD=/tmp/trace-kronrod.so EXECUTABLE ...
// Atomic counters support multiple workers; they invalidate benchmark timings.
#include <math_KronrodSingleIntegration.hxx>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>

namespace {
constexpr int iterationBins = 1002, orderBins = 256;
constexpr const char* noToleranceSymbol =
    "_ZN29math_KronrodSingleIntegration7PerformER13math_Functionddi";
constexpr const char* toleranceSymbol =
    "_ZN29math_KronrodSingleIntegration7PerformER13math_Functionddidi";
using Counter = std::atomic<std::uint64_t>;
void increment(Counter& counter, std::uint64_t value = 1) {
    counter.fetch_add(value, std::memory_order_relaxed);
}
std::uint64_t value(const Counter& counter) { return counter.load(std::memory_order_relaxed); }
struct Counts {
    Counter entered{}, returned{}, failed{}, threw{}, succeeded{}, refining{}, overTolerance{};
    Counter iterations{}, completedSplits{}, approximateRuleSampleCalls{};
    Counter otherIterations{}, otherOrder{};
    std::array<Counter, iterationBins> iterationHistogram{};
    std::array<Counter, orderBins> orderHistogram{};
};
void histogram(const char* label, const Counter* bins, int count) {
    std::fprintf(stderr, "\"%s\":{", label);
    bool comma = false;
    for (int i = 0; i < count; ++i) {
        const auto n = value(bins[i]);
        if (!n) continue;
        std::fprintf(stderr, "%s\"%d\":%llu", comma ? "," : "", i,
                     static_cast<unsigned long long>(n));
        comma = true;
    }
    std::fputs("}", stderr);
}
void print(const char* label, const Counts& counts) {
    std::fprintf(stderr, "\"%s\":{\"entered\":%llu,\"returned\":%llu,\"failed\":%llu,"
        "\"threw\":%llu,\"succeeded\":%llu,\"successful_refining_calls\":%llu,"
        "\"successful_above_requested_tolerance\":%llu,\"successful_iterations_sum\":%llu,"
        "\"successful_completed_splits_sum\":%llu,\"successful_stored_splits_lower_bound\":%llu,"
        "\"successful_rule_sample_calls_estimate\":%llu,"
        "\"other_iteration_count\":%llu,\"other_order_count\":%llu,",
        label, static_cast<unsigned long long>(value(counts.entered)),
        static_cast<unsigned long long>(value(counts.returned)),
        static_cast<unsigned long long>(value(counts.failed)),
        static_cast<unsigned long long>(value(counts.threw)),
        static_cast<unsigned long long>(value(counts.succeeded)),
        static_cast<unsigned long long>(value(counts.refining)),
        static_cast<unsigned long long>(value(counts.overTolerance)),
        static_cast<unsigned long long>(value(counts.iterations)),
        static_cast<unsigned long long>(value(counts.completedSplits)),
        static_cast<unsigned long long>(value(counts.completedSplits) - value(counts.refining)),
        static_cast<unsigned long long>(value(counts.approximateRuleSampleCalls)),
        static_cast<unsigned long long>(value(counts.otherIterations)),
        static_cast<unsigned long long>(value(counts.otherOrder)));
    histogram("successful_iteration_histogram", counts.iterationHistogram.data(), iterationBins);
    std::fputc(',', stderr);
    histogram("successful_order_histogram", counts.orderHistogram.data(), orderBins);
    std::fputc('}', stderr);
}
struct Trace {
    Counts noTolerance, tolerance;
    ~Trace() {
        std::fputs("{\"type\":\"kronrod_iteration_counters\",\"occt_pin\":"
            "\"a016080bf6738d6aeae020badee4e888ad1540a5\",\"diagnostic_only\":true,"
            "\"note\":\"IsDone means evaluation success, not convergence. Samples are inferred "
            "only for successful complete rules; failed callbacks are excluded. Completed splits "
            "may include a final split not stored on stagnation return. Direct GKRule calls, "
            "geometry D1 calls, bypassed bindings and thrown calls are not estimated.\",", stderr);
        print("without_tolerance", noTolerance);
        std::fputc(',', stderr);
        print("with_tolerance", tolerance);
        std::fputs("}\n", stderr);
    }
} trace;
template <typename Function> Function next(const char* symbol) {
    dlerror();
    void* address = dlsym(RTLD_NEXT, symbol);
    const char* error = dlerror();
    if (error || !address) {
        std::fprintf(stderr, "trace-kronrod unresolved %s: %s\n", symbol, error ? error : "null");
        std::_Exit(127);
    }
    return reinterpret_cast<Function>(address);
}
void record(Counts& counts, const math_KronrodSingleIntegration& integral,
            bool hasTolerance, double tolerance) {
    increment(counts.returned);
    if (!integral.IsDone()) { increment(counts.failed); return; }
    increment(counts.succeeded);
    const int iterations = integral.NbIterReached(), order = integral.OrderReached();
    if (iterations >= 0 && iterations < iterationBins) increment(counts.iterationHistogram[iterations]);
    else increment(counts.otherIterations);
    if (order >= 0 && order < orderBins) increment(counts.orderHistogram[order]);
    else increment(counts.otherOrder);
    if (iterations > 0) increment(counts.iterations, static_cast<std::uint64_t>(iterations));
    if (iterations > 1) {
        increment(counts.refining);
        increment(counts.completedSplits, static_cast<std::uint64_t>(iterations - 1));
    }
    if (iterations > 0 && order > 0)
        increment(counts.approximateRuleSampleCalls,
                  static_cast<std::uint64_t>(order) * (2ULL * static_cast<unsigned>(iterations) - 1ULL));
    if (hasTolerance && (!std::isfinite(integral.ErrorReached()) || integral.ErrorReached() > tolerance))
        increment(counts.overTolerance);
}
}
void math_KronrodSingleIntegration::Perform(math_Function& function,
    const Standard_Real lower, const Standard_Real upper, const Standard_Integer points) {
    using Function = void (*)(math_KronrodSingleIntegration*, math_Function&, double, double, int);
    static const auto original = next<Function>(noToleranceSymbol);
    increment(trace.noTolerance.entered);
    try {
        original(this, function, lower, upper, points);
    } catch (...) {
        increment(trace.noTolerance.threw);
        throw;
    }
    record(trace.noTolerance, *this, false, 0.);
}
void math_KronrodSingleIntegration::Perform(math_Function& function,
    const Standard_Real lower, const Standard_Real upper, const Standard_Integer points,
    const Standard_Real tolerance, const Standard_Integer maxIterations) {
    using Function = void (*)(math_KronrodSingleIntegration*, math_Function&, double, double, int, double, int);
    static const auto original = next<Function>(toleranceSymbol);
    increment(trace.tolerance.entered);
    try {
        original(this, function, lower, upper, points, tolerance, maxIterations);
    } catch (...) {
        increment(trace.tolerance.threw);
        throw;
    }
    record(trace.tolerance, *this, true, tolerance);
}
