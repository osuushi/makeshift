#pragma once
#include "erosion-field.h"
#include <memory>

namespace erosion {
// Temporary sampling data for one source; no accepted document state.
class InteriorField {
    struct Impl;
    std::unique_ptr<Impl> impl;
public:
    InteriorField(const TopoDS_Shape&, double deflection);
    ~InteriorField();
    double value(const mesh_fit::V&, double depth) const;
    void sourceNormals(mesh_fit::Mesh&) const;
    void measure(FastResult&,const mesh_fit::Mesh&) const;
    mesh_fit::Mesh contour(double depth, double spacing, bool refine = false) const;
};
}
