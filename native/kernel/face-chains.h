#pragma once
#include <TopoDS_Face.hxx>
#include <memory>
#include <vector>

// One unchanged body per serial request. Construct after topology preparation/meshing.
class FaceChainContext {
    struct Data;
    std::unique_ptr<Data> data;
public:
    explicit FaceChainContext(const TopoDS_Shape& body);
    ~FaceChainContext();
    FaceChainContext(const FaceChainContext&) = delete;
    FaceChainContext& operator=(const FaceChainContext&) = delete;
    std::vector<TopoDS_Face> chain(const std::vector<TopoDS_Face>& seeds);
};
