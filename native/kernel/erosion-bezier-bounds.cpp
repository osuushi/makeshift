#include "erosion-bezier-bounds.h"
#include "geometry-policy.h"
#include <Geom_BezierSurface.hxx>
#include <Geom_BSplineSurface.hxx>
#include <GeomConvert_BSplineSurfaceToBezierSurface.hxx>
#include <algorithm>
#include <cmath>
#include <limits>

namespace {
using Box = std::array<double,6>;
Box emptyBox() {
    const double inf = std::numeric_limits<double>::infinity();
    return {inf,inf,inf,-inf,-inf,-inf};
}
void include(Box& box, const Box& other) {
    for (int axis = 0; axis < 3; ++axis) {
        box[axis] = std::min(box[axis],other[axis]);
        box[axis+3] = std::max(box[axis+3],other[axis+3]);
    }
}
double squaredDistance(const Box& box, const gp_Pnt& point) {
    double result = 0;
    for (int axis = 0; axis < 3; ++axis) {
        const double delta = std::max({box[axis]-point.Coord(axis+1),point.Coord(axis+1)-box[axis+3],0.0});
        result += delta*delta;
    }
    return result;
}
bool overlaps(const Box& first, const Box& last) {
    for (int axis = 0; axis < 3; ++axis)
        if (first[axis+3] < last[axis] || first[axis] > last[axis+3]) return false;
    return true;
}
void add(std::vector<Box>& boxes, const Handle(Geom_BezierSurface)& original, int divisions) {
    for (int i = 0; i < divisions; ++i) for (int j = 0; j < divisions; ++j) {
        auto patch = Handle(Geom_BezierSurface)::DownCast(original->Copy());
        patch->Segment(double(i)/divisions,double(i+1)/divisions,double(j)/divisions,double(j+1)/divisions);
        auto box = emptyBox();
        for (int u = 1; u <= patch->NbUPoles(); ++u) for (int v = 1; v <= patch->NbVPoles(); ++v)
            for (int axis = 0; axis < 3; ++axis) {
                const double value = patch->Pole(u,v).Coord(axis+1);
                box[axis] = std::min(box[axis],value);
                box[axis+3] = std::max(box[axis+3],value);
            }
        for (int axis = 0; axis < 3; ++axis) {
            box[axis] -= geometry_policy::boundaryDistanceMm;
            box[axis+3] += geometry_policy::boundaryDistanceMm;
        }
        boxes.push_back(box);
    }
}
}
erosion::BezierBounds::BezierBounds(const BRepAdaptor_Surface& surface) {
    if (surface.GetType() == GeomAbs_BezierSurface) {
        const auto original = surface.Bezier();
        if (original->IsURational() || original->IsVRational()) return;
        add(boxes,original,8);
    } else if (surface.GetType() == GeomAbs_BSplineSurface) {
        const auto original = surface.BSpline();
        if (original->IsURational() || original->IsVRational() ||
            size_t(original->NbUKnots())*original->NbVKnots() > 16384) return;
        GeomConvert_BSplineSurfaceToBezierSurface patches(original);
        const int count = patches.NbUPatches()*patches.NbVPatches();
        const int divisions = std::min(std::max(4,int(std::ceil(std::sqrt(64.0/count)))),
                                       std::max(1,int(std::sqrt(65536.0/count))));

        for (int i = 1; i <= patches.NbUPatches(); ++i) for (int j = 1; j <= patches.NbVPatches(); ++j)
            add(boxes,patches.Patch(i,j),divisions);
    }
    if (!boxes.empty()) build(0,int(boxes.size()));
}
int erosion::BezierBounds::build(int begin, int end) {
    auto box = emptyBox();
    for (int i = begin; i < end; ++i) include(box,boxes[i]);
    const int index = int(nodes.size());
    nodes.push_back({box,begin,end});
    if (end-begin > 8) {
        int axis = 0;
        for (int i = 1; i < 3; ++i) if (box[i+3]-box[i] > box[axis+3]-box[axis]) axis = i;
        const int middle = (begin+end)/2;
        std::nth_element(boxes.begin()+begin,boxes.begin()+middle,boxes.begin()+end,[axis](const auto& a,const auto& b) {
            return a[axis]+a[axis+3] < b[axis]+b[axis+3];
        });
        const int left = build(begin,middle), right = build(middle,end);
        nodes[index].left = left;
        nodes[index].right = right;
    }
    return index;
}
void erosion::BezierBounds::lower(int index, const gp_Pnt& point, double& best) const {
    const auto& node = nodes[index];
    if (squaredDistance(node.box,point) >= best) return;
    if (node.left < 0) {
        for (int i = node.begin; i < node.end; ++i) best = std::min(best,squaredDistance(boxes[i],point));
    } else {
        const bool leftFirst = squaredDistance(nodes[node.left].box,point) < squaredDistance(nodes[node.right].box,point);
        lower(leftFirst ? node.left : node.right,point,best);
        lower(leftFirst ? node.right : node.left,point,best);
    }
}
double erosion::BezierBounds::lower(const gp_Pnt& point) const {
    if (nodes.empty()) return 0;
    double best = std::numeric_limits<double>::infinity();
    lower(0,point,best);
    return std::sqrt(best);
}
bool erosion::BezierBounds::crosses(int index, const Box& box) const {
    const auto& node = nodes[index];
    if (!overlaps(node.box,box)) return false;
    if (node.left >= 0) return crosses(node.left,box) || crosses(node.right,box);
    for (int i = node.begin; i < node.end; ++i) if (overlaps(boxes[i],box)) return true;
    return false;
}
bool erosion::BezierBounds::crosses(const std::array<gp_Pnt,8>& points) const {
    if (nodes.empty()) return true;
    return crosses(0,{points[0].X(),points[0].Y(),points[0].Z(),points[7].X(),points[7].Y(),points[7].Z()});
}
