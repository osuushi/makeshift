// Research harness; build with pinned SDK and native/kernel/face-chains.cpp.
// Link TKFillet TKPrim TKTopAlgo TKGeomAlgo TKBRep TKGeomBase TKG3d TKG2d TKMath TKernel.
#include "face-chains.h"
#include <BRepLib.hxx>
#include <BRep_Builder.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Ax1.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
// Explicit copy of pre-context tangentFaceChain, independent of cache helpers.
std::vector<TopoDS_Face> legacy(const TopoDS_Shape& shape, const std::vector<TopoDS_Face>& seeds) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    auto result = seeds;
    for (size_t f = 0; f < result.size(); ++f) {
        const auto face = result[f];
        for (int e = 1; e <= adjacency.Extent(); ++e) {
            const auto& neighbors = adjacency.FindFromIndex(e);
            bool incident = false;
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next())
                if (i.Value().IsSame(face)) incident = true;
            if (!incident) continue;
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next()) {
                const auto other = TopoDS::Face(i.Value());
                if (std::any_of(result.begin(), result.end(), [&](const TopoDS_Face& f) { return f.IsSame(other); })) continue;
                if (BRepLib::ContinuityOfFaces(TopoDS::Edge(adjacency.FindKey(e)), face, other, 1e-5) >= GeomAbs_G1)
                    result.push_back(other);
            }
        }
    }
    return result;
}
void require(bool pass, const std::string& reason) {
    if (!pass) throw std::runtime_error(reason);
}
size_t comparisons = 0;
void compare(const std::string& name, const TopoDS_Shape& body, FaceChainContext& context,
             const std::vector<TopoDS_Face>& seeds) {
    const auto expected = legacy(body, seeds), actual = context.chain(seeds);
    require(expected.size() == actual.size(), name + ": length differs");
    for (size_t i = 0; i < expected.size(); ++i)
        require(expected[i].IsEqual(actual[i]), name + ": exact face/order differs at " + std::to_string(i));
    ++comparisons;
}
std::vector<TopoDS_Face> faces(const TopoDS_Shape& body) {
    TopTools_IndexedMapOfShape map;
    TopExp::MapShapes(body, TopAbs_FACE, map);
    std::vector<TopoDS_Face> result;
    for (int i = 1; i <= map.Extent(); ++i) result.push_back(TopoDS::Face(map(i)));
    return result;
}
void fixture(const std::string& name, const TopoDS_Shape& body, const TopoDS_Face& unknown) {
    const auto all = faces(body);
    require(!all.empty(), name + ": no faces");
    FaceChainContext context(body);
    compare(name + "/empty", body, context, {});
    for (const auto& face : all) {
        compare(name + "/single", body, context, {face});
        compare(name + "/reversed-seed", body, context, {TopoDS::Face(face.Reversed())});
        compare(name + "/single-repeat", body, context, {face});
    }
    compare(name + "/duplicates", body, context, {all.front(), all.front(), TopoDS::Face(all.front().Reversed())});
    compare(name + "/multiple", body, context, {all.back(), all.front()});
    compare(name + "/all", body, context, all);
    compare(name + "/unknown", body, context, {unknown});
    compare(name + "/mixed-unknown", body, context, {unknown, all.back(), all.front(), unknown});
    const auto single = context.chain({unknown});
    require(single.size() == 1 && single.front().IsEqual(unknown), name + ": unknown seed changed");
    const auto duplicate = context.chain({all.front(), all.front()});
    require(duplicate.size() >= 2 && duplicate[0].IsEqual(all.front()) && duplicate[1].IsEqual(all.front()),
            name + ": duplicate seeds lost");
}
TopoDS_Shape filletedBox() {
    const auto box = BRepPrimAPI_MakeBox(20., 25., 30.).Shape();
    TopExp_Explorer edge(box, TopAbs_EDGE);
    BRepFilletAPI_MakeFillet fillet(box);
    fillet.Add(2., TopoDS::Edge(edge.Current()));
    fillet.Build();
    require(fillet.IsDone(), "fillet fixture failed");
    return fillet.Shape();
}
TopoDS_Shape nonmanifold() {
    const gp_Pnt a(0., 0., 0.), b(10., 0., 0.);
    const auto shared = BRepBuilderAPI_MakeEdge(a, b).Edge();
    BRep_Builder builder;
    TopoDS_Compound body;
    builder.MakeCompound(body);
    for (const gp_Pnt c : {gp_Pnt(5., 10., 0.), gp_Pnt(5., -10., 0.), gp_Pnt(5., 0., 10.)}) {
        BRepBuilderAPI_MakeWire wire(shared, BRepBuilderAPI_MakeEdge(b, c).Edge(),
                                    BRepBuilderAPI_MakeEdge(c, a).Edge());
        require(wire.IsDone(), "nonmanifold wire fixture failed");
        BRepBuilderAPI_MakeFace face(wire.Wire());
        require(face.IsDone(), "nonmanifold face fixture failed");
        builder.Add(body, face.Face());
    }
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(body, TopAbs_EDGE, TopAbs_FACE, adjacency);
    require(adjacency.Contains(shared) && adjacency.FindFromKey(shared).Extent() == 3,
            "fixture must retain one edge with three face ancestors");
    return body;
}
void checkTangency(const TopoDS_Shape& body) {
    bool connected = false;
    for (const auto& face : faces(body)) if (legacy(body, {face}).size() > 1) connected = true;
    require(connected, "fillet fixture has no connected tangent faces");
}
}
int main() {
    try {
        const auto unknown = faces(BRepPrimAPI_MakeBox(gp_Pnt(100., 100., 100.), 3., 4., 5.).Shape()).front();
        const auto cylinder = BRepPrimAPI_MakeCylinder(10., 20.).Shape();
        TopTools_IndexedDataMapOfShapeListOfShape adjacency;
        TopExp::MapShapesAndAncestors(cylinder, TopAbs_EDGE, TopAbs_FACE, adjacency);
        bool seam = false;
        for (int e = 1; e <= adjacency.Extent(); ++e) {
            TopTools_IndexedMapOfShape unique;
            const auto& list = adjacency.FindFromIndex(e);
            for (TopTools_ListIteratorOfListOfShape i(list); i.More(); i.Next()) unique.Add(i.Value());
            if (list.Extent() > unique.Extent()) seam = true;
        }
        require(seam, "cylinder fixture lacks duplicate seam ancestry");
        const auto blend = filletedBox();
        checkTangency(blend);
        fixture("cylinder-seam", cylinder, unknown);
        fixture("fillet", blend, unknown);
        fixture("reversed-fillet", blend.Reversed(), unknown);
        gp_Trsf transform;
        transform.SetRotation(gp_Ax1(gp_Pnt(0., 0., 0.), gp_Dir(1., 2., 3.)), 0.37);
        transform.SetTranslationPart(gp_Vec(17., -8., 4.));
        fixture("located-fillet", blend.Located(TopLoc_Location(transform)), unknown);
        BRep_Builder builder;
        TopoDS_Compound instances;
        builder.MakeCompound(instances);
        builder.Add(instances, blend);
        builder.Add(instances, blend.Located(TopLoc_Location(transform)));
        fixture("shared-tshape-locations", instances, unknown);
        fixture("nonmanifold-three-ancestors", nonmanifold(), unknown);
        std::cout << "face-chain parity: " << comparisons << " exact ordered comparisons passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
