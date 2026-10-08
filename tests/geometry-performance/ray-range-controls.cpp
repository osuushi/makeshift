// Original public-API OCCT 7.9.3 ray-range controls. Source-only at creation.
// Orchestrator builds/runs serially under the compute lock. Example link:
// c++ -std=c++20 -O2 -I.cache/kernel/sdk/include/opencascade THIS.cpp
// -LISOLATED_LIBDIR -lTKPrim -lTKTopAlgo -lTKGeomAlgo -lTKBRep -lTKGeomBase
// -lTKG3d -lTKG2d -lTKMath -lTKernel -Wl,-rpath,ISOLATED_LIBDIR -o OUTPUT
// Optional selectors: FIXTURE|all OVERLOAD|all USE_BOUND_TOLERANCE=0|1|all
// stdout JSONL is untimed. No candidate expected truth or hidden normalization.
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepPrimAPI_MakeCone.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <GeomAdaptor_Curve.hxx>
#include <Geom2d_Curve.hxx>
#include <Geom_Line.hxx>
#include <IntCurvesFace_Intersector.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <exception>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
struct Fixture {
  std::string name;
  TopoDS_Face face;
  gp_Lin crossing, parallel, outside;
};
struct Query { const char* name; gp_Lin line; double lower, upper; };
void text(const std::string& value) {
  std::cout << '"';
  for (const unsigned char c : value) {
    if (c == '"' || c == '\\') std::cout << '\\' << char(c);
    else if (c < 32) std::cout << "\\u00" << std::hex << std::setw(2)
                              << std::setfill('0') << int(c) << std::dec << std::setfill(' ');
    else std::cout << char(c);
  }
  std::cout << '"';
}
void real(double value) {
  std::cout << "{\"value\":";
  if (std::isfinite(value)) std::cout << value;
  else std::cout << "null";
  std::cout << ",\"bits\":\"" << std::hex << std::setw(16) << std::setfill('0')
            << std::bit_cast<std::uint64_t>(value) << std::dec << std::setfill(' ') << "\"}";
}
void prefix(const Fixture& fixture, const char* overload, const char* stage) {
  std::cout << "{\"fixture\":"; text(fixture.name);
  std::cout << ",\"overload\":"; text(overload);
  std::cout << ",\"stage\":"; text(stage);
}
void error(const Fixture& fixture, const char* overload, const char* stage,
           const char* kind, const char* message, bool useBoundTolerance) {
  prefix(fixture, overload, stage);
  std::cout << ",\"useBoundTolerance\":" << (useBoundTolerance ? "true" : "false");
  std::cout << ",\"exceptionKind\":"; text(kind);
  std::cout << ",\"exception\":"; text(message ? message : "");
  std::cout << "}\n";
}
TopoDS_Face faceOf(const TopoDS_Shape& shape, GeomAbs_SurfaceType type) {
  for (TopExp_Explorer e(shape, TopAbs_FACE); e.More(); e.Next()) {
    const auto face = TopoDS::Face(e.Current());
    if (BRepAdaptor_Surface(face).GetType() == type) return face;
  }
  throw std::runtime_error("Primitive has no requested analytic face");
}
Fixture variant(const Fixture& original, const char* name, bool missing3d,
                bool missingPcurve, bool highTolerance) {
  auto copy = BRepBuilderAPI_Copy(original.face, false, false).Shape();
  auto face = TopoDS::Face(copy);
  BRep_Builder builder;
  for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
    const auto edge = TopoDS::Edge(e.Current());
    if (missing3d) builder.UpdateEdge(edge, Handle(Geom_Curve)(), 1e-7);
    if (missingPcurve) builder.UpdateEdge(edge, Handle(Geom2d_Curve)(), face, 1e-7);
    if (highTolerance) builder.UpdateEdge(edge, 0.25);
  }
  return {name, face, original.crossing, original.parallel, original.outside};
}
std::vector<Fixture> fixtures() {
  const gp_Lin crossing(gp_Pnt(0, 0, -5), gp_Dir(0, 0, 1));
  const gp_Lin parallel(gp_Pnt(0, 0, 1), gp_Dir(1, 0, 0));
  const gp_Lin outside(gp_Pnt(1.1, 0, -5), gp_Dir(0, 0, 1));
  const Fixture plane{"valid-plane", BRepBuilderAPI_MakeFace(
    gp_Pln(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), -1, 1, -1, 1).Face(),
    crossing, parallel, outside};
  std::vector<Fixture> result{plane,
    variant(plane, "plane-high-edge-tolerance", false, false, true),
    variant(plane, "malformed-plane-missing-3d", true, false, false),
    variant(plane, "malformed-plane-missing-pcurves", false, true, false),
    variant(plane, "malformed-plane-missing-3d-high-tolerance", true, false, true)};
  const gp_Lin axisParallel(gp_Pnt(5, 0, -5), gp_Dir(0, 0, 1));
  const gp_Lin side(gp_Pnt(-5, 0, 1), gp_Dir(1, 0, 0));
  result.push_back({"valid-cylinder", faceOf(BRepPrimAPI_MakeCylinder(2, 4).Shape(),
    GeomAbs_Cylinder), side, axisParallel, gp_Lin(gp_Pnt(-5, 0, 8), gp_Dir(1, 0, 0))});
  result.push_back({"valid-sphere-degenerate-poles", faceOf(BRepPrimAPI_MakeSphere(2).Shape(),
    GeomAbs_Sphere), gp_Lin(gp_Pnt(-5, 0, 0), gp_Dir(1, 0, 0)), axisParallel,
    gp_Lin(gp_Pnt(-5, 0, 3), gp_Dir(1, 0, 0))});
  result.push_back({"valid-cone-degenerate-apex", faceOf(BRepPrimAPI_MakeCone(2, 0, 4).Shape(),
    GeomAbs_Cone), side, axisParallel, gp_Lin(gp_Pnt(-5, 0, 8), gp_Dir(1, 0, 0))});
  result.push_back({"valid-torus", faceOf(BRepPrimAPI_MakeTorus(3, 1).Shape(), GeomAbs_Torus),
    gp_Lin(gp_Pnt(-5, 0, 0), gp_Dir(1, 0, 0)), axisParallel,
    gp_Lin(gp_Pnt(-5, 0, 3), gp_Dir(1, 0, 0))});
  return result;
}
std::vector<Query> queries(const Fixture& fixture) {
  const double nan = std::numeric_limits<double>::quiet_NaN();
  const double infinity = std::numeric_limits<double>::infinity();
  return {{"00-prior-parallel-nohit", fixture.parallel, 0, 20},
    {"01-out-of-range-after-parallel", fixture.crossing, 0, 0.5},
    {"02-in-range-after-outside", fixture.crossing, 0, 20},
    {"03-outside-trim-short", fixture.outside, 0, 0.5},
    {"04-outside-trim-long", fixture.outside, 0, 20},
    {"05-equal-endpoint-five", fixture.crossing, 5, 5},
    {"06-inclusive-lower-five", fixture.crossing, 5, 20},
    {"07-inclusive-upper-five", fixture.crossing, 0, 5},
    {"08-reversed-range", fixture.crossing, 20, 0},
    {"09-nan-lower", fixture.crossing, nan, 20},
    {"10-nan-upper", fixture.crossing, 0, nan},
    {"11-infinite-bounds", fixture.crossing, -infinity, infinity},
    {"12-positive-zero-lower", fixture.crossing, 0.0, 20},
    {"13-negative-zero-lower", fixture.crossing, -0.0, 20},
    {"14-in-range-after-invalid-ranges", fixture.crossing, 0, 20},
    {"15-axis-poles-apex", gp_Lin(gp_Pnt(0, 0, -5), gp_Dir(0, 0, 1)), 0, 20}};
}
void state(IntCurvesFace_Intersector& ray) {
  std::cout << ",\"done\":" << (ray.IsDone() ? "true" : "false")
            << ",\"parallel\":" << (ray.IsParallel() ? "true" : "false")
            << ",\"count\":" << ray.NbPnt() << ",\"hits\":[";
  for (int i = 1; i <= ray.NbPnt(); ++i) {
    if (i > 1) std::cout << ',';
    const auto& p = ray.Pnt(i);
    std::cout << "{\"xyz\":["; real(p.X()); std::cout << ','; real(p.Y());
    std::cout << ','; real(p.Z()); std::cout << "],\"u\":"; real(ray.UParameter(i));
    std::cout << ",\"v\":"; real(ray.VParameter(i));
    std::cout << ",\"w\":"; real(ray.WParameter(i));
    std::cout << ",\"state\":" << int(ray.State(i))
              << ",\"transition\":" << int(ray.Transition(i)) << '}';
  }
  std::cout << ']';
}
void queryFields(const Query& query) {
  std::cout << ",\"range\":["; real(query.lower); std::cout << ','; real(query.upper);
  std::cout << "],\"line\":[";
  const auto p = query.line.Location(); const auto d = query.line.Direction();
  const std::array<double, 6> components{p.X(), p.Y(), p.Z(), d.X(), d.Y(), d.Z()};
  for (std::size_t i = 0; i < components.size(); ++i) { if (i) std::cout << ','; real(components[i]); }
  std::cout << ']';
}
void perform(IntCurvesFace_Intersector& ray, const Fixture& fixture,
             const Query& query, bool generic) {
  prefix(fixture, generic ? "adaptor-bounded-line" : "gp_Lin", query.name);
  std::cout << ",\"type\":\"query-start\",\"useBoundTolerance\":"
            << (ray.GetUseBoundToler() ? "true" : "false");
  queryFields(query); std::cout << "}\n";
  std::string kind, message;
  try {
    if (generic) {
      Handle(Adaptor3d_Curve) curve = new GeomAdaptor_Curve(new Geom_Line(query.line), -1000, 1000);
      ray.Perform(curve, query.lower, query.upper);
    } else ray.Perform(query.line, query.lower, query.upper);
  } catch (const Standard_Failure& e) {
    kind = e.DynamicType()->Name(); message = e.GetMessageString() ? e.GetMessageString() : "";
  } catch (const std::exception& e) { kind = "std::exception"; message = e.what(); }
  prefix(fixture, generic ? "adaptor-bounded-line" : "gp_Lin", query.name);
  std::cout << ",\"useBoundTolerance\":" << (ray.GetUseBoundToler() ? "true" : "false");
  std::cout << ",\"type\":\"query-result\"";
  queryFields(query);
  if (!kind.empty()) { std::cout << ",\"exceptionKind\":"; text(kind);
                      std::cout << ",\"exception\":"; text(message); }
  // On exception preserve publicly observable partial state, without assuming Done.
  state(ray); std::cout << "}\n";
}
void run(const Fixture& fixture, bool generic, bool useBoundTolerance) {
  const char* overload = generic ? "adaptor-bounded-line" : "gp_Lin";
  try {
    prefix(fixture, overload, "construction-start");
    std::cout << ",\"useBoundTolerance\":" << (useBoundTolerance ? "true" : "false") << "}\n";
    const bool valid = BRepCheck_Analyzer(fixture.face).IsValid();
    int degenerate = 0, missing3d = 0;
    for (TopExp_Explorer e(fixture.face, TopAbs_EDGE); e.More(); e.Next()) {
      const auto edge = TopoDS::Edge(e.Current()); double first, last;
      degenerate += BRep_Tool::Degenerated(edge);
      missing3d += BRep_Tool::Curve(edge, first, last).IsNull();
    }
    prefix(fixture, overload, "construction");
    std::cout << ",\"useBoundTolerance\":" << (useBoundTolerance ? "true" : "false")
              << ",\"valid\":" << (valid ? "true" : "false");
    std::cout << ",\"degenerateEdgeOccurrences\":" << degenerate
              << ",\"missing3dEdgeOccurrences\":" << missing3d << "}\n";
    IntCurvesFace_Intersector ray(fixture.face, 1e-7, true, useBoundTolerance);
    for (const auto& query : queries(fixture)) perform(ray, fixture, query, generic);
  } catch (const Standard_Failure& e) { error(fixture, overload, "construction-or-state-read", e.DynamicType()->Name(), e.GetMessageString(), useBoundTolerance); }
  catch (const std::exception& e) { error(fixture, overload, "construction-or-state-read", "std::exception", e.what(), useBoundTolerance); }
}
} // namespace
int main(int argc, char** argv) {
  std::cout << std::setprecision(17) << std::boolalpha << std::unitbuf;
  const std::string fixtureName = argc > 1 ? argv[1] : "all";
  const std::string overload = argc > 2 ? argv[2] : "all";
  const std::string useTolerance = argc > 3 ? argv[3] : "all";
  if (argc > 4 || (overload != "all" && overload != "gp_Lin" && overload != "adaptor-bounded-line")
      || (useTolerance != "all" && useTolerance != "0" && useTolerance != "1")) {
    std::cerr << "Usage: ray-range-controls [FIXTURE|all] [gp_Lin|adaptor-bounded-line|all] [0|1|all]\n";
    return 2;
  }
  try {
    bool matched = false;
    for (const auto& fixture : fixtures()) {
      if (fixtureName != "all" && fixture.name != fixtureName) continue;
      matched = true;
      for (const bool generic : {false, true}) {
        if (overload != "all" && overload != (generic ? "adaptor-bounded-line" : "gp_Lin")) continue;
        for (const bool useBoundTolerance : {false, true}) {
          if (useTolerance != "all" && useTolerance != (useBoundTolerance ? "1" : "0")) continue;
          run(fixture, generic, useBoundTolerance);
        }
      }
    }
    if (!matched) { std::cerr << "Unknown fixture: " << fixtureName << '\n'; return 2; }
  } catch (const Standard_Failure& e) { std::cerr << "fixture failure: " << e.GetMessageString() << '\n'; return 1; }
  catch (const std::exception& e) { std::cerr << "fixture failure: " << e.what() << '\n'; return 1; }
}
