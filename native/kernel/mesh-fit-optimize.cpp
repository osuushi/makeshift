#include "mesh-fit-solve.h"
#include <cmath>

namespace mesh_fit {
namespace {
void position(std::vector<Row>& rows, const Patch& patch, double u, double v, const V& target, double weight) {
    const auto bu = basis(u), bv = basis(v);
    for (int axis = 0; axis < 3; ++axis) {
        Row row; row.value = target.Coord(axis+1)*weight;
        for (int i = 0; i < 4; ++i) for (int j = 0; j < 4; ++j)
            if (bu[i]*bv[j] != 0) row.terms.push_back({patch.controls[i*4+j]*3+axis,bu[i]*bv[j]*weight});
        rows.push_back(std::move(row));
    }
}
void conditionFrame(std::vector<Row>& rows, const Patch& patch, double u, double v,
                    const V& normal, const Evaluation& current, const Evaluation& seed) {
    const double product = length(current.du)*length(current.dv);
    const double seedSine = length(unit(seed.du).Crossed(unit(seed.dv)));
    const double minimumArea = product*seedSine*0.25;
    const double area = current.du.Crossed(current.dv).Dot(normal);
    if (area >= minimumArea || product < 1e-20) return;
    // Linearize signed tangent area. This activates only as a healthy seed frame
    // collapses; preserving lengths alone cannot keep its two directions independent.
    const auto gu = current.dv.Crossed(normal), gv = normal.Crossed(current.du);
    const auto bu = basis(u), bv = basis(v), du = derivative(u), dv = derivative(v);
    const double weight = 1/std::sqrt(product);
    Row row; row.value = (minimumArea+area)*weight;
    for (int i = 0; i < 4; ++i) for (int j = 0; j < 4; ++j)
        for (int axis = 0; axis < 3; ++axis) {
            const double coefficient = (du[i]*bv[j]*gu.Coord(axis+1)+bu[i]*dv[j]*gv.Coord(axis+1))*weight;
            if (coefficient != 0) row.terms.push_back({patch.controls[i*4+j]*3+axis,coefficient});
        }
    rows.push_back(std::move(row));
}
void tangentPlane(std::vector<Row>& rows, const Patch& patch, double u, double v, const V& normal,
                  const Evaluation& reference, bool guided) {
    const auto bu = basis(u), bv = basis(v), du = derivative(u), dv = derivative(v);
    // Preserve the two independent parameter directions while aligning the plane.
    // A weaker frame penalty lets noisy target normals collapse both into one line.
    const double frameWeight = 0.5;
    for (int direction = 0; direction < 2; ++direction) {
        Row row;
        std::array<Row,3> spacing;
        const auto prior = direction == 0 ? reference.du : reference.dv;
        const auto tangent = unit(prior-normal*prior.Dot(normal));
        // Match angular influence for long and short parameter directions.
        const double normalWeight = 10*std::sqrt(length(reference.du)*length(reference.dv))/std::max(1e-20,length(prior));
        // Guided distance contours use n·(t/|t|): shrinking a tangent must not
        // reduce its angular residual. Preserve the ordinary mesh fit otherwise.
        const auto normalGradient = guided ? normal-unit(prior)*normal.Dot(unit(prior)) : normal;
        row.value = guided ? -normal.Dot(prior)*normalWeight : 0;
        for (int axis = 0; axis < 3; ++axis) spacing[axis].value = tangent.Coord(axis+1)*length(prior)*frameWeight;
        for (int i = 0; i < 4; ++i) for (int j = 0; j < 4; ++j) {
            const double w = direction == 0 ? du[i]*bv[j] : bu[i]*dv[j];
            if (w == 0) continue;
            for (int axis = 0; axis < 3; ++axis) {
                row.terms.push_back({patch.controls[i*4+j]*3+axis,w*normalGradient.Coord(axis+1)*normalWeight});
                spacing[axis].terms.push_back({patch.controls[i*4+j]*3+axis,w*frameWeight});
            }
        }
        rows.push_back(std::move(row));
        for (auto& component : spacing) rows.push_back(std::move(component));
    }
}
void fair(std::vector<Row>& rows, const Patch& patch) {
    for (int direction = 0; direction < 2; ++direction) for (int i = 0; i < 4; ++i)
        for (int j = 0; j < 2; ++j) for (int axis = 0; axis < 3; ++axis) {
            Row row;
            for (int k = 0; k < 3; ++k) {
                const int index = direction == 0 ? i*4+j+k : (j+k)*4+i;
                row.terms.push_back({patch.controls[index]*3+axis,(k == 1 ? -2 : 1)*0.005});
            }
            rows.push_back(std::move(row));
        }
}
void reversePositions(std::vector<Row>& rows, const Network& n, const Mesh& mesh) {
    SurfaceSearch surface(n,8);
    const size_t stride = std::max(size_t(1),mesh.triangles.size()/2048);
    const double weight = std::sqrt(40.0*n.patches.size()*stride/mesh.triangles.size());
    for (size_t i = 0; i < mesh.triangles.size(); i += stride) {
        const auto& f = mesh.triangles[i];
        const auto p = (mesh.vertices[f[0]]+mesh.vertices[f[1]]+mesh.vertices[f[2]])/3;
        const auto hit = surface.closest(p);
        position(rows,n.patches[hit.patch],hit.u,hit.v,p,weight);
    }
}
bool regularStep(const Network& next, const std::vector<V>& reference) {
    size_t index = 0;
    for (size_t f = 0; f < next.patches.size(); ++f) for (int i = 0; i <= 12; ++i)
        for (int j = 0; j <= 12; ++j) {
            const auto e = evaluate(next,int(f),i/12.0,j/12.0);
            const auto normal = e.du.Crossed(e.dv), prior = reference[index++];
            if (normal.Dot(prior) <= prior.SquareModulus()*0.05) return false;
        }
    return true;
}
double update(Network& n, const std::vector<double>& solved, const std::vector<V>& reference) {
    const auto old = n.controls;
    for (double step = 1; step >= 1.0/1024; step *= 0.5) {
        double movement = 0;
        for (size_t i = 0; i < n.controls.size(); ++i) {
            const V target(solved[i*3],solved[i*3+1],solved[i*3+2]);
            n.controls[i] = old[i]+(target-old[i])*step;
            movement = std::max(movement,length(n.controls[i]-old[i]));
        }
        if (regularStep(n,reference)) return movement;
    }
    n.controls = old; return 0;
}
}
void fit(Network& n, const Network& seed, const Mesh& mesh, const Search& target, int iterations) {
    const auto seams = smoothSeams(n);
    std::vector<V> reference;
    for (size_t f = 0; f < n.patches.size(); ++f) for (int i = 0; i <= 12; ++i)
        for (int j = 0; j <= 12; ++j) {
            const auto e = evaluate(seed,int(f),i/12.0,j/12.0);
            reference.push_back(e.du.Crossed(e.dv));
        }
    for (int iteration = 0; iteration < iterations; ++iteration) {
        std::vector<Row> rows;
        const auto normals = seamNormals(n,seams,target);
        for (size_t f = 0; f < n.patches.size(); ++f) {
            const auto& p = n.patches[f];
            for (int i = 0; i <= 8; ++i) for (int j = 0; j <= 8; ++j) {
                const double u = i/8.0, v = j/8.0;
                const auto hit = target.closest(evaluate(n,int(f),u,v).point);
                position(rows,p,u,v,hit.point,1);
            }
            for (int side = 0; side < 4; ++side) {
                const auto e = edge(p.corners[side],p.corners[(side+1)%4]);
                if (n.layout.creases.contains(e)) continue;
                for (int k = 0; k <= 8; ++k) {
                    const double t = k/8.0;
                    const double u = side == 0 ? t : side == 1 ? 1 : side == 2 ? 1-t : 0;
                    const double v = side == 0 ? 0 : side == 1 ? t : side == 2 ? 1 : 1-t;
                    const auto normal = normals.at(e)[p.corners[side] == e.first ? k : 8-k];
                    // Regularize each step, not the final shape against its coarse seed.
                    const auto current = evaluate(n,int(f),u,v);
                    tangentPlane(rows,p,u,v,normal,current,!mesh.normals.empty());
                    conditionFrame(rows,p,u,v,normal,current,evaluate(seed,int(f),u,v));
                }
            }
            fair(rows,p);
        }
        reversePositions(rows,n,mesh);
        std::vector<double> initial;
        for (const auto& p : n.controls) for (int axis = 1; axis <= 3; ++axis) initial.push_back(p.Coord(axis));
        const auto solved = leastSquares(rows,initial);
        if (update(n,solved,reference) < 1e-8) break;
    }
}
}
