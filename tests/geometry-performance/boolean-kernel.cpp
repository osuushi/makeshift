// Original kernel-only research harness; API checked against OCCT 7.9.3 SDK headers.
// No upstream implementation copied. Run only while holding the shared compute lock.
// Example: flock /tmp/makeshift-geometry-compute.lock ./boolean-kernel 12
// Compile (from repo root): c++ -O3 -DNDEBUG -std=c++20 -I.cache/kernel/sdk/include/opencascade
//   tests/geometry-performance/boolean-kernel.cpp -L.cache/kernel/sdk/lib
//   -Wl,--disable-new-dtags,-rpath,$PWD/.cache/kernel/sdk/lib -lTKBool -lTKBO -lTKPrim -lTKTopAlgo
//   -lTKBRep -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/boolean-kernel
#include <BOPAlgo_PaveFiller.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRep_Builder.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Ax2.hxx>
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <memory>
#include <random>
#include <string>
#include <vector>

using Clock = std::chrono::steady_clock;
double elapsed(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
struct Fixture {
  std::string name;
  TopoDS_Shape base;
  std::vector<TopoDS_Shape> tools;
};
struct Config {
  std::string mode;
  bool obb;
  bool history;
};
struct Result {
  std::vector<TopoDS_Shape> shapes;
  double ms = 0;
  double fillerMs = 0;
  double assemblyMs = 0;
  bool done = true;
  bool warnings = false;
};
TopTools_ListOfShape list(const TopoDS_Shape& shape) {
  TopTools_ListOfShape result;
  result.Append(shape);
  return result;
}
Fixture fixture(const std::string& layout, int count) {
  Fixture f{layout + "-" + std::to_string(count),
            BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), 24, 24, 10).Shape(), {}};
  for (int i = 0; i < count; ++i) {
    const double x = 3 + (i % 4) * 5;
    const double y = 3 + (i / 4) * 5;
    if (layout == "sparse") {
      f.tools.push_back(BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(x + 30, y, -2), gp_Dir(0, 0, 1)), 1.3, 14).Shape());
    } else {
      const gp_Dir axis = layout == "oblique" ? gp_Dir(0.3, 0.17, 1) : gp_Dir(0, 0, 1);
      f.tools.push_back(BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(x, y, -2), axis), 1.3, 16).Shape());
    }
  }
  return f;
}
void options(BRepAlgoAPI_BooleanOperation& op, const Config& config,
             const TopoDS_Shape& base, const TopTools_ListOfShape& tools) {
  op.SetArguments(list(base));
  op.SetTools(tools);
  op.SetNonDestructive(true);
  op.SetRunParallel(false);
  op.SetUseOBB(config.obb);
  op.SetToFillHistory(config.history);
}
void build(BRepAlgoAPI_BooleanOperation& op, Result& result) {
  op.Build();
  result.done = result.done && op.IsDone() && !op.HasErrors();
  result.warnings = result.warnings || op.HasWarnings();
}
Result booleanRun(const Fixture& f, const Config& config) {
  Result result;
  const bool fuse = config.mode.find("fuse") != std::string::npos;
  const bool sequential = config.mode.find("sequential") != std::string::npos;
  const auto start = Clock::now();
  if (sequential) {
    TopoDS_Shape current = f.base;
    for (const auto& tool : f.tools) {
      if (fuse) {
        BRepAlgoAPI_Fuse op;
        options(op, config, current, list(tool));
        build(op, result);
        if (!result.done) break;
        current = op.Shape();
      } else {
        BRepAlgoAPI_Cut op;
        options(op, config, current, list(tool));
        build(op, result);
        if (!result.done) break;
        current = op.Shape();
      }
    }
    result.shapes.push_back(current);
  } else {
    TopTools_ListOfShape tools;
    for (const auto& tool : f.tools) tools.Append(tool);
    if (fuse) {
      BRepAlgoAPI_Fuse op;
      options(op, config, f.base, tools);
      build(op, result);
      if (result.done) result.shapes.push_back(op.Shape());
    } else {
      BRepAlgoAPI_Cut op;
      options(op, config, f.base, tools);
      build(op, result);
      if (result.done) result.shapes.push_back(op.Shape());
    }
  }
  result.ms = elapsed(start);
  return result;
}
// Pair study deliberately uses exactly two shapes: one box, one cylinder.
// No multi-tool Common is substituted for sequential pairwise intersections.
Result pairRun(const Fixture& f, const Config& config) {
  Result result;
  const auto start = Clock::now();
  if (config.mode == "pair-reused") {
    BOPAlgo_PaveFiller filler;
    TopTools_ListOfShape inputs = list(f.base);
    inputs.Append(f.tools.front());
    filler.SetArguments(inputs);
    filler.SetNonDestructive(true);
    filler.SetRunParallel(false);
    filler.SetUseOBB(config.obb);
    const auto fillStart = Clock::now();
    filler.Perform();
    result.fillerMs = elapsed(fillStart);
    result.done = !filler.HasErrors();
    result.warnings = filler.HasWarnings();
    if (result.done) {
      const auto assemblyStart = Clock::now();
      BRepAlgoAPI_Common common(filler);
      options(common, config, f.base, list(f.tools.front()));
      build(common, result);
      if (common.IsDone() && !common.HasErrors()) result.shapes.push_back(common.Shape());
      BRepAlgoAPI_Cut cut(filler);
      options(cut, config, f.base, list(f.tools.front()));
      build(cut, result);
      if (cut.IsDone() && !cut.HasErrors()) result.shapes.push_back(cut.Shape());
      result.assemblyMs = elapsed(assemblyStart);
    }
  } else {
    BRepAlgoAPI_Common common;
    options(common, config, f.base, list(f.tools.front()));
    build(common, result);
    if (common.IsDone() && !common.HasErrors()) result.shapes.push_back(common.Shape());
    BRepAlgoAPI_Cut cut;
    options(cut, config, f.base, list(f.tools.front()));
    build(cut, result);
    if (cut.IsDone() && !cut.HasErrors()) result.shapes.push_back(cut.Shape());
  }
  result.ms = elapsed(start);
  return result;
}
void summary(const TopoDS_Shape& shape) {
  TopTools_IndexedMapOfShape faces, edges, solids;
  TopExp::MapShapes(shape, TopAbs_FACE, faces);
  TopExp::MapShapes(shape, TopAbs_EDGE, edges);
  TopExp::MapShapes(shape, TopAbs_SOLID, solids);
  GProp_GProps props;
  BRepGProp::VolumeProperties(shape, props);
  // Keep classifiers at stable addresses: their solid explorers own cached state.
  std::vector<std::unique_ptr<BRepClass3d_SolidClassifier>> classifiers;
  for (int i = 1; i <= solids.Extent(); ++i) {
    classifiers.push_back(std::make_unique<BRepClass3d_SolidClassifier>(solids(i)));
  }
  std::string occupancy;
  // Fixed non-grid-aligned probes: material equivalence, not topology equivalence.
  for (int z = 0; z < 3; ++z) {
    for (int y = 0; y < 7; ++y) {
      for (int x = 0; x < 12; ++x) {
        const gp_Pnt point(0.731 + x * 4.13, 0.917 + y * 3.41, -0.383 + z * 5.23);
        char state = 'O';
        for (const auto& classifier : classifiers) {
          classifier->Perform(point, 1e-7);
          if (classifier->State() == TopAbs_IN) { state = 'I'; break; }
          if (classifier->State() == TopAbs_ON) state = 'B';
          if (classifier->State() == TopAbs_UNKNOWN && state == 'O') state = 'U';
        }
        occupancy += state;
      }
    }
  }
  std::cout << "{\"valid\":" << (BRepCheck_Analyzer(shape).IsValid() ? "true" : "false")
            << ",\"volume\":" << props.Mass() << ",\"faces\":" << faces.Extent()
            << ",\"edges\":" << edges.Extent() << ",\"solids\":" << solids.Extent()
            << ",\"occupancy\":\"" << occupancy << "\"}";
}
void record(const Fixture& f, const Config& config, int block, const Result& result) {
  std::cout << "{\"case\":\"" << f.name << "\",\"config\":\"" << config.mode
            << "\",\"obb\":" << (config.obb ? "true" : "false")
            << ",\"history\":" << (config.history ? "true" : "false")
            << ",\"block\":" << block << ",\"build_ms\":" << result.ms
            << ",\"filler_ms\":" << result.fillerMs << ",\"assembly_ms\":" << result.assemblyMs
            << ",\"done\":" << (result.done ? "true" : "false")
            << ",\"warnings\":" << (result.warnings ? "true" : "false") << ",\"results\":[";
  for (std::size_t i = 0; i < result.shapes.size(); ++i) {
    if (i) std::cout << ',';
    summary(result.shapes[i]);
  }
  std::cout << "]}" << std::endl;
}
int main(int argc, char** argv) {
  const int samples = argc > 1 ? std::max(1, std::atoi(argv[1])) : 8;
  const std::string filter = argc > 2 ? argv[2] : "";
  std::cout << std::setprecision(12);
  std::mt19937 random(20261008);
  for (const std::string layout : {"dense", "sparse", "oblique"}) {
    for (const int count : {4, 16}) {
      const Fixture f = fixture(layout, count);
      if (!filter.empty() && f.name.find(filter) == std::string::npos) continue;
      std::vector<Config> configs;
      for (const std::string mode : {"fuse-sequential", "fuse-batched", "cut-sequential",
                                     "cut-batched", "pair-separate", "pair-reused"}) {
        // Pair cases do not depend on tool count; avoid redundant measurements.
        if (count == 16 && mode.find("pair") == 0) continue;
        for (bool obb : {false, true}) {
          for (bool history : {false, true}) configs.push_back({mode, obb, history});
        }
      }
      // Block -1 is the full warmup; retain it for cold/steady-state analysis.
      for (int block = -1; block < samples; ++block) {
        std::shuffle(configs.begin(), configs.end(), random);
        for (const auto& config : configs) {
          try {
            const Result result = config.mode.find("pair") == 0
              ? pairRun(f, config) : booleanRun(f, config);
            record(f, config, block, result);
          } catch (const Standard_Failure&) {
            Result failed;
            failed.done = false;
            record(f, config, block, failed);
          }
        }
      }
    }
  }
}
