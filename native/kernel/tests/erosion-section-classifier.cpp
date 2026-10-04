#include "erosion-field-planar.h"
#include "erosion-section-classifier.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Builder.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopoDS_Compound.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax1.hxx>
#include <iostream>
#include <random>
#include <stdexcept>

namespace {
TopoDS_Shape tube() {
    std::vector<erosion::sections::Loops> rows;
    for (int z = 0; z < 8; ++z) {
        erosion::sections::Loops rings;
        for (double radius : {6.0,2.0}) {
            erosion::sections::Loop ring;
            for (int i = 0; i < 16; ++i) {
                const double angle = 2*M_PI*i/16;
                ring.push_back({radius*std::cos(angle),radius*std::sin(angle),10.0*z/7});
            }
            rings.push_back(std::move(ring));
        }
        rows.push_back(std::move(rings));
    }
    return erosion::sections::solid(rows,{{{0,0,1},{0,0,1}}},0.5);
}
void periodicRing() {
    std::vector<erosion::sections::Loops> rows;
    for (int v = 0; v < 48; ++v) {
        const double angle = 2*M_PI*v/48;
        erosion::sections::Loop ring;
        for (int u = 0; u < 32; ++u) {
            const double theta = 2*M_PI*u/32, radius = 6+2*std::cos(theta);
            ring.push_back({radius*std::cos(angle),radius*std::sin(angle),2*std::sin(theta)});
        }
        rows.push_back({std::move(ring)});
    }
    const auto shape = erosion::sections::solid(rows,{},0.25,128,true);
    if (!BRepCheck_Analyzer(shape,true,false,true).IsValid()) throw std::runtime_error("Invalid periodic section solid");
    GProp_GProps properties; BRepGProp::VolumeProperties(shape,properties);
    if (std::abs(properties.Mass()/(2*M_PI*M_PI*6*4)-1) > 0.02)
        throw std::runtime_error("Periodic volume differs from independent torus volume");
    BRepClass3d_SolidClassifier exact(shape);
    for (const auto& [point,inside] : std::array<std::pair<gp_Pnt,bool>,4>{{
        {{0,0,0},false}, {{6,0,0},true}, {{0,-6,0},true}, {{6,0,3},false}}}) {
        exact.Perform(point,1e-7);
        if ((exact.State() == TopAbs_IN) != inside) throw std::runtime_error("Periodic solid did not preserve its hole");
    }
}
void verify(const TopoDS_Shape& original,const gp_Trsf& transform) {
    const auto shape = BRepBuilderAPI_Transform(original,transform,true).Shape();
    if (!BRepCheck_Analyzer(shape,true,false,true).IsValid()) throw std::runtime_error("Invalid section test solid");
    erosion::SectionClassifier section(shape);
    if (!section.supported()) throw std::runtime_error("Polynomial tube was not recognized");
    BRepClass3d_SolidClassifier exact(shape);
    TopoDS_Compound boundary; BRep_Builder builder; builder.MakeCompound(boundary);
    for (TopExp_Explorer face(shape,TopAbs_FACE); face.More(); face.Next()) builder.Add(boundary,face.Current());
    BRepExtrema_DistShapeShape distance; distance.LoadS2(boundary);
    int classified = 0;

    const auto compare = [&](const gp_Pnt& point) {
        distance.LoadS1(BRepBuilderAPI_MakeVertex(point).Vertex()); distance.Perform();
        if (!distance.IsDone()) throw std::runtime_error("Could not measure classifier probe");
        const auto interior = section.contains(point,0);
        if (interior && !*interior) throw std::runtime_error("Loose distance bound certified an exterior point");
        const auto answer = section.contains(point,distance.Value());
        if (distance.Value() <= 4e-6 && answer && !*answer) throw std::runtime_error("Exterior boundary tolerance bypassed OCCT");

        if (!answer) return;
        ++classified;
        exact.Perform(point,1e-7);
        if (*answer != (exact.State() == TopAbs_IN || exact.State() == TopAbs_ON)) {
            std::cerr << "Mismatch at " << point.X() << " " << point.Y() << " " << point.Z()
                      << "; section=" << *answer << "; OCCT=" << exact.State() << '\n';
            throw std::runtime_error("Section classification disagrees with OCCT");
        }

    };
    for (const auto& [point,inside] : std::array<std::pair<gp_Pnt,bool>,4>{{
        {{0,0,5},false}, {{4,0.3,5},true}, {{7,0,5},false}, {{4,0,11},false}}}) {
        const auto transformed = point.Transformed(transform);
        exact.Perform(transformed,1e-7);
        if ((exact.State() == TopAbs_IN) != inside) throw std::runtime_error("Tube did not preserve its hole");
        compare(transformed);
    }
    std::mt19937 random(2718);
    for (int i = 0; i < 1200; ++i) {
        const gp_Pnt point(-7+14.0*random()/random.max(),-7+14.0*random()/random.max(),-1+12.0*random()/random.max());
        compare(point.Transformed(transform));
    }
    if (classified < 1000) throw std::runtime_error("Section classification fell back for ordinary points");
    for (TopExp_Explorer f(shape,TopAbs_FACE); f.More(); f.Next()) {
        BRepAdaptor_Surface surface(TopoDS::Face(f.Current()));
        for (double fraction : {1e-8,0.31,0.5,1-1e-8}) {
            gp_Pnt point; gp_Vec du,dv;
            surface.D1(surface.FirstUParameter()+(surface.LastUParameter()-surface.FirstUParameter())*fraction,
                       surface.FirstVParameter()+(surface.LastVParameter()-surface.FirstVParameter())*0.43,point,du,dv);
            const auto normal = du.Crossed(dv).Normalized();
            for (double distance : {-1e-5,-1e-8,1e-8,1e-5}) compare(point.Translated(normal*distance));
        }
    }
}
}
int main() {
    try {
        periodicRing();
        const auto shape = tube();
        verify(shape,gp_Trsf{});
        gp_Trsf transform;
        transform.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,2,3)),0.71);
        transform.SetTranslationPart(gp_Vec(12000,-9000,5000));
        verify(shape,transform);
        const auto box = BRepPrimAPI_MakeBox(4,5,6).Shape();
        erosion::SectionClassifier unsupported(box);
        if (unsupported.supported() || unsupported.contains(gp_Pnt(1,1,1),1))
            throw std::runtime_error("Unsupported geometry bypassed OCCT classification");
        std::cout << "Polynomial sections, holes, transforms and ambiguous crossings passed\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
