#include "erosion-field.h"
#include <numeric>
#include <stdexcept>

namespace erosion {
std::vector<mesh_fit::Mesh> interiorComponents(const mesh_fit::Mesh& mesh) {
    std::vector<int> parents(mesh.vertices.size());
    std::iota(parents.begin(), parents.end(), 0);
    auto root = [&](int vertex) {
        while (parents[vertex] != vertex) {
            parents[vertex] = parents[parents[vertex]];
            vertex = parents[vertex];
        }
        return vertex;
    };
    for (const auto& triangle : mesh.triangles)
        for (int i = 1; i < 3; ++i) parents[root(triangle[i])] = root(triangle[0]);
    std::map<int, size_t> components;
    std::vector<mesh_fit::Mesh> result;
    std::vector<int> indices(mesh.vertices.size(), -1);
    for (auto triangle : mesh.triangles) {
        const int component = root(triangle[0]);
        if (!components.contains(component)) {
            if (result.size() >= 16) throw std::runtime_error("Erode exceeds the 16-piece reconstruction budget");
            components[component] = result.size();
            result.emplace_back();
        }
        auto& piece = result[components.at(component)];
        for (int& vertex : triangle) {
            if (indices[vertex] < 0) {
                indices[vertex] = int(piece.vertices.size());
                piece.vertices.push_back(mesh.vertices[vertex]);
                if (!mesh.normals.empty()) piece.normals.push_back(mesh.normals[vertex]);
            }
            vertex = indices[vertex];
        }
        piece.triangles.push_back(triangle);
    }
    return result;
}
}
