#include "edit-intersections.h"
#include <BOPAlgo_ArgumentAnalyzer.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <TopExp_Explorer.hxx>
#include <gp.hxx>
#include <stdexcept>

namespace {
TopoDS_Shape turnedBody(double startRadius, bool localCrossing, bool remoteCrossing) {
    BRepBuilderAPI_MakePolygon profile;
    auto point = [&](double r, double z) { profile.Add(gp_Pnt(r, 0, z)); };
    point(0, 0);
    point(startRadius, 0);
    if (localCrossing) {
        point(startRadius, 2); point(6, 2); point(6, 0.5); point(3, 0.5);
    }
    for (int z = 3; z <= 30; ++z) point(4 + (z % 2) * 0.2, z);
    if (remoteCrossing) {
        point(6, 30); point(6, 28.5); point(3, 28.5); point(3, 31);
    }
    point(0, remoteCrossing ? 31 : 30);
    profile.Close();
    const auto face = BRepBuilderAPI_MakeFace(profile.Wire()).Face();
    const auto turned = BRepPrimAPI_MakeRevol(face, gp::OZ()).Shape();
    return TopExp_Explorer(turned, TopAbs_SOLID).Current();
}
void wholeCheck(const TopoDS_Shape& candidate) {
    BOPAlgo_ArgumentAnalyzer checker;
    checker.SetShape1(candidate);
    checker.SelfInterMode() = true;
    checker.Perform();
    if (checker.HasErrors() || checker.HasFaulty()) throw std::runtime_error("interference");
}
}
int main() {
    Bnd_Box end;
    end.Update(-7,-7,-1,7,7,3);
    int full = 0;
    auto verify = [&](const TopoDS_Shape& shape) {
        validateEditIntersections(shape, end, IntersectionPolicy::finish, [&](const auto& entire) {
            ++full;
            wholeCheck(entire);
        });
    };
    const auto original = turnedBody(4.1,false,false);
    verify(original);
    verify(original);
    verify(turnedBody(4.2,false,false));
    if (full != 1) throw std::runtime_error("A local edit did not reuse the verified remote shell");
    for (bool remote : {false,true}) {
        const auto crossing = turnedBody(4.2,!remote,remote);
        bool rejected = false;
        try { verify(crossing); } catch (const std::runtime_error&) { rejected = true; }
        if (!rejected) throw std::runtime_error("Accepted a self-intersection after a local edit");
    }
    verify(original);
}
