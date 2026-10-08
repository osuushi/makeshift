// Original research harness; signatures checked against pinned OCCT 7.9.3 headers.
// No upstream implementation copied. Input BRep is read once and never modified.
// Run under flock /tmp/makeshift-geometry-compute.lock.
// Compile from repository root:
// c++ -O3 -DNDEBUG -std=c++20 -I.cache/kernel/sdk/include/opencascade
//   tests/geometry-performance/volume-kernel.cpp -L.cache/kernel/sdk/lib
//   -Wl,--disable-new-dtags,-rpath,$PWD/.cache/kernel/sdk/lib -lTKTopAlgo -lTKBRep -lTKGeomBase
//   -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/volume-kernel
// Usage: volume-kernel input.brep [samples=8] [filter=x|y|z|adaptive]
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <random>
#include <string>
#include <vector>

using Clock = std::chrono::steady_clock;
double elapsed(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
void number(double value) {
  if (std::isfinite(value)) std::cout << value;
  else std::cout << "null";
}
void describe(const TopoDS_Shape& shape, const std::array<double, 3>& lo,
              const std::array<double, 3>& hi, double boundsMs) {
  const bool valid = BRepCheck_Analyzer(shape).IsValid();
  std::cout << "{\"type\":\"input\",\"valid\":" << (valid ? "true" : "false")
            << ",\"bounds_ms\":" << boundsMs << ",\"lo\":[";
  for (int i = 0; i < 3; ++i) { if (i) std::cout << ','; number(lo[i]); }
  std::cout << "],\"hi\":[";
  for (int i = 0; i < 3; ++i) { if (i) std::cout << ','; number(hi[i]); }
  std::cout << "]}" << std::endl;
  int index = 0;
  for (TopExp_Explorer faces(shape, TopAbs_FACE); faces.More(); faces.Next()) {
    const BRepAdaptor_Surface surface(TopoDS::Face(faces.Current()), true);
    const auto type = surface.GetType();
    std::cout << "{\"type\":\"face\",\"index\":" << index++
              << ",\"surface_type\":" << static_cast<int>(type);
    if (type == GeomAbs_BSplineSurface || type == GeomAbs_BezierSurface) {
      std::cout << ",\"u_degree\":" << surface.UDegree()
                << ",\"v_degree\":" << surface.VDegree()
                << ",\"u_rational\":" << (surface.IsURational() ? "true" : "false")
                << ",\"v_rational\":" << (surface.IsVRational() ? "true" : "false");
      if (type == GeomAbs_BSplineSurface) {
        std::cout << ",\"u_knots\":" << surface.NbUKnots()
                  << ",\"v_knots\":" << surface.NbVKnots();
      }
    }
    std::cout << "}" << std::endl;
  }
}
void measure(const TopoDS_Shape& shape, const std::array<double, 3>& lo,
             int axis, int block) {
  static constexpr std::array<const char*, 4> names{"x", "y", "z", "adaptive"};
  // Prepare reference and accumulator outside the measured integration interval.
  gp_Pnt origin(lo[0], lo[1], lo[2]);
  gp_Dir normal(1, 0, 0);
  if (axis == 1) normal = gp_Dir(0, 1, 0);
  if (axis == 2) normal = gp_Dir(0, 0, 1);
  if (axis < 3) origin.SetCoord(axis + 1, lo[axis] - 1);
  const gp_Pln reference(origin, normal);
  GProp_GProps props;
  double error = 0;
  bool exception = false;
  const auto start = Clock::now();
  try {
    if (axis < 3) {
      // Exact order: shape, props, plane, eps, OnlyClosed, IsUseSpan,
      // CGFlag, IFlag, SkipShared. Negative error denotes OCCT failure.
      error = BRepGProp::VolumePropertiesGK(shape, props, reference, 1e-10,
                                           false, true, false, false, false);
    } else {
      // Ordinary adaptive Gauss comparator: eps, OnlyClosed, SkipShared.
      error = BRepGProp::VolumeProperties(shape, props, 1e-10, false, false);
    }
  } catch (const Standard_Failure&) {
    exception = true;
  }
  const double ms = elapsed(start);
  std::cout << "{\"type\":\"volume\",\"axis\":\"" << names[axis]
            << "\",\"block\":" << block << ",\"eps\":1e-10,\"ms\":" << ms
            << ",\"exception\":" << (exception ? "true" : "false")
            << ",\"error\":";
  if (exception) std::cout << "null"; else number(error);
  std::cout << ",\"mass\":"; number(props.Mass());
  std::cout << "}" << std::endl;
}
int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "Usage: volume-kernel input.brep [samples=8] [filter=x|y|z|adaptive]\n";
    return 2;
  }
  std::cout << std::setprecision(17);
  const int samples = argc > 2 ? std::max(1, std::atoi(argv[2])) : 8;
  const std::string filter = argc > 3 ? argv[3] : "";
  std::ifstream input(argv[1]);
  if (!input) { std::cerr << "Cannot open BRep input\n"; return 2; }
  try {
    TopoDS_Shape shape;
    BRep_Builder builder;
    BRepTools::Read(shape, input, builder);
    if (shape.IsNull()) { std::cerr << "Null BRep input\n"; return 2; }
    Bnd_Box bounds;
    const auto start = Clock::now();
    BRepBndLib::AddOptimal(shape, bounds, false, false);
    std::array<double, 3> lo{}, hi{};
    bounds.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    const double boundsMs = elapsed(start);
    describe(shape, lo, hi, boundsMs);
    std::vector<int> axes;
    const std::array<std::string, 4> names{"x", "y", "z", "adaptive"};
    for (int axis = 0; axis < 4; ++axis) {
      if (filter.empty() || filter == names[axis]) axes.push_back(axis);
    }
    if (axes.empty()) { std::cerr << "Unknown axis filter\n"; return 2; }
    std::mt19937 random(20261008);
    // Retain the complete warmup block (-1) for cold/steady-state analysis.
    for (int block = -1; block < samples; ++block) {
      std::shuffle(axes.begin(), axes.end(), random);
      for (const int axis : axes) measure(shape, lo, axis, block);
    }
  } catch (const Standard_Failure& failure) {
    std::cerr << "OCCT input/metadata failure: " << failure.GetMessageString() << '\n';
    return 1;
  }
}
