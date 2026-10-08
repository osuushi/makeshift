// Original Linux ELF correctness shim, public OCCT 7.9.3 overload signature.
// Compile: c++ -O2 -std=c++20 -fPIC -shared -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/trace-volume-reference.cpp -ldl -o /tmp/trace-volume-reference.so
// Caller holds compute lock. LD_PRELOAD this into correctness-only requests.
// Interposition/logging invalidates timing; referencePlane is the actual argument,
// not a claim about the kernel's signed-distance convention or error certification.
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Pln.hxx>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <dlfcn.h>

namespace {
std::atomic<unsigned long long> calls{0};
void number(double value) {
  if (std::isfinite(value)) std::fprintf(stderr, "%.17g", value);
  else std::fputs("null", stderr);
}
} // namespace
Standard_Real BRepGProp::VolumePropertiesGK(const TopoDS_Shape& shape, GProp_GProps& properties,
    const gp_Pln& plane, const Standard_Real eps, const Standard_Boolean onlyClosed,
    const Standard_Boolean useSpan, const Standard_Boolean cg,
    const Standard_Boolean inertia, const Standard_Boolean skipShared) {
  using Function = Standard_Real (*)(const TopoDS_Shape&, GProp_GProps&, const gp_Pln&,
      Standard_Real, Standard_Boolean, Standard_Boolean, Standard_Boolean,
      Standard_Boolean, Standard_Boolean);
  static const Function original = [] {
    dlerror();
    void* address = dlsym(RTLD_NEXT, "_ZN9BRepGProp18VolumePropertiesGKERK12TopoDS_ShapeR12GProp_GPropsRK6gp_Plndbbbbb");
    const char* error = dlerror();
    if (error || !address) {
      std::fprintf(stderr, "trace-volume-reference unresolved: %s\n", error ? error : "null");
      std::_Exit(127);
    }
    return reinterpret_cast<Function>(address);
  }();
  const auto call = calls.fetch_add(1, std::memory_order_relaxed);
  const auto result = original(shape, properties, plane, eps, onlyClosed, useSpan, cg, inertia, skipShared);
  const auto normal = plane.Axis().Direction();
  const auto origin = plane.Location();
  const double components[3] = {normal.X(), normal.Y(), normal.Z()};
  int axis = -1;
  for (int i = 0; i < 3; ++i) if (std::abs(components[i]) == 1) axis = i;
  flockfile(stderr);
  std::fprintf(stderr, "{\"type\":\"volume_reference\",\"call\":%llu,\"axis\":%d,\"normal\":[", call, axis);
  number(normal.X()); std::fputc(',', stderr); number(normal.Y()); std::fputc(',', stderr); number(normal.Z());
  std::fputs("],\"origin\":[", stderr);
  number(origin.X()); std::fputc(',', stderr); number(origin.Y()); std::fputc(',', stderr); number(origin.Z());
  std::fputs("],\"eps\":", stderr); number(eps);
  std::fputs(",\"mass\":", stderr); number(properties.Mass());
  std::fputs(",\"error\":", stderr); number(result);
  std::fprintf(stderr, ",\"shapeType\":%d,\"onlyClosed\":%s,\"useSpan\":%s,\"cg\":%s,\"inertia\":%s,\"skipShared\":%s}\n",
      static_cast<int>(shape.ShapeType()), onlyClosed ? "true" : "false", useSpan ? "true" : "false",
      cg ? "true" : "false", inertia ? "true" : "false", skipShared ? "true" : "false");
  funlockfile(stderr);
  return result;
}
