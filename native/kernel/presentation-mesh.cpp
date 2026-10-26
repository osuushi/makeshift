#include "presentation-mesh.h"
#include "timing.h"
#include <BRepBndLib.hxx>
#include <BRepLib_ToolTriangulatedShape.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <gp_Pln.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <OSD_ThreadPool.hxx>
#include <Poly_PolygonOnTriangulation.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <cmath>
#include <set>

namespace {
void xyz(std::ostream& out, const gp_XYZ& p) { out << '[' << p.X() << ',' << p.Y() << ',' << p.Z() << ']'; }
void sources(std::ostream& out, const TopoDS_Shape& shape, const Result& result) {
    std::set<std::string> ids;
    for (const auto& source : result.predecessors)
        if (source.shape.IsSame(shape)) ids.insert(source.id);
    out << '[';
    bool comma = false;
    for (const auto& id : ids) { if (comma) out << ','; comma = true; out << quoted(id); }
    out << ']';
}
}
void presentPlane(std::ostream& out, const TopoDS_Face& shape) {
    BRepAdaptor_Surface surface(shape);
    if (surface.GetType() != GeomAbs_Plane) { out << "null"; return; }
    const auto plane = surface.Plane();
    auto normal = gp_Dir(gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection())));
    if (shape.Orientation() == TopAbs_REVERSED) normal.Reverse();
    const gp_Vec n(normal), origin = n * gp_Vec(plane.Location().XYZ()).Dot(n);
    gp_Vec reference = std::abs(normal.X()) < 0.9 ? gp_Vec(1, 0, 0) : gp_Vec(0, 1, 0);
    const auto u = (reference - n * reference.Dot(n)).Normalized();
    const auto v = n.Crossed(u);
    out << "{\"origin\":"; xyz(out, origin.XYZ()); out << ",\"u\":"; xyz(out, u.XYZ());
    out << ",\"v\":"; xyz(out, v.XYZ()); out << '}';
}

void meshPresentation(const TopoDS_Shape& shape, double deflection) {
    if (!std::isfinite(deflection) || deflection < 1e-5 || deflection > 0.05)
        throw std::runtime_error("Invalid mesh deflection");
    BRepMesh_IncrementalMesh mesh(shape, deflection, false, 0.2, OSD_ThreadPool::DefaultPool()->HasThreads());
    for (TopExp_Explorer faces(shape, TopAbs_FACE); faces.More(); faces.Next()) {
        TopLoc_Location location;
        const auto triangles = BRep_Tool::Triangulation(TopoDS::Face(faces.Current()), location);
        if (triangles.IsNull() || triangles->NbTriangles() == 0)
            throw std::runtime_error("Kernel could not mesh every face; the geometry result was rejected");
    }
}

void presentVertices(std::ostream& out, const TopoDS_Face& shape) {
    out << '[';
    TopLoc_Location location; const auto mesh = BRep_Tool::Triangulation(shape, location);
    bool comma = false;
    if (!mesh.IsNull()) for (int i = 1; i <= mesh->NbTriangles(); ++i) {
        int a, b, c; mesh->Triangle(i).Get(a, b, c);
        if (shape.Orientation() == TopAbs_REVERSED) std::swap(b, c);
        for (int index : {a, b, c}) {
            if (comma) out << ','; comma = true;
            const auto p = mesh->Node(index).Transformed(location.Transformation());
            out << p.X() << ',' << p.Y() << ',' << p.Z();
        }
    }
    out << ']';
}

void presentNormals(std::ostream& out, const TopoDS_Face& shape) {
    out << '[';
    TopLoc_Location location;
    const auto mesh = BRep_Tool::Triangulation(shape, location);
    bool comma = false;
    if (!mesh.IsNull()) {
        BRepLib_ToolTriangulatedShape::ComputeNormals(shape, mesh);
        for (int i = 1; i <= mesh->NbTriangles(); ++i) {
            int a, b, c;
            mesh->Triangle(i).Get(a, b, c);
            if (shape.Orientation() == TopAbs_REVERSED) std::swap(b, c);
            for (int index : {a, b, c}) {
                auto normal = mesh->Normal(index).Transformed(location.Transformation());
                if (shape.Orientation() == TopAbs_REVERSED) normal.Reverse();
                if (comma) out << ',';
                comma = true;
                out << normal.X() << ',' << normal.Y() << ',' << normal.Z();
            }
        }
    }
    out << ']';
}

