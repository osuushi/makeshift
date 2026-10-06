#include "normal-extrude.h"
#include "offset-geometry.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepOffsetAPI_MakeThickSolid.hxx>
#include <BRepLib.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <stdexcept>

TopoDS_Shape normalExtrude(const TopoDS_Face& face, double distance, const std::string& id,
                          std::vector<SourceEntity>& origins) {
    // Own all geometry modified by offset construction, including pcurves.
    BRepBuilderAPI_Copy copy(face, true, false);
    const auto source = TopoDS::Face(copy.Shape());
    checkOffsetFace(source, distance);
    BRepOffsetAPI_MakeThickSolid layer;
    layer.MakeThickSolidBySimple(source, distance);
    if (!layer.IsDone()) throw std::runtime_error("Cannot extrude that face along its normals");
    TopExp_Explorer solids(layer.Shape(), TopAbs_SOLID);
    if (!solids.More()) throw std::runtime_error("Normal extrusion produced no solid layer");
    auto solid = TopoDS::Solid(solids.Current());
    solids.Next();
    if (solids.More()) throw std::runtime_error("Normal extrusion produced disconnected layers");
    // Orient the complete closed layer; positive offsets may reverse the shell.
    if (!BRepLib::OrientClosedSolid(solid))
        throw std::runtime_error("Normal extrusion did not close its swept layer");
    offset_geometry::validSolid(solid, "Normal face extrusion");
    bool found = false;
    for (const auto& modified : layer.Generated(source)) {
        if (modified.ShapeType() != TopAbs_FACE) continue;
        for (TopExp_Explorer faces(solid, TopAbs_FACE); faces.More(); faces.Next())
            if (faces.Current().IsSame(modified)) {
                // The layer's inner skin faces into the layer. Validate support
                // distance independent of that orientation, then track the surface.
                auto parallel = TopoDS::Face(faces.Current());
                parallel.Orientation(source.Orientation());
                offset_geometry::checkParallel(source, parallel, distance, "Normal face extrusion");
                origins.push_back({id, faces.Current()});
                found = true;
            }
    }
    if (!found) throw std::runtime_error("Normal extrusion lost its offset surface");
    return solid;
}
