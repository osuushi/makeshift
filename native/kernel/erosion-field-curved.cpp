#include "erosion-field-planar.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Surface.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Cylinder.hxx>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

namespace erosion {
namespace {
using namespace mesh_fit;
struct ArcFrame {
    V origin, axis, x, y;
    double first = 0, last = 0;
    bool periodic = false;
    ArcFrame(const Mesh& mesh,const gp_Cylinder& cylinder) :
        origin(cylinder.Location().XYZ()), axis(cylinder.Axis().Direction().XYZ()),
        x(cylinder.XAxis().Direction().XYZ()), y(axis.Crossed(x)) {
        std::vector<double> angles;
        for (const auto& p : mesh.vertices) {
            const auto v = p-origin;
            angles.push_back(std::atan2(v.Dot(y),v.Dot(x)));
        }
        std::sort(angles.begin(),angles.end());
        double gap = 0;
        for (size_t i = 0; i < angles.size(); ++i) {
            const double next = i+1 < angles.size() ? angles[i+1] : angles[0]+2*M_PI;
            if (next-angles[i] > gap) { gap = next-angles[i]; first = next; last = angles[i]+2*M_PI; }
        }
        periodic = gap < 0.1;
        if (periodic) { first = 0; last = 2*M_PI; }
        if (last-first < 0.1) throw std::runtime_error("No curved section range");
    }
    V radial(double angle) const { return x*std::cos(angle)+y*std::sin(angle); }
};
TopoDS_Shape around(const Mesh& mesh,const gp_Cylinder& cylinder,double spacing,int maxFaces,int euler) {
    const ArcFrame frame(mesh,cylinder);
    if ((frame.periodic ? 0 : 2) != euler) throw std::runtime_error("Curved section layout changes mesh topology");
    std::vector<sections::Loops> rows;
    std::array<V,2> caps;
    const double trim = frame.periodic ? 0 : std::min(0.02,spacing/(8*cylinder.Radius()*(frame.last-frame.first)));
    for (int i = 0; i < 48; ++i) {
        const double angle = frame.first+(frame.last-frame.first)*(trim+(1-2*trim)*i/(frame.periodic ? 48 : 47));
        const auto radial = frame.radial(angle), normal = frame.axis.Crossed(radial);
        auto loops = sections::meshContours(mesh,normal,frame.origin.Dot(normal));
        std::erase_if(loops,[&](const auto& loop) {
            V center; for (const auto& p : loop) center += p/double(loop.size());
            return (center-frame.origin).Dot(radial) <= 0;
        });
        if (loops.size() != 1) throw std::runtime_error("Curved erosion sections split or disappear");
        loops[0] = sections::controls(loops[0],rows.empty() ? sections::Loop{} : rows.back()[0],128);
        rows.push_back(std::move(loops));
        if (i == 0) caps[0] = normal;
        if (i == 47) caps[1] = normal;
    }
    return sections::solid(rows,caps,spacing,maxFaces,frame.periodic);
}
}
std::optional<TopoDS_Shape> curvedInterior(const TopoDS_Shape& source,const Mesh& mesh,double spacing,int maxFaces,int euler) {
    std::vector<gp_Cylinder> guides;
    for (TopExp_Explorer f(source,TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Cylinder) continue;
        const auto cylinder = surface.Cylinder();
        if ((face.Orientation() == TopAbs_REVERSED ? -1 : 1)*(cylinder.Direct() ? 1 : -1) > 0) continue;
        if (std::any_of(guides.begin(),guides.end(),[&](const auto& prior) {
            return cylinder.Axis().IsCoaxial(prior.Axis(),1e-7,1e-7);
        })) continue;
        guides.push_back(cylinder);
    }
    for (const auto& guide : guides) {
        try {
            const auto result = around(mesh,guide,spacing,maxFaces,euler);
            offset_geometry::validSolid(result,"Curved erosion reconstruction");
            return result;
        } catch (const Standard_Failure& e) {
            if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "curved CAD: " << e.GetMessageString() << "\n";
        } catch (const std::runtime_error& e) {
            if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "curved section: " << e.what() << "\n";
        }
    }
    return {};
}
}
