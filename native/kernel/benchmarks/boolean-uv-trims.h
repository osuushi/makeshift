#pragma once
#include <Bnd_Box2d.hxx>
#include <TopoDS_Face.hxx>
#include <array>
#include <vector>

namespace boolean_uv {
/** Boundary coverage plus UV classification; unsupported/uncertain cases stay occupied. */
class TrimRegion {
    TopoDS_Face face;
    std::vector<Bnd_Box2d> boundaries;
    bool usable = false;
public:
    explicit TrimRegion(const TopoDS_Face&);
    bool outside(const std::array<double,4>& uv) const;
};
void testTrimRegions();
}
