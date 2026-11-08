#include "calculation-failure.h"
#include "offset-geometry.h"
#include <BRepLib.hxx>
#include <BRepLib_CheckCurveOnSurface.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Geom_Curve.hxx>
#include <ShapeFix_ShapeTolerance.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>

namespace offset_geometry {
namespace {
void require(bool condition, const char* message) {
    if (!condition) throw InvalidGeometryFailure(std::string("Kernel produced invalid geometry: ") + message);
}
void checkBoundaries(const TopoDS_Shape& shape) {
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next())
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (BRep_Tool::Degenerated(edge)) continue;
            require(BRep_Tool::SameParameter(edge), "offset boundary parameters are inconsistent");
            BRepLib_CheckCurveOnSurface check(edge, TopoDS::Face(f.Current()));
            check.Perform();
            require(check.IsDone() && std::isfinite(check.MaxDistance()) && check.MaxDistance() <= boundaryDistanceMm,
                    "offset boundary does not lie on its incident surfaces");
        }
}
void tightenVertices(const TopoDS_Shape& shape) {
    TopTools_IndexedMapOfShape vertices, checked;
    TopExp::MapShapes(shape, TopAbs_VERTEX, vertices);
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current().Oriented(TopAbs_FORWARD));
        double first, last;
        const auto curve = BRep_Tool::Curve(edge, first, last);
        if (curve.IsNull()) continue;
        const auto a = TopExp::FirstVertex(edge), b = TopExp::LastVertex(edge);
        for (const auto& endpoint : {std::make_pair(a, first), std::make_pair(b, last)}) {
            if (endpoint.first.IsNull()) continue;
            require(BRep_Tool::Pnt(endpoint.first).Distance(curve->Value(endpoint.second)) <= boundaryDistanceMm,
                    "offset joined distinct boundary endpoints");
            checked.Add(endpoint.first);
        }
    }
    for (int i = 1; i <= vertices.Extent(); ++i) {
        const auto vertex = TopoDS::Vertex(vertices(i));
        if (BRep_Tool::Tolerance(vertex) <= 2e-6) continue;
        require(checked.Contains(vertex), "offset vertex precision cannot be established");
        ShapeFix_ShapeTolerance().SetTolerance(vertex, 2e-6, TopAbs_VERTEX);
    }
}
}
void rebuildBoundaries(const TopoDS_Shape& shape, const TopoDS_Shape& source) {
    TopTools_IndexedMapOfShape edges, retained;
    TopExp::MapShapes(shape, TopAbs_EDGE, edges);
    TopExp::MapShapes(source, TopAbs_EDGE, retained);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Tolerance(edge) <= 2e-6) continue;
        require(!retained.Contains(edge), "offset cannot rebuild a preserved boundary");
        // Intersection offsets can approximate a boundary too coarsely despite
        // accurate surface pcurves. Build its spatial curve from those pcurves;
        // all incident surfaces and endpoints must independently agree below.
        BRep_Builder().UpdateEdge(edge, Handle(Geom_Curve)(), 1e-7);
        require(BRepLib::BuildCurve3d(edge, 1e-7, GeomAbs_C1, 14, 1000),
                "offset could not reconstruct an accurate boundary");
    }
    BRepLib::SameParameter(shape, 1e-7, true);
    checkBoundaries(shape);
    tightenVertices(shape);
}
}
