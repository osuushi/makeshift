// Original D1 equivalence harness, public OCCT 7.9.3 API only; no upstream copy.
// Compile: c++ -O3 -DNDEBUG -std=c++20 -pthread -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/surface-evaluator.cpp -L.cache/kernel/sdk/lib
// -Wl,--disable-new-dtags,-rpath,$PWD/.cache/kernel/sdk/lib -lTKTopAlgo -lTKBRep -lTKGeomBase
// -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/surface-evaluator
// Usage: surface-evaluator input.brep [blocks=1] [raw]
// For a fork, build a separate executable with its lib directory FIRST in RPATH.
// LD_LIBRARY_PATH does not override these DT_RPATH binaries. No private cache ABI.
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax1.hxx>
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <string>
#include <thread>
#include <utility>
#include <vector>

using UV = std::pair<double, double>;
struct Digest { std::uint64_t hash = 14695981039346656037ULL; std::size_t samples = 0; bool ok = true; };
void hashDouble(Digest& d, double value) {
  const auto bits = std::bit_cast<std::uint64_t>(value);
  for (int i = 0; i < 8; ++i) {
    d.hash ^= (bits >> (8 * i)) & 255;
    d.hash *= 1099511628211ULL;
  }
}
Digest evaluate(const BRepAdaptor_Surface& surface, const std::vector<UV>& points, bool raw) {
  Digest d;
  try {
    for (const auto& [u, v] : points) {
      gp_Pnt p; gp_Vec du, dv;
      surface.D1(u, v, p, du, dv);
      const std::array<double, 9> values{p.X(), p.Y(), p.Z(), du.X(), du.Y(), du.Z(),
                                        dv.X(), dv.Y(), dv.Z()};
      hashDouble(d, u); hashDouble(d, v);
      for (double value : values) hashDouble(d, value);
      ++d.samples;
      if (raw) {
        std::cout << "{\"type\":\"sample\",\"u\":" << u << ",\"v\":" << v << ",\"values\":[";
        for (std::size_t i = 0; i < values.size(); ++i) {
          if (i) std::cout << ',';
          if (std::isfinite(values[i])) std::cout << values[i]; else std::cout << "null";
        }
        std::cout << "]}\n";
      }
    }
  } catch (const Standard_Failure&) { d.ok = false; }
  return d;
}
void record(int face, int variant, int block, const char* phase, const Digest& d) {
  std::cout << "{\"type\":\"digest\",\"face\":" << face << ",\"variant\":" << variant
            << ",\"block\":" << block << ",\"phase\":\"" << phase << "\",\"samples\":" << d.samples
            << ",\"ok\":" << (d.ok ? "true" : "false") << ",\"hash\":\""
            << std::hex << d.hash << std::dec << "\"}" << std::endl;
}
std::vector<double> parameters(const BRepAdaptor_Surface& surface, bool u) {
  const double lo = u ? surface.FirstUParameter() : surface.FirstVParameter();
  const double hi = u ? surface.LastUParameter() : surface.LastVParameter();
  std::vector<double> points;
  for (int i = 0; i <= 32; ++i) points.push_back(lo + (hi - lo) * i / 32);
  if (surface.GetType() == GeomAbs_BSplineSurface) {
    const auto spline = surface.BSpline();
    const int count = u ? spline->NbUKnots() : spline->NbVKnots();
    for (int i = 1; i <= count; ++i) {
      const double knot = u ? spline->UKnot(i) : spline->VKnot(i);
      if (knot < lo || knot > hi) continue;
      points.push_back(knot);
      for (double side : {-1.0, 1.0}) {
        const double near = knot + side * (hi - lo) * 1e-9;
        if (near >= lo && near <= hi) points.push_back(near);
      }
    }
  }
  if (u ? surface.IsUPeriodic() : surface.IsVPeriodic()) {
    const double period = u ? surface.UPeriod() : surface.VPeriod();
    points.push_back(lo - period);
    points.push_back(hi + period);
    points.push_back(std::nextafter(lo, lo - period));
    points.push_back(std::nextafter(hi, hi + period));
  }
  return points;
}
std::pair<double, double> interiorSpan(const BRepAdaptor_Surface& surface, bool u) {
  double lo = u ? surface.FirstUParameter() : surface.FirstVParameter();
  double hi = u ? surface.LastUParameter() : surface.LastVParameter();
  if (surface.GetType() == GeomAbs_BSplineSurface) {
    const auto spline = surface.BSpline();
    const int count = u ? spline->NbUKnots() : spline->NbVKnots();
    for (int i = 1; i < count; ++i) {
      const double a = std::max(lo, u ? spline->UKnot(i) : spline->VKnot(i));
      const double b = std::min(hi, u ? spline->UKnot(i + 1) : spline->VKnot(i + 1));
      if (b > a) return {a, b};
    }
    // A periodic trim may lie outside the fundamental knot range. Do not risk
    // rebuilding shared cache state by treating that entire trim as one span.
    return {std::numeric_limits<double>::quiet_NaN(), 0};
  }
  return {lo, hi};
}
void readers(BRepAdaptor_Surface& surface, int face, int variant, int block) {
  const auto [u0, u1] = interiorSpan(surface, true);
  const auto [v0, v1] = interiorSpan(surface, false);
  if (!std::isfinite(u0) || !std::isfinite(v0) || u1 <= u0 || v1 <= v0) {
    Digest skipped; skipped.ok = false;
    record(face, variant, block, "reader-no-interior-span", skipped);
    return;
  }
  std::array<std::vector<UV>, 4> points;
  std::array<Digest, 4> expected, actual;
  // All points are well inside the same U/V span: no concurrent cache rebuilding.
  for (int t = 0; t < 4; ++t) {
    for (int i = 0; i < 127; ++i) {
      points[t].push_back({u0 + (u1 - u0) * (0.2 + 0.6 * i / 127),
                           v0 + (v1 - v0) * (0.22 + 0.13 * t + 0.01 * (i % 3))});
    }
    expected[t] = evaluate(surface, points[t], false);
  }
  gp_Pnt p; gp_Vec du, dv;
  surface.D1((u0 + u1) * 0.5, (v0 + v1) * 0.5, p, du, dv);
  std::array<std::thread, 4> threads;
  for (int t = 0; t < 4; ++t) threads[t] = std::thread([&, t] { actual[t] = evaluate(surface, points[t], false); });
  for (auto& thread : threads) thread.join();
  for (int t = 0; t < 4; ++t) {
    const std::string serial = "serial-" + std::to_string(t), parallel = "reader-" + std::to_string(t);
    record(face, variant, block, serial.c_str(), expected[t]);
    actual[t].ok = actual[t].ok && expected[t].ok && actual[t].hash == expected[t].hash;
    record(face, variant, block, parallel.c_str(), actual[t]);
  }
}
void testFace(const TopoDS_Face& face, int index, int variant, int blocks, bool raw) {
  BRepAdaptor_Surface surface(face, true);
  if (surface.GetType() != GeomAbs_BSplineSurface && surface.GetType() != GeomAbs_BezierSurface) return;
  const auto us = parameters(surface, true), vs = parameters(surface, false);
  std::vector<UV> grid, fixed, alternate;
  for (double v : vs) for (double u : us) grid.push_back({u, v});
  const double v0 = surface.FirstVParameter(), v1 = surface.LastVParameter();
  for (int repeat = 0; repeat < 8; ++repeat) {
    for (std::size_t i = 0; i < us.size(); ++i) {
      fixed.push_back({us[i], v0 + (v1 - v0) * 0.371});
      alternate.push_back({us[i], v0 + (v1 - v0) * (i % 2 ? 0.317 : 0.683)});
    }
  }
  std::cout << "{\"type\":\"face\",\"face\":" << index << ",\"variant\":" << variant
            << ",\"u_degree\":" << surface.UDegree() << ",\"v_degree\":" << surface.VDegree()
            << ",\"u_rational\":" << (surface.IsURational() ? "true" : "false")
            << ",\"v_rational\":" << (surface.IsVRational() ? "true" : "false") << "}\n";
  for (int block = 0; block < blocks; ++block) {
    record(index, variant, block, "grid", evaluate(surface, grid, raw));
    record(index, variant, block, "fixed-v", evaluate(surface, fixed, raw));
    record(index, variant, block, "alternate-v", evaluate(surface, alternate, raw));
    readers(surface, index, variant, block);
  }
}
int main(int argc, char** argv) {
  if (argc < 2) { std::cerr << "Expected BRep path [blocks=1] [raw]\n"; return 2; }
  std::cout << std::setprecision(17);
  const int blocks = argc > 2 ? std::max(1, std::atoi(argv[2])) : 1;
  const bool raw = argc > 3 && std::string(argv[3]) == "raw";
  std::ifstream input(argv[1]);
  if (!input) { std::cerr << "Cannot open BRep\n"; return 2; }
  try {
    TopoDS_Shape shape; BRep_Builder builder;
    BRepTools::Read(shape, input, builder);
    if (shape.IsNull()) return 2;
    gp_Trsf transform;
    transform.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 0.371);
    transform.SetTranslationPart(gp_Vec(-17, 9, -4));
    int index = 0;
    for (TopExp_Explorer e(shape, TopAbs_FACE); e.More(); e.Next(), ++index) {
      const auto face = TopoDS::Face(e.Current());
      testFace(face, index, 0, blocks, raw);
      testFace(TopoDS::Face(face.Reversed()), index, 1, blocks, raw);
      testFace(TopoDS::Face(BRepBuilderAPI_Transform(face, transform, false).Shape()), index, 2, blocks, raw);
    }
  } catch (const Standard_Failure& failure) {
    std::cerr << "OCCT failure: " << failure.GetMessageString() << '\n'; return 1;
  }
}
