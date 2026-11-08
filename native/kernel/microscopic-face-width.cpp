#include "microscopic-face-width.h"
#include "face-width-mesh.h"
#include "timing.h"
#include "microscopic-face-size.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <IMeshTools_Parameters.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Poly_PolygonOnTriangulation.hxx>
#include <Poly_Triangulation.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <algorithm>
#include <optional>

namespace {
struct Meshed {
    face_width::Mesh data;
    bool wideWitness = false;
};
std::optional<Meshed> triangulate(const TopoDS_Face &source, double deflection,
                                  double witnessWidth = 0) {
    const auto face = TopoDS::Face(BRepBuilderAPI_Copy(source, true, false).Shape());
    BRepTools::Clean(face);
    IMeshTools_Parameters parameters;
    parameters.Deflection = deflection;
    parameters.Angle = 0.2;
    // Keep the established coarse sampler and curved-surface mesher. Detailed
    // planar trims benefit from Delabella without changing boundary accuracy.
    if (witnessWidth == 0 && BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane)
        parameters.MeshAlgo = IMeshTools_MeshAlgoType_Delabella;
    BRepMesh_IncrementalMesh mesher(face, parameters);
    TopLoc_Location location;
    const auto mesh = BRep_Tool::Triangulation(face, location);
    if (mesh.IsNull() || mesh->NbTriangles() == 0)
        return {};
    Meshed result;
    const auto point = [&](int node) {
        return mesh->Node(node).Transformed(location.Transformation());
    };
    for (int i = 1; i <= mesh->NbTriangles(); ++i) {
        int a, b, c;
        mesh->Triangle(i).Get(a, b, c);
        result.data.triangles.push_back({point(a), point(b), point(c)});
    }
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(face, TopAbs_EDGE, edges);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Degenerated(edge) || BRep_Tool::IsClosed(edge, face))
            continue;
        const auto polygon = BRep_Tool::PolygonOnTriangulation(edge, mesh, location);
        if (polygon.IsNull())
            return {};
        const auto &nodes = polygon->Nodes();
        for (int j = nodes.Lower() + 1; j <= nodes.Upper(); ++j)
            result.data.perimeter.push_back({point(nodes(j - 1)), point(nodes(j))});
    }
    if (witnessWidth > 0 && mesh->HasUVNodes() && !result.data.perimeter.empty()) {
        BRep_Builder builder;
        TopoDS_Compound boundary;
        builder.MakeCompound(boundary);
        for (int i = 1; i <= edges.Extent(); ++i) {
            const auto edge = TopoDS::Edge(edges(i));
            if (!BRep_Tool::Degenerated(edge) && !BRep_Tool::IsClosed(edge, face))
                builder.Add(boundary, edge);
        }
        const BRepAdaptor_Surface surface(face);
        for (int i = 1; i <= mesh->NbTriangles(); i += std::max(1, mesh->NbTriangles() / 16)) {
            int a, b, c;
            mesh->Triangle(i).Get(a, b, c);
            const gp_Pnt2d uv((mesh->UVNode(a).XY() + mesh->UVNode(b).XY() + mesh->UVNode(c).XY()) /
                              3);
            if (BRepClass_FaceClassifier(face, uv, 1e-7).State() != TopAbs_IN)
                continue;
            const auto sample = BRepBuilderAPI_MakeVertex(surface.Value(uv.X(), uv.Y())).Vertex();
            BRepExtrema_DistShapeShape distance(sample, boundary);
            if (distance.IsDone() && distance.Value() > witnessWidth / 2 + 1e-6) {
                result.wideWitness = true;
                break;
            }
        }
    }
    return result;
}
} // namespace
FaceWidth microscopicFaceWidth(const TopoDS_Face &face, double threshold) {
    try {
        if (faceSizeGate(face, 2 * threshold) == FaceSizeGate::safe)
            return FaceWidth::healthy;
        // Coarse triangles only propose sample locations. A point on the exact
        // trimmed surface and exact perimeter distance prove a wide interior;
        // coarse mesh error cannot accidentally clear a thin face.
        KernelTiming timing("face-width-detail");
        const auto coarse = triangulate(face, threshold * 4, 2 * threshold);
        timing.phase("coarse-witness");
        if (!coarse)
            return FaceWidth::uncertain;
        if (coarse->wideWitness)
            return FaceWidth::healthy;
        const auto fine = triangulate(face, threshold / 64);
        timing.phase("fine-mesh");
        if (!fine)
            return FaceWidth::uncertain;
        const auto broad = face_width::classify(fine->data, 2 * threshold);
        if (broad == face_width::Class::wide)
            return FaceWidth::healthy;
        if (broad == face_width::Class::uncertain)
            return FaceWidth::uncertain;
        timing.phase("broad-width");
        const auto small = face_width::classify(fine->data, threshold);
        timing.phase("thin-width");
        if (small == face_width::Class::thin)
            return FaceWidth::thin;
        if (small == face_width::Class::wide)
            return FaceWidth::candidate;
        return FaceWidth::uncertain;
    } catch (const Standard_Failure &) {
        return FaceWidth::uncertain;
    }
}
