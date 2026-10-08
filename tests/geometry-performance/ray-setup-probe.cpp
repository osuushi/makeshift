// Original public OCCT 7.9.3 ray equivalence diagnostic; no upstream code copied.
// Main compiles/runs under shared compute lock; counts/correctness only, no timing.
// c++ -O2 -std=c++20 -pthread -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/ray-setup-probe.cpp -L.cache/kernel/sdk/lib
// -Wl,-rpath,$PWD/.cache/kernel/sdk/lib -lTKPrim -lTKTopAlgo -lTKGeomAlgo
// -lTKBRep -lTKGeomBase -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/ray-setup-probe
// Usage: ray-setup-probe [serial|threads] [optional.brep]
// Compare full ordered JSONL against SDK and original-source preload controls.
// Threads have independent fresh shapes and intersectors, loaded serially BEFORE
// the barrier. Covers repeated line changes/TLS separation, not race-free proof.
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepPrimAPI_MakeTorus.hxx>
#include <BRepPrimAPI_MakeCone.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <IntCurvesFace_ShapeIntersector.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS_Face.hxx>
#include <gp_Ax1.hxx>
#include <gp_Ax2.hxx>
#include <gp_Lin.hxx>
#include <gp_Vec.hxx>
#include <array>
#include <barrier>
#include <bit>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

