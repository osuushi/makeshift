#include "boolean-uv-filter.h"
#include <BOPDS_DS.hxx>
#include <BOPDS_Tools.hxx>
#include <BndLib_AddSurface.hxx>
#include <Geom_BezierSurface.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GeomAdaptor_Surface.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS.hxx>
#include <chrono>
#include <cmath>

namespace {
bool supported(const BRepAdaptor_Surface& surface) {
    const auto type = surface.GetType();
    return type == GeomAbs_Plane || type == GeomAbs_Cylinder || type == GeomAbs_Cone ||
           type == GeomAbs_Sphere || type == GeomAbs_Torus ||
           type == GeomAbs_BezierSurface || type == GeomAbs_BSplineSurface;
}
void bound(const BRepAdaptor_Surface& surface, const std::array<double,4>& uv,
           double padding, Bnd_Box& box) {
    if (surface.GetType() == GeomAbs_BSplineSurface) {
        // Segment a copied support to tighten its control hull, without making edges/faces.
        auto patch = surface.BSpline();
        patch->Segment(uv[0],uv[1],uv[2],uv[3]);
        BndLib_AddSurface::Add(GeomAdaptor_Surface(patch),padding,box);
    } else if (surface.GetType() == GeomAbs_BezierSurface) {
        auto patch = surface.Bezier();
        patch->Segment(uv[0],uv[1],uv[2],uv[3]);
        BndLib_AddSurface::Add(GeomAdaptor_Surface(patch),padding,box);
    } else {
        BndLib_AddSurface::Add(surface,uv[0],uv[1],uv[2],uv[3],padding,box);
    }
}
double diagonal(const Bnd_Box& box) {
    return box.SquareExtent();
}
}
boolean_uv::FilteringIterator::FilteringIterator(int depth, double tolerance)
    : depthLimit(depth), padding(tolerance) {}

boolean_uv::FilteringIterator::Face& boolean_uv::FilteringIterator::face(int index) {
    auto& value = faces[index];
    if (!value) {
        value = std::make_unique<Face>();
        value->surface.Initialize(TopoDS::Face(myDS->Shape(index)));
        value->root.box = myDS->ShapeInfo(index).Box();
        value->root.uv = {value->surface.FirstUParameter(),value->surface.LastUParameter(),
                         value->surface.FirstVParameter(),value->surface.LastVParameter()};
    }
    return *value;
}
bool boolean_uv::FilteringIterator::split(Face& face, Patch& patch) {
    if (patch.first) return true;
    if (statistics.boxes >= 8192 || !supported(face.surface)) return false;
    for (double value : patch.uv) if (!std::isfinite(value)) return false;
    // Alternate constant-U and constant-V bisections; children are cached across pairs.
    const int axis = patch.depth%2 == 0 ? 0 : 2;
    const double middle = (patch.uv[axis]+patch.uv[axis+1])/2;
    auto first = std::make_unique<Patch>(), second = std::make_unique<Patch>();
    first->uv = second->uv = patch.uv;
    first->uv[axis+1] = middle; second->uv[axis] = middle;
    first->depth = second->depth = patch.depth+1;
    try {
        bound(face.surface,first->uv,padding,first->box);
        bound(face.surface,second->uv,padding,second->box);
    } catch (const Standard_Failure&) {
        return false; // Uncertain bounds retain the original exact intersection route.
    }
    statistics.boxes += 2;
    patch.first = std::move(first); patch.second = std::move(second);
    return true;
}
bool boolean_uv::FilteringIterator::separated(Face& a, Patch& pa, Face& b, Patch& pb) {
    if (++statistics.tests > 100000) return false;
    if (pa.box.IsOut(pb.box)) return true;
    if (pa.depth >= depthLimit && pb.depth >= depthLimit) return false;
    const bool refineA = pb.depth >= depthLimit ||
                         (pa.depth < depthLimit && diagonal(pa.box) >= diagonal(pb.box));
    if (refineA) {
        if (!split(a,pa)) return false;
        return separated(a,*pa.first,b,pb) && separated(a,*pa.second,b,pb);
    }
    if (!split(b,pb)) return false;
    return separated(a,pa,b,*pb.first) && separated(a,pa,b,*pb.second);
}
void boolean_uv::FilteringIterator::Prepare(const Handle(IntTools_Context)& context,
                                           Standard_Boolean checkOBB, Standard_Real fuzzy) {
    BOPDS_Iterator::Prepare(context,checkOBB,fuzzy);
    const auto start = std::chrono::steady_clock::now();
    const int type = BOPDS_Tools::TypeToInteger(TopAbs_FACE,TopAbs_FACE);
    const auto original = myLists(type);
    myLists(type).Clear();
    statistics.originalPairs = original.Size();
    for (int i = 0; i < original.Size(); ++i) {
        int first, second; original(i).Indices(first,second);
        auto& a = face(first); auto& b = face(second);
        if (separated(a,a.root,b,b.root)) ++statistics.rejectedPairs;
        else myLists(type).Append(original(i));
    }
    statistics.milliseconds = std::chrono::duration<double,std::milli>(
        std::chrono::steady_clock::now()-start).count();
}