// Use the active face mesh, not an independently sampled curve: curved chords
// with different endpoints can fall inside the triangles they should outline.
std::vector<std::vector<gp_Pnt>> meshEdges(const TopTools_IndexedMapOfShape& faces,
                                        const TopTools_IndexedMapOfShape& edges) {
    std::vector<std::vector<gp_Pnt>> points(edges.Extent());
    for (int i = 1; i <= faces.Extent(); ++i) {
        const auto face = TopoDS::Face(faces(i));
        TopLoc_Location location;
        const auto mesh = BRep_Tool::Triangulation(face, location);
        if (mesh.IsNull()) continue;
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            auto& samples = points[edges.FindIndex(edge) - 1];
            if (!samples.empty() || BRep_Tool::Degenerated(edge)) continue;
            const auto polygon = BRep_Tool::PolygonOnTriangulation(edge, mesh, location);
            if (polygon.IsNull()) continue;
            for (int j = 1; j <= polygon->NbNodes(); ++j)
                samples.push_back(mesh->Node(polygon->Node(j)).Transformed(location.Transformation()));
        }
    }
    return points;
}

// Visual data has no exact body, topology identity, or editing metadata.
void presentVisual(std::ostream& out, const Result& result, double deflection) {
    KernelTiming timing("visual-presentation");
    meshPresentation(result.shape, deflection);
    timing.phase("mesh");
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(result.shape, bounds, false, false);
    double values[6];
    bounds.Get(values[0], values[1], values[2], values[3], values[4], values[5]);
    out << "{\"bounds\":[";
    for (int i = 0; i < 6; ++i) { if (i) out << ','; out << values[i]; }
    out << "],\"faces\":[";
    TopTools_IndexedMapOfShape faces, edges;
    TopExp::MapShapes(result.shape, TopAbs_FACE, faces);
    TopExp::MapShapes(result.shape, TopAbs_EDGE, edges);
    std::set<int> seams;
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (i > 1) out << ',';
        const auto face = TopoDS::Face(faces(i));
        presentVertices(out, face);
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next())
            if (BRep_Tool::IsClosed(TopoDS::Edge(e.Current()), face))
                seams.insert(edges.FindIndex(e.Current()) - 1);
    }
    out << "],\"normals\":[";
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (i > 1) out << ',';
        presentNormals(out, TopoDS::Face(faces(i)));
    }
    out << "],\"planes\":[";
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (i > 1) out << ',';
        presentPlane(out, TopoDS::Face(faces(i)));
    }
    out << "],\"edges\":[";
    const auto samples = meshEdges(faces, edges);
    bool comma = false;
    for (size_t i = 0; i < samples.size(); ++i) {
        if (seams.contains(int(i)) || samples[i].size() < 2) continue;
        if (comma) out << ',';
        comma = true;
        out << '[';
        for (size_t j = 0; j < samples[i].size(); ++j) {
            if (j) out << ',';
            const auto& p = samples[i][j];
            out << p.X() << ',' << p.Y() << ',' << p.Z();
        }
        out << ']';
    }
    out << "],\"sourceBodies\":[";
    for (size_t i = 0; i < result.bodies.size(); ++i) {
        if (i) out << ',';
        out << quoted(result.bodies[i]);
    }
    out << "],\"sourceFaces\":[";
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (i > 1) out << ',';
        sources(out, faces(i), result);
    }
    out << "],\"sourceEdges\":[";
    comma = false;
    for (size_t i = 0; i < samples.size(); ++i) {
        if (seams.contains(int(i)) || samples[i].size() < 2) continue;
        if (comma) out << ',';
        comma = true;
        sources(out, edges(int(i) + 1), result);
    }
    out << "]}";
    timing.phase("mesh-json");
}
