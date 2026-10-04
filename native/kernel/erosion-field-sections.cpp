#include "erosion-field.h"
#include "erosion-field-planar.h"
#include "offset-geometry.h"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepLib.hxx>
#include <BRep_Builder.hxx>
#include <Geom_BSplineSurface.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Pln.hxx>
#include <math_Jacobi.hxx>
#include <stdexcept>
#include <cstdlib>
#include <iostream>

namespace erosion {
namespace {
using namespace mesh_fit;
std::vector<V> resample(const std::vector<V>& polygon, const std::vector<V>& prior) {
    constexpr int count = 32;
    std::vector<double> cumulative{0};
    for (size_t i = 0; i < polygon.size(); ++i)
        cumulative.push_back(cumulative.back()+length(polygon[(i+1)%polygon.size()]-polygon[i]));
    std::vector<V> result;
    size_t segment = 0;
    for (int i = 0; i < count; ++i) {
        const double distance = cumulative.back()*i/count;
        while (segment+1 < polygon.size() && cumulative[segment+1] < distance) ++segment;
        const double fraction = (distance-cumulative[segment])/(cumulative[segment+1]-cumulative[segment]);
        result.push_back(polygon[segment]+(polygon[(segment+1)%polygon.size()]-polygon[segment])*fraction);
    }
    if (!prior.empty()) {
        int best = 0;
        double cost = 1e100;
        for (int shift = 0; shift < count; ++shift) {
            double next = 0;
            for (int i = 0; i < count; ++i) next += (prior[i]-result[(i+shift)%count]).SquareModulus();
            if (next < cost) { cost = next; best = shift; }
        }
        std::rotate(result.begin(),result.begin()+best,result.end());
    }
    return result;
}
TopoDS_Shape sectionSolid(const std::vector<std::vector<V>>& rows, const V& axis) {
    const int around = int(rows.front().size()), along = int(rows.size());
    TColgp_Array2OfPnt poles(1,around,1,along);
    for (int i = 0; i < around; ++i) for (int j = 0; j < along; ++j)
        poles.SetValue(i+1,j+1,gp_Pnt(rows[j][i]));
    TColStd_Array1OfReal uk(1,around+1), vk(1,along-2);
    TColStd_Array1OfInteger um(1,around+1), vm(1,along-2);
    for (int i = 1; i <= around+1; ++i) {
        uk(i) = double(i-1)/around;
        um(i) = 1;
    }
    for (int i = 1; i <= along-2; ++i) {
        vk(i) = double(i-1)/(along-3);
        vm(i) = (i == 1 || i == along-2) ? 4 : 1;
    }
    Handle(Geom_BSplineSurface) surface = new Geom_BSplineSurface(poles,uk,vk,um,vm,3,3,true,false);
    BRepBuilderAPI_Sewing sewing(1e-7);
    sewing.Add(BRepBuilderAPI_MakeFace(surface,1e-7).Face());
    for (int end : {0,1}) {
        const auto wire = BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(surface->VIso(end)).Edge()).Wire();
        const gp_Pln plane{gp_Pnt(rows[end ? along-1 : 0][0]),gp_Dir(axis)};
        sewing.Add(BRepBuilderAPI_MakeFace(plane,wire,true).Face());
    }
    sewing.Perform();
    if (sewing.NbFreeEdges() || sewing.NbMultipleEdges() || sewing.SewedShape().ShapeType() != TopAbs_SHELL)
        throw std::runtime_error("Erosion sections do not form a closed surface");
    auto solid = BRepBuilderAPI_MakeSolid(TopoDS::Shell(sewing.SewedShape())).Solid();
    if (!BRepLib::OrientClosedSolid(solid)) throw std::runtime_error("Cannot orient erosion section surface");
    return solid;
}
TopoDS_Shape along(const Mesh& mesh, const V& axis, double spacing) {
    double low = 1e100, high = -1e100;
    for (const auto& point : mesh.vertices) {
        low = std::min(low,point.Dot(axis));
        high = std::max(high,point.Dot(axis));
    }
    const double trim = std::min(0.02,spacing/(8*(high-low)));
    std::vector<std::vector<V>> rows;
    for (int i = 0; i < 16; ++i) {
        const double fraction = trim+(1-2*trim)*i/15;
        const auto loops = sections::meshContours(mesh,axis,low+(high-low)*fraction);
        if (loops.size() != 1) throw std::runtime_error("Erosion cross-section has multiple loops");
        const auto& loop = loops.front();
        rows.push_back(resample(loop,rows.empty() ? std::vector<V>{} : rows.back()));
    }
    // Nonnegative B-spline weights and ordered control-plane heights keep the
    // fitted surface monotone along this axis. Closed-solid checks still apply.
    return sectionSolid(rows,axis);
}
std::vector<TopoDS_Shape> sectionProposals(const Mesh& mesh, double spacing) {
    V center;
    for (const auto& point : mesh.vertices) center += point/double(mesh.vertices.size());
    math_Matrix covariance(1,3,1,3,0.0);
    for (const auto& point : mesh.vertices) for (int i = 1; i <= 3; ++i) for (int j = 1; j <= 3; ++j)
        covariance(i,j) += (point-center).Coord(i)*(point-center).Coord(j);
    math_Jacobi eigen(covariance);
    std::vector<TopoDS_Shape> result;
    if (!eigen.IsDone()) return result;
    std::vector<V> axes;
    for (int i = 1; i <= 3; ++i) {
        math_Vector value(1,3);
        eigen.Vector(i,value);
        axes.push_back(unit({value(1),value(2),value(3)}));
    }
    for (const auto& axis : std::array<V,3>{{{1,0,0},{0,1,0},{0,0,1}}}) {
        const bool seen = std::any_of(axes.begin(),axes.end(),[&](const auto& v) {
            return std::abs(axis.Dot(v)) > 1-1e-10;
        });
        if (!seen) axes.push_back(axis);
    }
    for (const auto& axis : axes) {
        try { result.push_back(along(mesh,axis,spacing)); }
        catch (const Standard_Failure& e) { if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "section CAD: " << e.GetMessageString() << "\n"; }
        catch (const std::runtime_error& e) { if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "section fit: " << e.what() << "\n"; }
    }
    return result;
}
}
TopoDS_Shape sectionInterior(const mesh_fit::Mesh& raw,double spacing,int maxFaces) {
    // Filter sub-grid tips only after direct fitting failed. The radius follows
    // mesh detail, not thickness or a wall allowance; report against raw below.
    const auto deep = offsetInteriorMesh(raw,-spacing/2,spacing);
    const auto mesh = offsetInteriorMesh(deep,spacing/2,spacing);

    TopoDS_Compound candidate;
    BRep_Builder builder;
    builder.MakeCompound(candidate);
    const auto pieces = interiorComponents(mesh);
    if (pieces.empty()) throw std::runtime_error("Mesh detail filtering removed the surviving interior. Try finer mesh detail or Analytic.");
    if (pieces.size()*3 > size_t(maxFaces)) throw std::runtime_error("CAD face budget cannot preserve all interior components");
    for (const auto& piece : pieces) {
        bool found = false;
        for (const auto& proposal : sectionProposals(piece,spacing)) {
            try {
                offset_geometry::validSolid(proposal,"Erosion reconstruction");
                builder.Add(candidate,proposal);
                found = true;
                break;
            } catch (const Standard_Failure& e) { if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "section CAD: " << e.GetMessageString() << "\n"; }
            catch (const std::runtime_error& e) { if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "section fit: " << e.what() << "\n"; }
        }
        if (!found) throw std::runtime_error("Remesh could not fit the eroded interior. Try finer mesh detail, a larger CAD face budget, or Analytic.");
    }
    return candidate;
}
}
