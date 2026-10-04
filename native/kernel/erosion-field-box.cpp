#include "erosion-field.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Surface.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <cmath>

namespace erosion {
std::optional<TopoDS_Shape> boxInterior(const TopoDS_Shape& source,const mesh_fit::Mesh& mesh) {
    using namespace mesh_fit;
    if(mesh.vertices.empty()) return {};
    int planes = 0;
    for (TopExp_Explorer f(source,TopAbs_FACE); f.More(); f.Next()) {
        if (BRepAdaptor_Surface(TopoDS::Face(f.Current())).GetType() != GeomAbs_Plane) return {};
        ++planes;
    }
    if (planes != 6) return {};

    struct Group { V normal; double area=0; };
    std::map<std::array<int,3>,Group> groups;
    std::vector<std::pair<V,double>> normals;
    double total=0;
    for(const auto& t:mesh.triangles) {
        auto n=(mesh.vertices[t[1]]-mesh.vertices[t[0]]).Crossed(mesh.vertices[t[2]]-mesh.vertices[t[0]]);
        const double area=length(n);n=unit(n);
        for(int axis=1;axis<=3;++axis) if(std::abs(n.Coord(axis))>1e-6) {
            if(n.Coord(axis)<0) n*=-1;
            break;
        }
        const std::array<int,3> key{int(std::round(n.X()*10000)),int(std::round(n.Y()*10000)),int(std::round(n.Z()*10000))};
        auto& group=groups[key];group.normal+=n*area;group.area+=area;
        normals.push_back({n,area});total+=area;
    }
    std::vector<Group> ordered;
    for(const auto& [key,g]:groups) ordered.push_back(g);
    std::sort(ordered.begin(),ordered.end(),[](const auto& a,const auto& b){return a.area>b.area;});
    const auto x=unit(ordered.front().normal);
    std::optional<V> y;
    for(const auto& group:ordered) if(std::abs(x.Dot(unit(group.normal)))<1e-5) {
        y=unit(group.normal-x*x.Dot(group.normal));break;
    }
    if(!y) return {};
    const std::array<V,3> axes{x,*y,unit(x.Crossed(*y))};
    double planar=0;
    for(const auto& [n,area]:normals)
        if(std::max({std::abs(n.Dot(axes[0])),std::abs(n.Dot(axes[1])),std::abs(n.Dot(axes[2]))})>0.99999) planar+=area;
    if(planar<0.85*total) return {};
    std::array<double,3> low{1e100,1e100,1e100},high{-1e100,-1e100,-1e100};
    for(const auto& p:mesh.vertices) for(int i=0;i<3;++i) {
        low[i]=std::min(low[i],p.Dot(axes[i]));high[i]=std::max(high[i],p.Dot(axes[i]));
    }
    const auto corner=axes[0]*low[0]+axes[1]*low[1]+axes[2]*low[2];
    try {
        const auto candidate=BRepPrimAPI_MakeBox(gp_Ax2(gp_Pnt(corner),gp_Dir(axes[2]),gp_Dir(axes[0])),
                                                high[0]-low[0],high[1]-low[1],high[2]-low[2]).Shape();
        // The box comes from the contour's dominant planes, not a CAD offset.
        // Restrict this shortcut to six-plane sources; holes use section fitting.
        offset_geometry::validSolid(candidate,"Remesh erosion box");
        return candidate;
    } catch(const Standard_Failure&) {return {};}
    catch(const std::runtime_error&) {return {};}
}
}
