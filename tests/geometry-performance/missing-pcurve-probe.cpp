// Original serial public-SDK follow-up; no upstream code copied. No timings.
// Unlike eligibility guard, deliberately invokes missing-pcurve plane fallback.
// Pinned source: OCCT a016080bf6738d6aeae020badee4e888ad1540a5
// src/BRep/BRep_Tool.cxx:289,315,356; src/BRep/BRep_CurveOnSurface.cxx:69.
// Compile (main only): c++ -O2 -std=c++20 -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/missing-pcurve-probe.cpp -L.cache/kernel/sdk/lib
// -Wl,-rpath,$PWD/.cache/kernel/sdk/lib -lTKTopAlgo -lTKBRep -lTKG3d -lTKG2d
// -lTKGeomBase -lTKMath -lTKernel -o /tmp/missing-pcurve-probe
// Usage: missing-pcurve-probe file.brep [...]. Main holds global compute lock.
// Trusted captured BReps only: not an eligibility guard against custom subclasses.
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <BRep_TEdge.hxx>
#include <BRep_Builder.hxx>
#include <BRep_ListIteratorOfListOfCurveRepresentation.hxx>
#include <Geom_Curve.hxx>
#include <Geom_Surface.hxx>
#include <Geom_Plane.hxx>
#include <Geom_RectangularTrimmedSurface.hxx>
#include <Geom2d_Curve.hxx>
#include <Geom2d_TrimmedCurve.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

std::string quote(const char* text) {
  std::string output = "\"";
  const std::string hex = "0123456789abcdef";
  for (const unsigned char value : std::string(text ? text : "")) {
    if (value == '\\' || value == '"') { output += '\\'; output += value; }
    else if (value < 32) { output += "\\u00"; output += hex[value >> 4]; output += hex[value & 15]; }
    else output += value;
  }
  return output + '"';
}
template<class Base> const char* type(const opencascade::handle<Base>& object) {
  return object.IsNull() ? "null" : object->DynamicType()->Name();
}
std::string serialize(const TopoDS_Shape& shape) {
  std::ostringstream output;
  BRepTools::Write(shape, output, false, false, TopTools_FormatVersion_CURRENT);
  return output.str();
}
int representations(const TopoDS_Edge& edge) {
  const auto topology = Handle(BRep_TEdge)::DownCast(edge.TShape());
  int count = 0;
  for (BRep_ListIteratorOfListOfCurveRepresentation it(topology->Curves()); it.More(); it.Next()) ++count;
  return count;
}
bool matched(const TopoDS_Edge& edge, const Handle(Geom_Surface)& support, const TopLoc_Location& location) {
  const auto topology = Handle(BRep_TEdge)::DownCast(edge.TShape());
  const auto relative = location.Predivided(edge.Location());
  for (BRep_ListIteratorOfListOfCurveRepresentation it(topology->Curves()); it.More(); it.Next())
    if (it.Value()->IsCurveOnSurface(support, relative)) return true;
  return false;
}
struct Totals { int calls = 0, missing = 0, mismatches = 0, failures = 0; };
void incidence(const char* path, int faceIndex, int edgeIndex, const TopoDS_Face& face,
               const TopoDS_Edge& edge, bool predictedStored, Totals& totals) {
  ++totals.calls;
  double first = 0, last = 0; Standard_Boolean stored = false;
  TopLoc_Location location, curveLocation;
  const auto& support = BRep_Tool::Surface(face, location);
  double curveFirst = 0, curveLast = 0;
  const auto& curve = BRep_Tool::Curve(edge, curveLocation, curveFirst, curveLast);
  const int before = representations(edge);
  const auto pc = BRep_Tool::CurveOnSurface(edge, face, first, last, &stored);
  if (!stored) ++totals.missing;
  if (stored != predictedStored) ++totals.mismatches;
  if (stored && predictedStored) return;
  const auto trimmed = Handle(Geom2d_TrimmedCurve)::DownCast(pc);
  const auto surfaceTrim = Handle(Geom_RectangularTrimmedSurface)::DownCast(support);
  std::cout << "{\"type\":\"incidence\",\"file\":" << quote(path)
    << ",\"face\":" << faceIndex << ",\"edge\":" << edgeIndex
    << ",\"face_orientation\":" << face.Orientation() << ",\"edge_orientation\":" << edge.Orientation()
    << ",\"surface\":" << quote(type(support)) << ",\"curve3d\":" << quote(type(curve))
    << ",\"surface_basis\":" << quote(surfaceTrim.IsNull() ? type(support) : type(surfaceTrim->BasisSurface()))
    << ",\"predicted_stored\":" << (predictedStored ? "true" : "false")
    << ",\"sdk_stored\":" << (stored ? "true" : "false")
    << ",\"projected_pcurve\":" << quote(type(pc))
    << ",\"projected_basis\":" << quote(trimmed.IsNull() ? type(pc) : type(trimmed->BasisCurve()))
    << ",\"representations_before\":" << before << ",\"representations_after\":" << representations(edge)
    << ",\"nonnull_result\":" << (!pc.IsNull() ? "true" : "false") << "}\n";
}
void inspect(const char* path) {
  std::ifstream input(path);
  if (!input) throw Standard_Failure("Cannot open BRep");
  TopoDS_Shape shape; BRep_Builder builder;
  BRepTools::Read(shape, input, builder);
  if (shape.IsNull()) throw Standard_Failure("Null BRep");
  const auto before = serialize(shape);
  TopTools_IndexedMapOfShape faces, edges;
  TopExp::MapShapes(shape, TopAbs_FACE, faces);
  TopExp::MapShapes(shape, TopAbs_EDGE, edges);
  Totals totals;
  for (int index = 1; index <= faces.Extent(); ++index) {
    const auto face = TopoDS::Face(faces(index));
    TopLoc_Location location;
    const auto& support = BRep_Tool::Surface(face, location);
    for (TopExp_Explorer it(face, TopAbs_EDGE); it.More(); it.Next()) {
      const auto edge = TopoDS::Edge(it.Current());
      const bool predicted = matched(edge, support, location);
      for (const auto orientation : {TopAbs_FORWARD, TopAbs_REVERSED}) {
        try { incidence(path, index, edges.FindIndex(edge), face, TopoDS::Edge(edge.Oriented(orientation)), predicted, totals); }
        catch (const Standard_Failure& failure) {
          ++totals.failures;
          std::cout << "{\"type\":\"incidence_error\",\"file\":" << quote(path) << ",\"face\":" << index
            << ",\"edge\":" << edges.FindIndex(edge) << ",\"orientation\":" << orientation
            << ",\"error\":" << quote(failure.GetMessageString()) << "}\n";
        }
      }
    }
  }
  std::cout << "{\"type\":\"summary\",\"file\":" << quote(path) << ",\"calls\":" << totals.calls
    << ",\"missing_oriented_calls\":" << totals.missing << ",\"selector_mismatches\":" << totals.mismatches
    << ",\"exceptions\":" << totals.failures << ",\"brep_serialization_unchanged\":"
    << (before == serialize(shape) ? "true" : "false") << "}" << std::endl;
}
int main(int argc, char** argv) {
  if (argc < 2) { std::cerr << "Expected BRep paths\n"; return 2; }
  bool pass = true;
  for (int index = 1; index < argc; ++index) {
    try { inspect(argv[index]); }
    catch (const Standard_Failure& failure) {
      std::cout << "{\"type\":\"error\",\"file\":" << quote(argv[index])
        << ",\"error\":" << quote(failure.GetMessageString()) << "}" << std::endl;
      pass = false;
    }
  }
  return pass ? 0 : 1;
}
