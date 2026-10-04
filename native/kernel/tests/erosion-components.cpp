#include "erosion-field.h"
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace {
using namespace mesh_fit;
void require(bool value,const char* message) {
    if(!value) throw std::runtime_error(message);
}
void splitSpheres() {
    auto mesh=erosion::contourField({-4.1,-2.1,-2.1},{4.1,2.1,2.1},0.3,[](const V& p){
        return std::max(1.3-length(p-V(2,0,0)),1.3-length(p+V(2,0,0)));
    });
    for(const auto& p:mesh.vertices) mesh.normals.push_back(unit(p-V(p.X()>0?2:-2,0,0)));
    const auto pieces=erosion::interiorComponents(mesh);
    require(pieces.size()==2,"Separated sphere interiors produce two pieces");
    size_t vertices=0,triangles=0;
    for(const auto& piece:pieces) {
        vertices+=piece.vertices.size();triangles+=piece.triangles.size();
        require(piece.normals.size()==piece.vertices.size(),"Normal guidance follows component vertices");
        for(size_t i=0;i<piece.vertices.size();++i) {
            const auto p=piece.vertices[i],normal=unit(p-V(p.X()>0?2:-2,0,0));
            require(normal.Dot(piece.normals[i])>1-1e-12,"Remapped guidance belongs to the same position");
        }
        require(!piece.triangles.empty(),"Each piece keeps its triangles");
    }
    require(vertices==mesh.vertices.size()&&triangles==mesh.triangles.size(),"Splitting neither loses nor duplicates geometry");
}
}
int main() {
    try {
        splitSpheres();
        std::cout<<"PASS component preservation and normal correspondence\n";
    } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
