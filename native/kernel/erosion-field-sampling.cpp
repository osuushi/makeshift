#include "erosion-field-sampling.h"
#include "timing.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>

namespace erosion {
namespace {
mesh_fit::Mesh tessellate(const TopoDS_Shape& source,double deflection) {
    BRepMesh_IncrementalMesh mesher(source,deflection,false,0.15,false);
    if (!mesher.IsDone()) throw std::runtime_error("Erode could not sample source surfaces");
    mesh_fit::Mesh result;
    for (TopExp_Explorer faces(source,TopAbs_FACE); faces.More(); faces.Next()) {
        const auto face = TopoDS::Face(faces.Current());
        TopLoc_Location location;
        const auto triangles = BRep_Tool::Triangulation(face,location);
        if (triangles.IsNull()) throw std::runtime_error("Erode could not sample every source face");
        const int base = int(result.vertices.size());
        for (int i = 1; i <= triangles->NbNodes(); ++i)
            result.vertices.push_back(triangles->Node(i).Transformed(location.Transformation()).XYZ());
        for (int i = 1; i <= triangles->NbTriangles(); ++i) {
            int a,b,c; triangles->Triangle(i).Get(a,b,c);
            if (face.Orientation() == TopAbs_REVERSED) std::swap(b,c);
            result.triangles.push_back({base+a-1,base+b-1,base+c-1});
        }
        if (result.triangles.size() > 200000) throw std::runtime_error("Erode source mesh exceeds sampling budget");
    }
    return result;
}
}
struct InteriorField::Impl {
    TopoDS_Shape source;
    mesh_fit::Mesh mesh;
    mesh_fit::Search search;
    BRepClass3d_SolidClassifier classifier;
    explicit Impl(const TopoDS_Shape& shape, double deflection) :
        source(BRepBuilderAPI_Copy(shape,true,false).Shape()),
        mesh(tessellate(source,deflection)), search(mesh), classifier(source) {}
};
InteriorField::InteriorField(const TopoDS_Shape& source,double deflection) :
    impl(std::make_unique<Impl>(source,deflection)) {}
InteriorField::~InteriorField() = default;
double InteriorField::value(const mesh_fit::V& point,double depth) const {
    const auto hit = impl->search.closest(point);
    const double distance = std::sqrt(hit.distance2);
    // A strict interior projection onto the globally nearest oriented triangle
    // determines the sign. Edge/vertex hits use ray parity and then CAD fallback.
    if (*std::min_element(hit.weights.begin(),hit.weights.end()) > 1e-8) {
        const auto& t = impl->mesh.triangles[hit.triangle];
        const auto normal = (impl->mesh.vertices[t[1]]-impl->mesh.vertices[t[0]])
            .Crossed(impl->mesh.vertices[t[2]]-impl->mesh.vertices[t[0]]);
        return ((point-hit.point).Dot(normal) > 0 ? -distance : distance)-depth;
    }
    const auto inside = impl->search.contains(point);
    if (inside) return (*inside ? distance : -distance)-depth;
    impl->classifier.Perform(gp_Pnt(point),1e-7);
    if (impl->classifier.State() == TopAbs_IN) return distance-depth;
    if (impl->classifier.State() == TopAbs_OUT || impl->classifier.State() == TopAbs_ON) return -distance-depth;
    throw std::runtime_error("Erode could not classify a distance-field point");
}
mesh_fit::Mesh InteriorField::contour(double depth,double spacing,bool refine) const {
    KernelTiming timing("erode-field");
    Bnd_Box bounds; BRepBndLib::AddOptimal(impl->source,bounds,false,false);
    double x,y,z,X,Y,Z; bounds.Get(x,y,z,X,Y,Z);
    const mesh_fit::V margin(spacing*0.371,spacing*0.371,spacing*0.371);
    auto result = contourField(mesh_fit::V(x,y,z)-margin,mesh_fit::V(X,Y,Z)+margin,spacing,
        [&](const mesh_fit::V& point) { return value(point,depth); },refine,true);
    timing.phase("contour");
    return result;
}
void InteriorField::sourceNormals(mesh_fit::Mesh& mesh) const {
    mesh.normals.clear();
    for (const auto& point : mesh.vertices) mesh.normals.push_back(impl->search.closest(point).normal);
}
void InteriorField::measure(FastResult& result,const mesh_fit::Mesh& target) const {
    if (target.vertices.empty() || result.faces == 0) return;
    const auto mesh = tessellate(result.shape,std::max(1e-5,result.spacing/4));
    mesh_fit::Search targetSearch(target), fittedSearch(mesh);
    result.sampledMin = std::numeric_limits<double>::infinity();
    result.sampledMax = -result.sampledMin;
    auto sample = [&](const mesh_fit::V& point) {
        const double distance = value(point,0);
        result.sampledMin = std::min(result.sampledMin,distance);
        result.sampledMax = std::max(result.sampledMax,distance);
        result.sampledDeviation = std::max(result.sampledDeviation,std::sqrt(targetSearch.closest(point).distance2));
        ++result.samples;
    };
    const size_t stride = std::max(size_t(1),mesh.vertices.size()/10000);
    for (size_t i = 0; i < mesh.vertices.size(); i += stride) sample(mesh.vertices[i]);
    for (size_t i = 0; i < mesh.triangles.size(); i += std::max(size_t(1),mesh.triangles.size()/10000)) {
        const auto& t = mesh.triangles[i];
        sample((mesh.vertices[t[0]]+mesh.vertices[t[1]]+mesh.vertices[t[2]])/3);
    }
    for (size_t i = 0; i < target.vertices.size(); i += std::max(size_t(1),target.vertices.size()/10000))
        result.sampledDeviation = std::max(result.sampledDeviation,std::sqrt(fittedSearch.closest(target.vertices[i]).distance2));
}
}
