#include "erosion-field-planar.h"
#include <algorithm>
#include <map>
#include <stdexcept>

namespace erosion::sections {
using namespace mesh_fit;
Loops meshContours(const Mesh& mesh, const V& axis, double height) {
    std::map<Edge,int> indices;
    std::vector<V> points;
    std::vector<std::vector<int>> neighbors;
    for (const auto& triangle : mesh.triangles) {
        std::vector<int> ends;
        for (int i = 0; i < 3; ++i) {
            const int a = triangle[i], b = triangle[(i+1)%3];
            const double first = mesh.vertices[a].Dot(axis)-height;
            const double last = mesh.vertices[b].Dot(axis)-height;
            if ((first > 0) == (last > 0)) continue;
            const auto key = edge(a,b);
            if (!indices.contains(key)) {
                indices[key] = int(points.size());
                neighbors.emplace_back();
                points.push_back(mesh.vertices[a]+(mesh.vertices[b]-mesh.vertices[a])*(first/(first-last)));
            }
            ends.push_back(indices.at(key));
        }
        if (ends.empty()) continue;
        if (ends.size() != 2) throw std::runtime_error("Ambiguous erosion cross-section");
        neighbors[ends[0]].push_back(ends[1]);
        neighbors[ends[1]].push_back(ends[0]);
    }
    if (points.size() < 3) throw std::runtime_error("Empty erosion cross-section");
    Loops result;
    std::vector<bool> visited(points.size());
    for (size_t start = 0; start < points.size(); ++start) {
        if (visited[start]) continue;
        Loop loop;
        int previous = -1, current = int(start);
        do {
            if (neighbors[current].size() != 2 || visited[current])
                throw std::runtime_error("Open erosion cross-section");
            visited[current] = true;
            loop.push_back(points[current]);
            const auto& adjacent = neighbors[current];
            const int next = adjacent[0] == previous ? adjacent[1] : adjacent[0];
            previous = current; current = next;
        } while (current != int(start));
        V normal;
        for (size_t i = 0; i < loop.size(); ++i)
            normal += (loop[i]-loop[0]).Crossed(loop[(i+1)%loop.size()]-loop[0]);
        if (normal.Dot(axis) < 0) std::reverse(loop.begin(),loop.end());
        result.push_back(std::move(loop));
    }
    return result;
}
}
