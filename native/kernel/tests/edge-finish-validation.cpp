#include "edge-finish-validation.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
    try {
        if (argc != 2) throw std::runtime_error("Expected captured BRep path");
        const auto stock = BRepPrimAPI_MakeCylinder(40, 24).Shape();
        BRepFilletAPI_MakeFillet round(stock);
        for (TopExp_Explorer e(stock, TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            BRepAdaptor_Curve curve(edge);
            if (curve.GetType() == GeomAbs_Circle && std::abs(curve.Circle().Location().Z()-24) < 1e-7)
                round.Add(8.5, edge);
        }
        round.Build();
        if (!round.IsDone()) throw std::runtime_error("Could not construct reference envelope");
        TopoDS_Shape bad; BRep_Builder builder;
        BRepTools::Read(bad, argv[1], builder);
        if (!BRepCheck_Analyzer(bad, true, false, true).IsValid())
            throw std::runtime_error("Capture must demonstrate the gap in ordinary validity");
        bool manifoldCaught = false;
        try { validateFinishManifold(bad); }
        catch (const std::runtime_error&) { manifoldCaught = true; }
        if (!manifoldCaught) throw std::runtime_error("Accepted a three-face edge");
        bool caught = false;
        try { validateFinishBoundary(bad, round.Shape(), {}); }
        catch (const std::runtime_error&) { caught = true; }
        if (!caught) throw std::runtime_error("Accepted material outside the intended round");
        const auto hole = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,-30,0), gp_Dir(0,0,1)),4,24).Shape();
        const auto good = BRepAlgoAPI_Cut(round.Shape(), hole).Shape();
        validateFinishManifold(good);
        validateFinishBoundary(good, round.Shape(), hole);
        std::cout << "Captured reversed lid rejected; valid intersecting bore accepted\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
