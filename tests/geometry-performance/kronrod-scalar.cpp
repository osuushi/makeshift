// Original scalar diagnostic using public OCCT 7.9.3 API; no upstream code copied.
// Compile (main only): c++ -O2 -std=c++20 -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/kronrod-scalar.cpp -L.cache/kernel/sdk/lib
// -Wl,-rpath,$PWD/.cache/kernel/sdk/lib -lTKMath -lTKernel -o /tmp/kronrod-scalar
// Usage: kronrod-scalar [points 3..125] [substring-filter]
// Compare baseline and preload variants; caller owns shared compute lock.
#include <math_Function.hxx>
#include <math_KronrodSingleIntegration.hxx>
#include <Standard_Failure.hxx>
#include <Standard_Real.hxx>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

enum class Kind { Constant, Polynomial, Exp, Sine, Kink, Cancellation, Tiny, Failed };
struct Case {
  const char* name;
  Kind kind;
  double lo = 0;
  double hi = 1;
  double parameter = 0;
  bool checkAccuracy = true;
};
class Function : public math_Function {
public:
  explicit Function(const Case& fixture) : test(fixture) {}
  Standard_Boolean Value(const Standard_Real x, Standard_Real& value) override {
    ++calls;
    switch (test.kind) {
      case Kind::Constant: value = 3; break;
      case Kind::Polynomial: value = std::pow(x, 8) - 2 * std::pow(x, 3) + 3; break;
      case Kind::Exp: value = std::exp(x); break;
      case Kind::Sine: value = std::sin(test.parameter * x); break;
      case Kind::Kink: value = std::abs(x - test.parameter); break;
      case Kind::Cancellation: value = (x - 0.5) + test.parameter; break;
      case Kind::Tiny: value = 1e-20; break;
      case Kind::Failed:
        if (x > 0.5) { ++failedCalls; return false; }
        value = x;
        break;
    }
    return true;
  }
  std::uint64_t calls = 0;
  std::uint64_t failedCalls = 0;
private:
  Case test;
};
long double reference(const Case& test) {
  const long double a = test.lo, b = test.hi, p = test.parameter;
  switch (test.kind) {
    case Kind::Constant: return 3 * (b - a);
    case Kind::Polynomial: return (std::pow(b, 9) - std::pow(a, 9)) / 9
      - (std::pow(b, 4) - std::pow(a, 4)) / 2 + 3 * (b - a);
    case Kind::Exp: return std::exp(b) - std::exp(a);
    case Kind::Sine: return (std::cos(p * a) - std::cos(p * b)) / p;
    case Kind::Kink: return ((b - p) * std::abs(b - p) - (a - p) * std::abs(a - p)) / 2;
    case Kind::Cancellation: return (b - a) * ((a + b) / 2 - 0.5L + p);
    case Kind::Tiny: return 1e-20L * (b - a);
    case Kind::Failed: return std::numeric_limits<long double>::quiet_NaN();
  }
  return std::numeric_limits<long double>::quiet_NaN();
}
void number(long double value) {
  if (std::isfinite(value)) std::cout << std::setprecision(std::numeric_limits<long double>::max_digits10) << value;
  else std::cout << "null";
}
bool run(const Case& test, int points) {
  constexpr double eps = 1e-10;
  constexpr int maximumIterations = 1000;
  Function function(test);
  math_KronrodSingleIntegration integral;
  bool exception = false;
  try { integral.Perform(function, test.lo, test.hi, points, eps, maximumIterations); }
  catch (const Standard_Failure&) { exception = true; }
  const bool done = !exception && integral.IsDone();
  const long double exact = reference(test);
  const double value = done ? integral.Value() : std::numeric_limits<double>::quiet_NaN();
  const long double actualAbsoluteError = std::abs(static_cast<long double>(value) - exact);
  const long double actualRelativeError = exact != 0 ? actualAbsoluteError / std::abs(exact)
    : std::numeric_limits<long double>::quiet_NaN();
  const bool relativeMode = done && std::abs(value) > Epsilon(1.);
  const long double effectiveTarget = relativeMode ? eps * std::abs(value) : eps;
  const bool expectedFailure = test.kind == Kind::Failed;
  // A generous factor ten checks well-conditioned known integrals independently
  // of the estimator. Cancellation/tiny cases are diagnostics, never exit gates.
  const bool accuracyPass = !test.checkAccuracy || (done && std::isfinite(actualRelativeError)
    && actualRelativeError <= 10 * eps);
  const bool pass = expectedFailure ? !done && function.failedCalls > 0 && !exception : accuracyPass;
  std::cout << "{\"case\":\"" << test.name << "\",\"points\":" << points
    << ",\"eps\":1e-10,\"max_iterations\":1000,\"value_calls\":" << function.calls
    << ",\"failed_value_calls\":" << function.failedCalls << ",\"exception\":" << (exception ? "true" : "false")
    << ",\"is_done\":" << (done ? "true" : "false") << ",\"value\":"; number(value);
  std::cout << ",\"reference\":"; number(exact);
  std::cout << ",\"actual_absolute_error\":"; number(actualAbsoluteError);
  std::cout << ",\"actual_relative_error\":"; number(actualRelativeError);
  std::cout << ",\"error_reached\":"; number(done ? integral.ErrorReached() : std::numeric_limits<double>::quiet_NaN());
  std::cout << ",\"absolute_error_estimate\":"; number(done ? integral.AbsolutError() : std::numeric_limits<double>::quiet_NaN());
  std::cout << ",\"iterations\":";
  if (done) std::cout << integral.NbIterReached(); else std::cout << "null";
  std::cout << ",\"order_reached\":";
  if (done) std::cout << integral.OrderReached(); else std::cout << "null";
  std::cout << ",\"legacy_target_mode\":\"" << (done ? (relativeMode ? "relative" : "absolute") : "unavailable")
    << "\",\"effective_absolute_target\":"; number(done ? effectiveTarget : std::numeric_limits<long double>::quiet_NaN());
  std::cout << ",\"actual_meets_legacy_target\":";
  if (done && std::isfinite(exact)) std::cout << (actualAbsoluteError <= effectiveTarget ? "true" : "false");
  else std::cout << "null";
  std::cout << ",\"exit_accuracy_gate\":" << (test.checkAccuracy ? "true" : "false")
    << ",\"expected_value_failure\":" << (expectedFailure ? "true" : "false")
    << ",\"pass\":" << (pass ? "true" : "false")
    << ",\"note\":\"IsDone/estimated error are not accuracy certificates. Reference uses elementary antiderivatives evaluated in long double; cancellation references describe exact mathematical functions before double Value rounding.\"}" << std::endl;
  return pass;
}
int main(int argc, char** argv) {
  const int points = argc > 1 ? std::atoi(argv[1]) : 15;
  const std::string filter = argc > 2 ? argv[2] : "";
  if (points < 3 || points > 125) { std::cerr << "Expected points in 3..125\n"; return 2; }
  const std::vector<Case> cases = {
    {"constant", Kind::Constant}, {"polynomial", Kind::Polynomial}, {"exp", Kind::Exp},
    {"sin-123", Kind::Sine, 0, 1, 123}, {"kink-037", Kind::Kink, 0, 1, 0.37},
    {"cancel-zero", Kind::Cancellation, 0, 1, 0, false},
    {"cancel-1e-12", Kind::Cancellation, 0, 1, 1e-12, false},
    {"cancel-1e-20", Kind::Cancellation, 0, 1, 1e-20, false},
    {"tiny-positive", Kind::Tiny, 0, 1, 0, false},
    {"reversed-constant", Kind::Constant, 1, 0}, {"reversed-exp", Kind::Exp, 1, 0},
    {"failed-value", Kind::Failed, 0, 1, 0, false},
  };
  bool pass = true;
  int selected = 0;
  for (const auto& test : cases) {
    if (std::string(test.name).find(filter) == std::string::npos) continue;
    ++selected;
    pass = run(test, points) && pass;
  }
  if (!selected) return 2;
  return pass ? 0 : 1;
}
