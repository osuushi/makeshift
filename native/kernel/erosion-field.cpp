#include "erosion-field.h"
#include "erosion-field-planar.h"
#include "mesh-fit-analytic.h"
#include "offset-geometry.h"
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS_Compound.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace erosion {
namespace {
int faceCount(const TopoDS_Shape& shape) {
    int count = 0;
    for (TopExp_Explorer face(shape,TopAbs_FACE); face.More(); face.Next()) ++count;
    return count;
}
TopoDS_Shape fitInterior(const TopoDS_Shape& source,const InteriorField& field,
                        const mesh_fit::Mesh& mesh,double thickness,double spacing,int maxFaces) {
    if (const auto box = boxInterior(source,mesh)) return *box;
    auto pieces = interiorComponents(mesh);
    TopoDS_Compound candidate; BRep_Builder builder; builder.MakeCompound(candidate);
    if (pieces.empty()) return candidate;
    const int budget = maxFaces/int(pieces.size());
    std::vector<mesh_fit::Input> inputs;
    for (auto& piece : pieces) {
        std::vector<std::vector<int>> faces;
        for (const auto& triangle : piece.triangles) faces.push_back({triangle[0],triangle[1],triangle[2]});
        const int characteristic = mesh_fit::topology(piece.vertices,faces,"Erosion mesh");
        if (pieces.size() == 1 && (characteristic == 0 || characteristic == 2)) {
            if (const auto curved = curvedInterior(source,mesh,spacing,maxFaces,characteristic)) return *curved;
        }
        if (characteristic != 2) {
            if (const auto section = contourInterior(source,field,mesh,thickness,spacing,maxFaces)) return *section;
            throw std::runtime_error("Remesh cannot preserve this mesh topology. Try finer mesh detail or Analytic.");
        }
        field.sourceNormals(piece);
        auto input = mesh_fit::automaticInput(std::move(piece),spacing/8,budget);
        // Analytic recovery is a proposal filter against the sampled target, not
        // a wall-thickness certificate or a reason to discard a valid fallback.
        input.tolerance = spacing/(2*input.scale);
        if (const auto analytic = mesh_fit::analytic::reconstruct(input)) {
            builder.Add(candidate,analytic->shape);
            continue;
        }
        const auto layout = mesh_fit::radialLayout(input.target,std::min(24,budget));
        if (!layout) {
            if (const auto section = contourInterior(source,field,mesh,thickness,spacing,maxFaces)) return *section;
            return sectionInterior(mesh,spacing,maxFaces);
        }
        input.layout = *layout;
        inputs.push_back(std::move(input));
    }
    for (auto& input : inputs) builder.Add(candidate,mesh_fit::fitSurface(std::move(input),false,true).shape);
    return candidate;
}
}
FastResult reconstructInterior(const TopoDS_Shape& source,double thickness,const FastSettings& settings) {
    Bnd_Box bounds; BRepBndLib::AddOptimal(source,bounds,false,false);
    double x,y,z,X,Y,Z; bounds.Get(x,y,z,X,Y,Z);
    FastResult result;
    const double longest = std::max({X-x,Y-y,Z-z}), shortest = std::min({X-x,Y-y,Z-z});
    GProp_GProps properties; BRepGProp::SurfaceProperties(source,properties);
    const double area = properties.Mass();
    if (!std::isfinite(area) || area <= 0) throw std::runtime_error("Could not estimate Remesh sampling detail");
    const double factor = std::array<double,3>{1.5,1.0,2.0/3.0}.at(settings.detail);
    const double desired = std::min({longest/48,shortest/18,thickness/2})*factor;
    // Bound expected surface work, rather than spending the budget filling the
    // entire volume. These are sampling heuristics, not feature/thickness bounds.
    const double surfaceCells = std::array<double,3>{6000,12000,24000}.at(settings.detail);
    result.spacing = std::max({desired,std::sqrt(area/surfaceCells),longest/256});
    InteriorField field(source,std::max(1e-5,result.spacing/32));
    const auto mesh = field.contour(thickness,result.spacing);
    result.triangles = int(mesh.triangles.size());
    result.shape = fitInterior(source,field,mesh,thickness,result.spacing,settings.maxFaces);
    for (TopExp_Explorer solid(result.shape,TopAbs_SOLID); solid.More(); solid.Next())
        offset_geometry::validSolid(solid.Current(),"Remesh erosion reconstruction");
    result.faces = faceCount(result.shape);
    if (result.faces > settings.maxFaces) throw std::runtime_error("Remesh reconstruction exceeds the CAD face budget");
    field.measure(result,mesh);
    return result;
}
}
