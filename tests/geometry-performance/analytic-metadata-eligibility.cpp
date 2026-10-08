// Original serial public-SDK eligibility diagnostic; no upstream implementation copy.
// Compile (main only): c++ -O2 -std=c++20 -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/analytic-metadata-eligibility.cpp -L.cache/kernel/sdk/lib
// -Wl,-rpath,$PWD/.cache/kernel/sdk/lib -lTKTopAlgo -lTKBRep -lTKG3d -lTKG2d
// -lTKMath -lTKernel -o /tmp/analytic-metadata-eligibility
// Usage: analytic-metadata-eligibility file.brep [...]. Caller holds compute lock.
// Eligibility is a sufficient support-type filter, NOT a thread-safety certificate.
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <BRep_TEdge.hxx>
#include <BRep_TFace.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Curve3D.hxx>
#include <BRep_CurveOnSurface.hxx>
#include <BRep_CurveOnClosedSurface.hxx>
#include <BRep_CurveOn2Surfaces.hxx>
#include <BRep_Polygon3D.hxx>
#include <BRep_PolygonOnSurface.hxx>
#include <BRep_PolygonOnClosedSurface.hxx>
#include <BRep_PolygonOnTriangulation.hxx>
#include <BRep_PolygonOnClosedTriangulation.hxx>
#include <BRep_ListIteratorOfListOfCurveRepresentation.hxx>
#include <Geom_Plane.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <Geom_ConicalSurface.hxx>
#include <Geom_SphericalSurface.hxx>
#include <Geom_ToroidalSurface.hxx>
#include <Geom_RectangularTrimmedSurface.hxx>
#include <Geom_Line.hxx>
#include <Geom_Circle.hxx>
#include <Geom_Ellipse.hxx>
#include <Geom_Hyperbola.hxx>
#include <Geom_Parabola.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <Geom2d_Line.hxx>
#include <Geom2d_Circle.hxx>
#include <Geom2d_Ellipse.hxx>
#include <Geom2d_Hyperbola.hxx>
#include <Geom2d_Parabola.hxx>
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
#include <map>
#include <string>
#include <vector>

