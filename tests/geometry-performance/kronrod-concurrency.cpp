// Original public-API first-use table-cache diagnostic; no upstream code copied.
// Compile (main only): c++ -O2 -std=c++20 -pthread
// -I.cache/kernel/sdk/include/opencascade tests/geometry-performance/kronrod-concurrency.cpp
// -L.cache/kernel/sdk/lib -Wl,-rpath,$PWD/.cache/kernel/sdk/lib -lTKMath -lTKernel
// -o /tmp/kronrod-concurrency
// Run fresh processes against baseline and preload variants; compare raw outputs.
// No serial integrations before the barrier: six table orders first initialize
// concurrently with four independent callers per order, two per Perform overload.
// All math_Function and
// integrator state is private to a worker. Output order is deterministic.
// Limits: one smooth scalar function, orders 5..15, one first-use wave/process;
// repeat fresh processes to exercise scheduler variation. This is not a race
// detector, exhaustive rule test, speed benchmark, or accuracy certificate.
#include <math_Function.hxx>
#include <math_KronrodSingleIntegration.hxx>
#include <Standard_Failure.hxx>
#include <array>
#include <barrier>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <thread>
#include <vector>

class Function : public math_Function {
public:
  Standard_Boolean Value(const Standard_Real x, Standard_Real& value) override {
    ++calls;
    value = std::exp(x) + x * x;
    return true;
  }
  std::uint64_t calls = 0;
};
struct Result {
  bool done = false;
  bool exception = false;
  double value = 0;
  double error = 0;
  double absoluteError = 0;
  int iterations = 0;
  int reachedOrder = 0;
  std::uint64_t calls = 0;
};
Result integrate(int order, bool adaptive) {
  Function function;
  math_KronrodSingleIntegration integral;
  Result result;
  try {
    if (adaptive) integral.Perform(function, 0, 1, order, 1e-10, 1000);
    else integral.Perform(function, 0, 1, order);
    result.done = integral.IsDone();
    if (result.done) {
      result.value = integral.Value();
      result.error = integral.ErrorReached();
      result.absoluteError = integral.AbsolutError();
      result.iterations = integral.NbIterReached();
      result.reachedOrder = integral.OrderReached();
    }
  } catch (const Standard_Failure&) { result.exception = true; }
  result.calls = function.calls;
  return result;
}
std::uint64_t bits(double value) { return std::bit_cast<std::uint64_t>(value); }
bool equal(const Result& a, const Result& b) {
  return a.done == b.done && a.exception == b.exception && bits(a.value) == bits(b.value)
    && bits(a.error) == bits(b.error) && bits(a.absoluteError) == bits(b.absoluteError)
    && a.iterations == b.iterations && a.reachedOrder == b.reachedOrder && a.calls == b.calls;
}
void record(int order, int worker, int iteration, bool adaptive, const Result& result, const Result& serial) {
  // IEEE bit strings avoid decimal formatting and signed-zero ambiguity.
  std::cout << "{\"order\":" << order << ",\"worker\":" << worker << ",\"iteration\":" << iteration
    << ",\"adaptive\":" << (adaptive ? "true" : "false")
    << ",\"done\":" << (result.done ? "true" : "false")
    << ",\"exception\":" << (result.exception ? "true" : "false")
    << ",\"value_bits\":\"" << std::hex << bits(result.value)
    << "\",\"error_bits\":\"" << bits(result.error)
    << "\",\"absolute_error_bits\":\"" << bits(result.absoluteError) << std::dec
    << "\",\"calls\":" << result.calls << ",\"iterations\":" << result.iterations
    << ",\"reached_order\":" << result.reachedOrder
    << ",\"matches_post_stress_serial\":" << (equal(result, serial) ? "true" : "false") << "}" << '\n';
}
int main(int argc, char** argv) {
  constexpr std::array<int, 6> orders{5, 7, 9, 11, 13, 15};
  constexpr int readersPerOrder = 4;
  constexpr int workers = orders.size() * readersPerOrder;
  const int repeats = argc > 1 ? std::atoi(argv[1]) : 16;
  if (repeats < 1 || repeats > 1000) { std::cerr << "Expected repeats in [1,1000]\n"; return 2; }
  std::array<std::vector<Result>, workers> results;
  for (auto& worker : results) worker.resize(repeats);
  std::barrier start(workers);
  std::array<std::thread, workers> threads;
  for (int worker = 0; worker < workers; ++worker) {
    threads[worker] = std::thread([&, worker] {
      const int order = orders[worker / readersPerOrder];
      const bool adaptive = worker % 2 != 0;
      start.arrive_and_wait();
      for (int repeat = 0; repeat < repeats; ++repeat) results[worker][repeat] = integrate(order, adaptive);
    });
  }
  for (auto& thread : threads) thread.join();
  // Serial comparisons happen AFTER the first-use stress; also compare baseline
  // process JSONL to preloaded process JSONL externally to catch stable bad tables.
  std::array<Result, orders.size() * 2> serial;
  for (std::size_t i = 0; i < orders.size(); ++i) {
    serial[i * 2] = integrate(orders[i], false);
    serial[i * 2 + 1] = integrate(orders[i], true);
  }
  bool pass = true;
  const double reference = std::exp(1.0) - 1.0 + 1.0 / 3.0;
  for (int worker = 0; worker < workers; ++worker) {
    const bool adaptive = worker % 2 != 0;
    const auto& expected = serial[(worker / readersPerOrder) * 2 + (adaptive ? 1 : 0)];
    for (int repeat = 0; repeat < repeats; ++repeat) {
      const auto& result = results[worker][repeat];
      record(orders[worker / readersPerOrder], worker, repeat, adaptive, result, expected);
      pass = pass && result.done && !result.exception && equal(result, expected)
        && (!adaptive || std::abs(result.value - reference) <= 1e-9 * std::abs(reference));
    }
  }
  return pass ? 0 : 1;
}
