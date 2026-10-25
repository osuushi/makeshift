#pragma once
#include <TopoDS_Face.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <ostream>
#include <memory>
#include <optional>
#include <gp_Pnt.hxx>

class OffsetThicknessRay;
class BRepAdaptor_Surface;

// One immutable body and lazily loaded exact ray tool per serial presentation.
// Construct after meshing; caches never outlive this body's presentation.
class OffsetThicknessContext {
    struct SampleCache;
    TopoDS_Shape body;
    std::unique_ptr<OffsetThicknessRay> tool;
    std::unique_ptr<SampleCache> samples;
public:
    explicit OffsetThicknessContext(const TopoDS_Shape& shape);
    ~OffsetThicknessContext();
    OffsetThicknessContext(const OffsetThicknessContext&) = delete;
    OffsetThicknessContext& operator=(const OffsetThicknessContext&) = delete;
    bool reaches(const gp_Pnt&, const gp_Dir&, double distance, const TopoDS_Face& target);
    // Exact IN eligibility and surface point on the unchanged 11-by-11 UV grid.
    std::optional<gp_Pnt> sample(const TopoDS_Face&, int u, int v);
    TopAbs_State classify(const TopoDS_Face&, const gp_Pnt&);
    bool mayOverlap(const TopoDS_Face&, const TopoDS_Face&, double delta);
    const BRepAdaptor_Surface& surface(const TopoDS_Face&);
};

void presentOffsetThickness(std::ostream&, const TopoDS_Face&,
                            const TopTools_IndexedMapOfShape&, const TopoDS_Shape&);
void presentOffsetThickness(std::ostream&, const TopoDS_Face&,
                            const TopTools_IndexedMapOfShape&, OffsetThicknessContext&);