template<class... Types, class Base>
bool exact(const opencascade::handle<Base>& object) {
  return !object.IsNull() && ((object->DynamicType() == STANDARD_TYPE(Types)) || ...);
}
template<class Base> std::string type(const opencascade::handle<Base>& object) {
  return object.IsNull() ? "null" : object->DynamicType()->Name();
}
bool surface(Handle(Geom_Surface) value) {
  for (int depth = 0; depth < 16; ++depth) {
    if (exact<Geom_RectangularTrimmedSurface>(value)) {
      value = Handle(Geom_RectangularTrimmedSurface)::DownCast(value)->BasisSurface();
    } else return exact<Geom_Plane, Geom_CylindricalSurface, Geom_ConicalSurface,
                        Geom_SphericalSurface, Geom_ToroidalSurface>(value);
  }
  return false;
}
bool curve(Handle(Geom_Curve) value) {
  for (int depth = 0; depth < 16; ++depth) {
    if (exact<Geom_TrimmedCurve>(value)) value = Handle(Geom_TrimmedCurve)::DownCast(value)->BasisCurve();
    else return exact<Geom_Line, Geom_Circle, Geom_Ellipse, Geom_Hyperbola, Geom_Parabola>(value);
  }
  return false;
}
bool pcurve(Handle(Geom2d_Curve) value) {
  for (int depth = 0; depth < 16; ++depth) {
    if (exact<Geom2d_TrimmedCurve>(value)) value = Handle(Geom2d_TrimmedCurve)::DownCast(value)->BasisCurve();
    else return exact<Geom2d_Line, Geom2d_Circle, Geom2d_Ellipse, Geom2d_Hyperbola, Geom2d_Parabola>(value);
  }
  return false;
}
struct Audit {
  std::map<std::string, int> types, issues;
  int failures = 0, eligibleEdges = 0, eligibleFaces = 0, incidenceQueries = 0;
  int storedPcurves = 0, stored3d = 0, degenerateEdges = 0;
  void reject(const std::string& reason) { ++issues[reason]; ++failures; }
  template<class Base> bool check(const std::string& role, const opencascade::handle<Base>& value, bool allowed) {
    ++types[role + ":" + type(value)];
    if (!allowed) reject(role + ":" + type(value));
    return allowed;
  }
  void support(const Handle(Geom_Surface)& value) { check("stored-surface", value, surface(value)); }
  void twoDimensional(const Handle(Geom2d_Curve)& value) {
    ++storedPcurves;
    check("stored-pcurve", value, pcurve(value));
  }
};
void representation(Audit& audit, const Handle(BRep_CurveRepresentation)& rep) {
  if (exact<BRep_Curve3D>(rep)) {
    ++audit.stored3d;
    audit.check("stored-3d", rep->Curve3D(), curve(rep->Curve3D()));
  } else if (exact<BRep_CurveOnSurface, BRep_CurveOnClosedSurface>(rep)) {
    audit.support(rep->Surface());
    audit.twoDimensional(rep->PCurve());
    if (exact<BRep_CurveOnClosedSurface>(rep)) audit.twoDimensional(rep->PCurve2());
  } else if (exact<BRep_CurveOn2Surfaces>(rep)) {
    audit.support(rep->Surface());
    audit.support(rep->Surface2());
  } else if (exact<BRep_PolygonOnSurface, BRep_PolygonOnClosedSurface>(rep)) {
    audit.support(rep->Surface());
  } else if (!exact<BRep_Polygon3D, BRep_PolygonOnTriangulation, BRep_PolygonOnClosedTriangulation>(rep)) {
    audit.reject("unknown-representation:" + type(rep));
  }
}
std::vector<bool> edges(Audit& audit, const TopTools_IndexedMapOfShape& map) {
  std::vector<bool> eligible(map.Extent() + 1, false);
  for (int index = 1; index <= map.Extent(); ++index) {
    const int before = audit.failures;
    const auto edge = TopoDS::Edge(map(index));
    const auto topology = Handle(BRep_TEdge)::DownCast(edge.TShape());
    if (!exact<BRep_TEdge>(topology)) {
      audit.reject("unknown-edge-tshape:" + type(edge.TShape()));
      continue;
    }
    if (BRep_Tool::Degenerated(edge)) ++audit.degenerateEdges;
    for (BRep_ListIteratorOfListOfCurveRepresentation it(topology->Curves()); it.More(); it.Next())
      representation(audit, it.Value());
    if (audit.failures == before) {
      TopLoc_Location location; double first = 0, last = 0;
      const auto& c3d = BRep_Tool::Curve(edge, location, first, last);
      audit.check("selected-3d", c3d, curve(c3d)); // Reject null even if degenerate.
    }
    eligible[index] = audit.failures == before;
    if (eligible[index]) ++audit.eligibleEdges;
  }
  return eligible;
}
void faces(Audit& audit, const TopTools_IndexedMapOfShape& map,
           const TopTools_IndexedMapOfShape& edgeMap, const std::vector<bool>& eligibleEdges) {
  for (int index = 1; index <= map.Extent(); ++index) {
    const auto face = TopoDS::Face(map(index));
    if (!exact<BRep_TFace>(face.TShape())) {
      audit.reject("unknown-face-tshape:" + type(face.TShape()));
      continue;
    }
    TopLoc_Location location;
    const auto& support = BRep_Tool::Surface(face, location);
    const bool analyticSupport = surface(support);
    bool allowed = audit.check("face-surface", support, analyticSupport);
    for (TopExp_Explorer it(face, TopAbs_EDGE); it.More(); it.Next()) {
      const auto edge = TopoDS::Edge(it.Current());
      const int edgeIndex = edgeMap.FindIndex(edge);
      if (edgeIndex <= 0 || !eligibleEdges[edgeIndex] || !analyticSupport) {
        allowed = false;
        continue; // Do not invoke accessors on unsupported geometry/representations.
      }
      bool hasStored = false;
      const auto topology = Handle(BRep_TEdge)::DownCast(edge.TShape());
      const auto relativeLocation = location.Predivided(edge.Location());
      for (BRep_ListIteratorOfListOfCurveRepresentation rep(topology->Curves()); rep.More(); rep.Next()) {
        if (exact<BRep_CurveOnSurface, BRep_CurveOnClosedSurface>(rep.Value())
            && rep.Value()->IsCurveOnSurface(support, relativeLocation)) hasStored = true;
      }
      if (!hasStored) {
        audit.reject("missing-stored-incidence-pcurve");
        allowed = false;
        continue; // Avoid BRep_Tool's fallback projection entirely.
      }
      for (const auto orientation : {TopAbs_FORWARD, TopAbs_REVERSED}) {
        ++audit.incidenceQueries;
        double first = 0, last = 0; Standard_Boolean stored = false;
        const auto pc = BRep_Tool::CurveOnSurface(TopoDS::Edge(edge.Oriented(orientation)), face, first, last, &stored);
        const bool analytic = audit.check("incidence-pcurve", pc, pcurve(pc));
        if (!stored) audit.reject("missing-stored-incidence-pcurve");
        allowed = analytic && stored && allowed;
      }
    }
    if (allowed) ++audit.eligibleFaces;
  }
}
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
void dictionary(const std::map<std::string, int>& values) {
  std::cout << '{'; bool comma = false;
  for (const auto& [key, value] : values) {
    if (comma) std::cout << ',';
    std::cout << quote(key.c_str()) << ':' << value; comma = true;
  }
  std::cout << '}';
}
void inspect(const char* path) {
  std::ifstream input(path);
  if (!input) throw Standard_Failure("Cannot open input BRep");
  TopoDS_Shape shape; BRep_Builder builder;
  BRepTools::Read(shape, input, builder);
  if (shape.IsNull()) throw Standard_Failure("Null BRep");
  TopTools_IndexedMapOfShape faceMap, edgeMap;
  TopExp::MapShapes(shape, TopAbs_FACE, faceMap);
  TopExp::MapShapes(shape, TopAbs_EDGE, edgeMap);
  Audit audit;
  const auto eligibleEdges = edges(audit, edgeMap);
  faces(audit, faceMap, edgeMap, eligibleEdges);
  if (faceMap.IsEmpty() || edgeMap.IsEmpty()) audit.reject("empty-face-or-edge-set");
  std::cout << "{\"file\":" << quote(path) << ",\"whole_body_eligible\":" << (audit.failures == 0 ? "true" : "false")
    << ",\"faces\":" << faceMap.Extent() << ",\"eligible_faces\":" << audit.eligibleFaces
    << ",\"edges\":" << edgeMap.Extent() << ",\"eligible_edges\":" << audit.eligibleEdges
    << ",\"degenerate_edges\":" << audit.degenerateEdges << ",\"oriented_incidence_queries\":" << audit.incidenceQueries
    << ",\"stored_pcurves\":" << audit.storedPcurves << ",\"stored_3d_curves\":" << audit.stored3d << ",\"types\":";
  dictionary(audit.types); std::cout << ",\"issues\":"; dictionary(audit.issues);
  std::cout << ",\"note\":\"Support eligibility only: no meshing/validity check, threading, synchronization, algorithm race proof, or performance claim.\"}" << std::endl;
}
int main(int argc, char** argv) {
  if (argc < 2) { std::cerr << "Expected input.brep paths\n"; return 2; }
  bool pass = true;
  for (int i = 1; i < argc; ++i) {
    try { inspect(argv[i]); }
    catch (const Standard_Failure& failure) {
      std::cout << "{\"file\":" << quote(argv[i]) << ",\"whole_body_eligible\":false,\"error\":"
                << quote(failure.GetMessageString()) << "}" << std::endl;
      pass = false;
    }
  }
  return pass ? 0 : 1; // Unsupported support is a diagnostic result, not process failure.
}
