#include "blends.h"
#include <BRepAdaptor_Surface.hxx>
#include "face-chains.h"
#include <TopExp.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
// A cylinder closed by equal-radius spherical caps is a capsule side, not a
// rolling-ball fillet between independent supports. Its ordinary offset grows
// the tangent caps with it through the existing spherical offset route.
bool capsuleSide(const BRepAdaptor_Surface& surface, const BlendFace& blend) {
    if (surface.GetType() != GeomAbs_Cylinder || blend.supports.size() != 2) return false;
    const auto cylinder = surface.Cylinder();
    for (const auto& face : blend.supports) {
        BRepAdaptor_Surface support(face);
        if (support.GetType() != GeomAbs_Sphere) return false;
        const auto sphere = support.Sphere();
        if (std::abs(sphere.Radius()-cylinder.Radius()) > 1e-7) return false;
        const gp_Vec delta(cylinder.Location(),sphere.Location());
        if (delta.Crossed(gp_Vec(cylinder.Axis().Direction())).Magnitude() > 1e-7) return false;
    }
    return true;
}
}

std::vector<BlendFace> recognizeBlends(const TopoDS_Shape& shape) {
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(shape, TopAbs_FACE, faces);
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    std::vector<BlendFace> result;
    for (int f = 1; f <= faces.Extent(); ++f) {
        const auto face = TopoDS::Face(faces(f));
        BRepAdaptor_Surface surface(face);
        double radius; bool direct;
        if (surface.GetType() == GeomAbs_Cylinder) { radius = surface.Cylinder().Radius(); direct = surface.Cylinder().Direct(); }
        else if (surface.GetType() == GeomAbs_Torus) { radius = surface.Torus().MinorRadius(); direct = surface.Torus().Direct(); }
        else if (surface.GetType() == GeomAbs_Sphere) { radius = surface.Sphere().Radius(); direct = surface.Sphere().Direct(); }
        else continue;
        BlendFace blend{face, radius, (face.Orientation() == TopAbs_REVERSED ? -1 : 1) * (direct ? 1 : -1), {}};
        for (int e = 1; e <= adjacency.Extent(); ++e) {
            const auto& neighbors = adjacency.FindFromIndex(e);
            bool incident = false;
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next())
                if (i.Value().IsSame(face)) incident = true;
            if (!incident) continue;
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next()) {
                if (i.Value().IsSame(face)) continue;
                const auto other = TopoDS::Face(i.Value());
                if (faceContinuity(TopoDS::Edge(adjacency.FindKey(e)), face, other) < GeomAbs_G1) continue;
                if (std::none_of(blend.supports.begin(), blend.supports.end(), [&](const TopoDS_Face& s) { return s.IsSame(other); }))
                    blend.supports.push_back(other);
            }
        }
        if (blend.supports.size() >= 2 && !capsuleSide(surface, blend)) result.push_back(blend);
    }
    return result;
}

std::vector<TopoDS_Face> blendGroup(const std::vector<BlendFace>& blends, const std::vector<TopoDS_Face>& seeds) {
    auto selected = seeds;
    for (size_t i = 0; i < selected.size(); ++i) {
        const auto blend = std::find_if(blends.begin(), blends.end(), [&](const BlendFace& b) { return b.face.IsSame(selected[i]); });
        if (blend == blends.end()) throw std::runtime_error("Select an existing constant-radius fillet face");
        for (const auto& neighbor : blend->supports) {
            const auto next = std::find_if(blends.begin(), blends.end(), [&](const BlendFace& b) {
                return b.face.IsSame(neighbor) && std::abs(b.radius - blend->radius) < 1e-6;
            });
            if (next != blends.end() && std::none_of(selected.begin(), selected.end(), [&](const TopoDS_Face& face) { return face.IsSame(neighbor); })) selected.push_back(neighbor);
        }
    }
    return selected;
}
