#pragma once
#include <TopoDS_Face.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <ostream>
#include <memory>
#include <optional>
#include <gp_Pnt.hxx>

class IntCurvesFace_ShapeIntersector;

// One immutable body and lazily loaded exact ray tool per serial presentation.
// Never reload: OCCT's Load appends face intersectors. Construct after meshing.
class OffsetThicknessContext {
    struct SampleCache;
    TopoDS_Shape body;
    std::unique_ptr<IntCurvesFace_ShapeIntersector> tool;
    std::unique_ptr<SampleCache> samples;
public:
    explicit OffsetThicknessContext(const TopoDS_Shape& shape);
    ~OffsetThicknessContext();
    OffsetThicknessContext(const OffsetThicknessContext&) = delete;
    OffsetThicknessContext& operator=(const OffsetThicknessContext&) = delete;
    IntCurvesFace_ShapeIntersector& ray();
    // Exact IN eligibility and surface point on the unchanged 11-by-11 UV grid.
    std::optional<gp_Pnt> sample(const TopoDS_Face&, int u, int v);
};

void presentOffsetThickness(std::ostream&, const TopoDS_Face&,
                            const TopTools_IndexedMapOfShape&, const TopoDS_Shape&);
void presentOffsetThickness(std::ostream&, const TopoDS_Face&,
                            const TopTools_IndexedMapOfShape&, OffsetThicknessContext&);
