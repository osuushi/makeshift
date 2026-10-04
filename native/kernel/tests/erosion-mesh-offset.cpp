#include "erosion-field.h"
#include <cmath>
#include <iostream>
#include <stdexcept>

int main() {
    try {
        using namespace mesh_fit;
        const auto sphere=erosion::contourField({-2.3,-2.3,-2.3},{2.3,2.3,2.3},.19,
            [](const V& p){return 2-length(p);},true);
        for(const auto& p:sphere.vertices)
            if(std::abs(length(p)-2)>.001) throw std::runtime_error("Refined roots missed the sphere surface");
        for(double distance:{-.3,.3}) {
            const auto offset=erosion::offsetInteriorMesh(sphere,distance,.14);
            const auto pieces=erosion::interiorComponents(offset);
            if(pieces.size()!=1) throw std::runtime_error("Sphere offset changed component count");
            double volume6=0;
            for(const auto& p:offset.vertices)
                if(std::abs(length(p)-(2+distance))>.06)
                    throw std::runtime_error("Signed mesh offset missed its independent radial bound");
            for(const auto& t:offset.triangles)
                volume6+=offset.vertices[t[0]].Dot(offset.vertices[t[1]].Crossed(offset.vertices[t[2]]));
            const double expected=4*std::acos(-1.0)*std::pow(2+distance,3)/3;
            if(std::abs(volume6/6/expected-1)>.06)
                throw std::runtime_error("Signed mesh offset has incorrect orientation or volume");
        }
        std::cout<<"PASS refined roots and inward/outward temporary mesh offsets\n";
    } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