struct Query { const char* name; gp_Lin line; double lo; double hi; };
struct Context {
  std::string name;
  TopoDS_Shape shape;
  gp_Trsf world;
  TopTools_IndexedMapOfShape faces;
  IntCurvesFace_ShapeIntersector intersector;
};
using Contexts = std::vector<std::unique_ptr<Context>>;
void bits(std::ostream& out, double value) {
  out << '"' << std::hex << std::bit_cast<std::uint64_t>(value) << std::dec << '"';
}
std::vector<Query> queries() {
  const auto line = [](double x, double y, double z, double dx, double dy, double dz) {
    return gp_Lin(gp_Pnt(x, y, z), gp_Dir(dx, dy, dz));
  };
  return {
    {"center-x", line(-6,0,0,1,0,0), -10,20},
    {"miss-after-hit", line(-6,7,0,1,0,0), -10,20},
    {"center-reverse", line(-6,0,0,-1,0,0), -20,10},
    {"center-x-repeat", line(-6,0,0,1,0,0), -10,20},
    {"axis-z", line(0,0,-6,0,0,1), -10,20},
    {"seam-x", line(-6,0,1,1,0,0), -10,20},
    {"tangent-y2", line(-6,2,0,1,0,0), -10,20},
    {"outer-torus-tangent", line(-6,4,0,1,0,0), -10,20},
    {"box-edge", line(-6,2,2,1,0,0), -10,20},
    {"box-vertices", line(-6,-6,-6,1,1,1), -10,30},
    {"origin-on-seam", line(2,0,0,0,1,0), -10,10},
    {"finite-truncated", line(-6,0,0,1,0,0), 0,3},
    {"negative-range", line(6,0,0,1,0,0), -12,-1},
    {"zero-range-face", line(-2,0,0,1,0,0), 0,0},
    {"zero-range-miss", line(-6,7,0,1,0,0), 0,0},
    {"reversed-range", line(-6,0,0,1,0,0), 20,-20},
    {"hit-after-reversed", line(-6,0,0,1,0,0), -10,20},
    {"oblique", line(-6,-3,1,1,0.37,-0.11), -10,30},
    {"miss-different-direction", line(7,-6,7,0,1,0), -10,20},
    {"axis-z-repeat", line(0,0,-6,0,0,1), -10,20},
  };
}
void add(Contexts& contexts, const std::string& name, const TopoDS_Shape& shape, const gp_Trsf& world) {
  auto context = std::make_unique<Context>();
  context->name = name;
  context->shape = shape.Moved(TopLoc_Location(world));
  context->world = world;
  TopExp::MapShapes(context->shape, TopAbs_FACE, context->faces);
  context->intersector.Load(context->shape, 1e-7);
  contexts.push_back(std::move(context));
}
Contexts load(const std::string& optionalFile) {
  std::vector<std::pair<std::string, TopoDS_Shape>> shapes = {
    {"box", BRepPrimAPI_MakeBox(gp_Pnt(-2,-2,-2),4,4,4).Shape()},
    {"cylinder", BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,-2),gp_Dir(0,0,1)),2,4).Shape()},
    {"sphere", BRepPrimAPI_MakeSphere(2).Shape()},
    {"torus", BRepPrimAPI_MakeTorus(3,1).Shape()},
    {"cone", BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(0,0,-2),gp_Dir(0,0,1)),2,0.5,4).Shape()},
  };
  if (!optionalFile.empty()) {
    std::ifstream input(optionalFile);
    if (!input) throw Standard_Failure("Cannot open optional BRep");
    TopoDS_Shape shape; BRep_Builder builder;
    BRepTools::Read(shape, input, builder);
    if (shape.IsNull()) throw Standard_Failure("Null optional BRep");
    shapes.push_back({"captured", shape});
  }
  gp_Trsf identity, translated, rotated;
  translated.SetTranslation(gp_Vec(11,-7,3));
  rotated.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,2,3)),0.371);
  rotated.SetTranslationPart(gp_Vec(-8,13,-2));
  Contexts contexts;
  for (const auto& [name, shape] : shapes) {
    add(contexts, name + "-original", shape, identity);
    add(contexts, name + "-located", shape, translated);
    add(contexts, name + "-rotated", shape, rotated);
  }
  return contexts;
}
bool perform(std::ostream& out, Context& context, const Query& query, int worker, int index) {
  const gp_Lin line = query.line.Transformed(context.world);
  bool exception = false;
  try { context.intersector.Perform(line, query.lo, query.hi); }
  catch (const Standard_Failure&) { exception = true; }
  const bool done = !exception && context.intersector.IsDone();
  const int count = context.intersector.NbPnt();
  out << "{\"shape\":\"" << context.name << "\",\"worker\":" << worker
      << ",\"query\":" << index << ",\"name\":\"" << query.name << "\",\"lo_bits\":";
  bits(out, query.lo); out << ",\"hi_bits\":"; bits(out, query.hi);
  const auto& origin = line.Location();
  const auto& direction = line.Direction();
  out << ",\"origin_bits\":["; bits(out, origin.X()); out << ','; bits(out, origin.Y()); out << ','; bits(out, origin.Z());
  out << "],\"direction_bits\":["; bits(out, direction.X()); out << ','; bits(out, direction.Y()); out << ','; bits(out, direction.Z());
  out << ']';
  out << ",\"exception\":" << (exception ? "true" : "false")
      << ",\"done\":" << (done ? "true" : "false") << ",\"nb_pnt\":" << count << ",\"hits\":[";
  bool pass = true;
  if (done) {
    for (int i = 1; i <= count; ++i) {
      if (i > 1) out << ',';
      const int face = context.faces.FindIndex(context.intersector.Face(i));
      pass = pass && face > 0;
      const auto& point = context.intersector.Pnt(i);
      out << "{\"face\":" << face << ",\"w_bits\":"; bits(out, context.intersector.WParameter(i));
      out << ",\"u_bits\":"; bits(out, context.intersector.UParameter(i));
      out << ",\"v_bits\":"; bits(out, context.intersector.VParameter(i));
      out << ",\"p_bits\":["; bits(out, point.X()); out << ','; bits(out, point.Y()); out << ','; bits(out, point.Z());
      out << "],\"state\":" << static_cast<int>(context.intersector.State(i))
          << ",\"transition\":" << static_cast<int>(context.intersector.Transition(i)) << '}';
    }
  }
  out << "]}\n";
  // Unsupported/degenerate ranges are observational; do not reinterpret status
  // or require tangent hit counts. Baseline/control/candidate equality is external.
  return pass;
}
int main(int argc, char** argv) {
  const std::string mode = argc > 1 ? argv[1] : "serial";
  if (mode != "serial" && mode != "threads") { std::cerr << "Expected serial|threads [optional.brep]\n"; return 2; }
  const std::string optionalFile = argc > 2 ? argv[2] : "";
  const int workers = mode == "threads" ? 4 : 1;
  try {
    std::array<Contexts,4> contexts;
    for (int worker = 0; worker < workers; ++worker) contexts[worker] = load(optionalFile);
    const auto rays = queries();
    std::array<std::ostringstream,4> output;
    std::array<bool,4> pass{true,true,true,true};
    std::barrier start(workers);
    const auto run = [&](int worker) {
      start.arrive_and_wait();
      for (auto& context : contexts[worker]) {
        for (std::size_t i = 0; i < rays.size(); ++i)
          pass[worker] = perform(output[worker], *context, rays[i], worker, static_cast<int>(i)) && pass[worker];
      }
    };
    if (workers == 1) run(0);
    else {
      std::array<std::thread,4> threads;
      for (int worker = 0; worker < workers; ++worker) threads[worker] = std::thread(run, worker);
      for (auto& thread : threads) thread.join();
    }
    bool valid = true;
    for (int worker = 0; worker < workers; ++worker) {
      std::cout << output[worker].str();
      valid = valid && pass[worker];
    }
    return valid ? 0 : 1;
  } catch (const Standard_Failure& failure) {
    std::cerr << "Fixture/load failure: " << failure.GetMessageString() << '\n'; return 1;
  }
}
