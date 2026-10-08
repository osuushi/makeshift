#include "kernel.h"
#include "circular-rim.h"
#include "timing.h"
#include "blends.h"
#include "offset-thickness.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Poly_Triangulation.hxx>
#include <OSD_ThreadPool.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>
#include <set>

namespace {
void xyz(std::ostream& out, const gp_XYZ& p) { out << '[' << p.X() << ',' << p.Y() << ',' << p.Z() << ']'; }
void numbers(std::ostream& out, const std::vector<double>& values) {
    out << '['; for (size_t i = 0; i < values.size(); ++i) { if (i) out << ','; out << values[i]; } out << ']';
}
void origins(std::ostream& out, const TopoDS_Shape& shape, const Result& result) {
    std::set<std::string> ids;
    for (const auto& source : result.predecessors) if (shape.IsSame(source.shape)) ids.insert(source.id);
    out << '['; bool comma = false;
    for (const auto& id : ids) { if (comma) out << ','; comma = true; out << quoted(id); } out << ']';
}
void analyticSurfaces(std::ostream& out, const TopoDS_Face& shape, const BRepAdaptor_Surface& surface) {
    out << ",\"cylinder\":";
    if (surface.GetType() == GeomAbs_Cylinder) {
        const auto cylinder = surface.Cylinder();
        out << "{\"origin\":"; xyz(out, cylinder.Location().XYZ());
        out << ",\"axis\":"; xyz(out, cylinder.Axis().Direction().XYZ());
        out << ",\"radius\":" << cylinder.Radius();
        out << ",\"outward\":" << ((shape.Orientation() == TopAbs_REVERSED ? -1 : 1) * (cylinder.Direct() ? 1 : -1)) << '}';
    } else out << "null";
    out << ",\"cone\":";
    if (surface.GetType() == GeomAbs_Cone) {
        const auto cone = surface.Cone();
        const double sign = cone.SemiAngle() < 0 ? -1 : 1;
        out << "{\"apex\":"; xyz(out, cone.Apex().XYZ());
        out << ",\"axis\":"; xyz(out, cone.Axis().Direction().XYZ() * sign);
        out << ",\"semiAngle\":" << std::abs(cone.SemiAngle()) * 180 / std::acos(-1.0);
        out << ",\"outward\":" << ((shape.Orientation() == TopAbs_REVERSED ? -1 : 1) * (cone.Direct() ? 1 : -1)) << '}';
    } else out << "null";
    out << ",\"sphere\":";
    if (surface.GetType() == GeomAbs_Sphere) {
        const auto sphere = surface.Sphere();
        out << "{\"radius\":" << sphere.Radius();
        out << ",\"outward\":" << ((shape.Orientation() == TopAbs_REVERSED ? -1 : 1) * (sphere.Direct() ? 1 : -1)) << '}';
    } else out << "null";
}
void face(std::ostream& out, const TopoDS_Face& shape, const TopTools_IndexedMapOfShape& edges, const std::vector<BlendFace>& blends, const std::vector<BlendFace>& chamfers, const TopTools_IndexedMapOfShape& faces, const TopoDS_Shape& body) {
    out << ",\"edgeIndexes\":[";
    bool first = true;
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next()) {
        if (BRep_Tool::Degenerated(TopoDS::Edge(e.Current()))) continue;
        if (!first) out << ','; first = false;
        out << edges.FindIndex(e.Current()) - 1;
    }
    out << ']';
    out << ",\"vertices\":[";
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
    BRepAdaptor_Surface surface(shape);
    analyticSurfaces(out, shape, surface);
    presentOffsetThickness(out, shape, faces, body);
    const auto blend = std::find_if(blends.begin(), blends.end(), [&](const BlendFace& b) { return b.face.IsSame(shape); });
    out << ",\"offsetFaceIndexes\":[";
    const auto chain = tangentFaceChain(body, {shape});
    for (size_t i = 0; i < chain.size(); ++i) { if (i) out << ','; out << faces.FindIndex(chain[i])-1; }
    out << ']';
    out << ",\"blend\":";
    if (blend == blends.end()) out << "null";
    else {
        out << "{\"radius\":" << blend->radius << ",\"outward\":" << blend->outward << ",\"faceIndexes\":[";
        const auto group = blendGroup(blends, {shape});
        for (size_t i=0; i<group.size(); ++i) { if (i) out << ','; out << faces.FindIndex(group[i])-1; }
        out << "]}";
    }
    out << ",\"chamfer\":";
    const auto chamfer = std::find_if(chamfers.begin(), chamfers.end(), [&](const auto& c) { return c.face.IsSame(shape); });
    const bool chamferChain = chamfer != chamfers.end() && std::all_of(chain.begin(), chain.end(), [&](const auto& face) {
        return std::any_of(chamfers.begin(), chamfers.end(), [&](const auto& c) {
            return c.face.IsSame(face) && std::abs(c.radius-chamfer->radius) < 1e-6;
        });
    });
    if (!chamferChain) out << "null";
    else {
        out << "{\"distance\":" << chamfer->radius << ",\"distanceScale\":" << chamfer->distanceScale << ",\"outward\":" << chamfer->outward << ",\"faceIndexes\":[";
        for (size_t i=0; i<chain.size(); ++i) { if (i) out << ','; out << faces.FindIndex(chain[i])-1; }
        out << "]}";
    }
    out << ",\"offsetHandle\":";
    if (surface.GetType() == GeomAbs_Cone || surface.GetType() == GeomAbs_Sphere || blend != blends.end()) {
        gp_Pnt center; gp_Vec du, dv;
        surface.D1((surface.FirstUParameter()+surface.LastUParameter())/2,
                   (surface.FirstVParameter()+surface.LastVParameter())/2, center, du, dv);
        auto normal = du.Crossed(dv).Normalized();
        if (shape.Orientation() == TopAbs_REVERSED) normal.Reverse();
        out << "{\"center\":"; xyz(out, center.XYZ()); out << ",\"normal\":"; xyz(out, normal.XYZ()); out << '}';
    } else out << "null";
    out << ",\"plane\":";
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
void analyticEdge(std::ostream& out, const TopoDS_Edge& shape, const BRepAdaptor_Curve& curve) {
    const double a = curve.FirstParameter(), b = curve.LastParameter();
    out << ",\"curve\":";
    if (const auto rim = circularRim(shape)) {
        const auto circle = *rim;
        out << "{\"kind\":\"circle\",\"center\":"; xyz(out, circle.Location().XYZ());
        out << ",\"normal\":"; xyz(out, circle.Axis().Direction().XYZ());
        out << ",\"radius\":" << circle.Radius() << '}'; return;
    }
    if (curve.GetType() != GeomAbs_Line && curve.GetType() != GeomAbs_Circle) { out << "null"; return; }
    out << "{\"kind\":" << quoted(curve.GetType() == GeomAbs_Line ? "line" : "arc") << ",\"a\":";
    xyz(out, curve.Value(a).XYZ()); out << ",\"b\":"; xyz(out, curve.Value(b).XYZ());
    if (curve.GetType() == GeomAbs_Circle) { out << ",\"mid\":"; xyz(out, curve.Value((a + b) / 2).XYZ()); }
    out << '}';
}
void edge(std::ostream& out, const TopoDS_Edge& shape) {
    BRepAdaptor_Curve curve(shape); const double a = curve.FirstParameter(), b = curve.LastParameter();
    analyticEdge(out, shape, curve);
    int count = 1;
    if (curve.GetType() == GeomAbs_Circle) {
        const double radius = curve.Circle().Radius();
        const double step = 2 * std::acos(std::clamp(1 - 0.03 / radius, -1.0, 1.0));
        count = std::clamp(int(std::ceil(std::abs(b - a) / std::max(step, 0.001))), 8, 4096);
    } else if (curve.GetType() != GeomAbs_Line) count = 128;
    out << ",\"points\":[";
    for (int i = 0; i <= count; ++i) {
        if (i) out << ','; const auto p = curve.Value(a + (b - a) * i / count);
        out << p.X() << ',' << p.Y() << ',' << p.Z();
    }
    out << ']';
}
}
std::vector<double> signature(const TopoDS_Shape& shape) {
    GProp_GProps props; int type;
    if (shape.ShapeType() == TopAbs_FACE) {
        BRepGProp::SurfaceProperties(shape, props); type = BRepAdaptor_Surface(TopoDS::Face(shape)).GetType();
    } else { BRepGProp::LinearProperties(shape, props); type = BRepAdaptor_Curve(TopoDS::Edge(shape)).GetType(); }
    const auto center = props.CentreOfMass();
    return {double(type), double(shape.Orientation()), props.Mass(), center.X(), center.Y(), center.Z()};
}
void present(std::ostream& out, const Result& result, double deflection) {
    KernelTiming timing("presentation");
    if (!std::isfinite(deflection) || deflection < 1e-5 || deflection > 0.05)
        throw std::runtime_error("Invalid mesh deflection");
    BRepMesh_IncrementalMesh mesh(result.shape, deflection, false, 0.2, OSD_ThreadPool::DefaultPool()->HasThreads());
    for (TopExp_Explorer faces(result.shape, TopAbs_FACE); faces.More(); faces.Next()) {
        TopLoc_Location location;
        const auto triangles = BRep_Tool::Triangulation(TopoDS::Face(faces.Current()), location);
        if (triangles.IsNull() || triangles->NbTriangles() == 0)
            throw std::runtime_error("Kernel could not mesh every face; the geometry result was rejected");
    }
    timing.phase("mesh");
    out << "{\"brep\":" << quoted(encode(result.shape)) << ",\"volume\":"
        << (result.exactVolume ? *result.exactVolume : volume(result.shape));
    GProp_GProps properties; BRepGProp::VolumeProperties(result.shape, properties, 1e-10);
    out << ",\"center\":"; xyz(out, properties.CentreOfMass().XYZ());
    out << ",\"copy\":" << (result.copy ? "true" : "false") << ",\"predecessorBodies\":[";
    for (size_t i = 0; i < result.bodies.size(); ++i) { if (i) out << ','; out << quoted(result.bodies[i]); }
    // Transform handles need surface extrema, not rational spline control-hull bounds.
    Bnd_Box box; BRepBndLib::AddOptimal(result.shape, box, false, false);
    double x, y, z, X, Y, Z; box.Get(x, y, z, X, Y, Z);
    out << "],\"bounds\":"; numbers(out, {x, y, z, X, Y, Z});
    TopTools_IndexedMapOfShape edges; TopExp::MapShapes(result.shape, TopAbs_EDGE, edges);
    TopTools_IndexedMapOfShape faces; TopExp::MapShapes(result.shape, TopAbs_FACE, faces);
    const auto blends = recognizeBlends(result.shape);
    const auto chamfers = recognizeChamfers(result.shape);
    timing.phase("properties-and-blends");
    for (const auto type : {TopAbs_FACE, TopAbs_EDGE}) {
        out << (type == TopAbs_FACE ? ",\"faces\":[" : ",\"edges\":[");
        TopTools_IndexedMapOfShape shapes; TopExp::MapShapes(result.shape, type, shapes);
        for (int i = 1; i <= shapes.Extent(); ++i) {
            if (i > 1) out << ',';
            out << "{\"predecessors\":"; origins(out, shapes(i), result);
            out << ",\"signature\":"; numbers(out, signature(shapes(i)));
            if (type == TopAbs_FACE) {
                const bool selected = std::any_of(result.selectedFaces.begin(), result.selectedFaces.end(),
                    [&](const TopoDS_Face& face) { return face.IsSame(shapes(i)); });
                out << ",\"offsetSelected\":" << (selected ? "true" : "false");
            }
            if (type == TopAbs_FACE) face(out, TopoDS::Face(shapes(i)), edges, blends, chamfers, faces, result.shape); else edge(out, TopoDS::Edge(shapes(i)));
            out << '}';
        }
        out << ']';
    }
    out << '}';
    timing.phase("topology-and-json");
}
