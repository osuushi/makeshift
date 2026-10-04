#include "mesh-fit.h"
#include <cmath>

namespace mesh_fit {
namespace {
bool rayBox(const V& p,const V& direction,const V& low,const V& high) {
    double first = 0, last = std::numeric_limits<double>::infinity();
    for (int axis = 1; axis <= 3; ++axis) {
        const double a = (low.Coord(axis)-p.Coord(axis))/direction.Coord(axis);
        const double b = (high.Coord(axis)-p.Coord(axis))/direction.Coord(axis);
        first = std::max(first,std::min(a,b)); last = std::min(last,std::max(a,b));
    }
    return first <= last;
}
}
void Search::crossings(int id,const V& p,const V& direction,int& count,bool& ambiguous) const {
    const auto& node = nodes[id];
    if (ambiguous || !rayBox(p,direction,node.lo,node.hi)) return;
    if (node.left >= 0) {
        crossings(node.left,p,direction,count,ambiguous);
        crossings(node.right,p,direction,count,ambiguous);
        return;
    }
    for (int i = node.start; i < node.end; ++i) {
        const auto& f = mesh.triangles[order[i]];
        const auto& a = mesh.vertices[f[0]];
        const auto ab = mesh.vertices[f[1]]-a, ac = mesh.vertices[f[2]]-a;
        const auto perpendicular = direction.Crossed(ac);
        const double determinant = ab.Dot(perpendicular);
        if (std::abs(determinant) < 1e-14*length(ab.Crossed(ac))) continue;
        const auto ap = p-a;
        const double u = ap.Dot(perpendicular)/determinant;
        const auto q = ap.Crossed(ab);
        const double v = direction.Dot(q)/determinant, t = ac.Dot(q)/determinant;
        if (t <= 0 || u < -1e-10 || v < -1e-10 || u+v > 1+1e-10) continue;
        if (std::min({std::abs(u),std::abs(v),std::abs(1-u-v)}) < 1e-10) {
            ambiguous = true;
            return;
        }
        ++count;
    }
}
std::optional<bool> Search::contains(const V& point) const {
    int count = 0; bool ambiguous = false;
    crossings(0,point,{1,0.47213595499958,0.317837245195782},count,ambiguous);
    if (ambiguous) return {};
    return count%2 == 1;
}
}
