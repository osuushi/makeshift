// Original synthetic D1 fixtures using public OCCT constructors; no upstream copy.
// Compile under the shared compute lock:
// c++ -O3 -DNDEBUG -std=c++20 -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/spline-fixtures.cpp -L.cache/kernel/sdk/lib
// -Wl,--disable-new-dtags,-rpath,$PWD/.cache/kernel/sdk/lib -lTKTopAlgo -lTKBRep -lTKGeomBase
// -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/spline-fixtures
// Usage: spline-fixtures output.brep > descriptors.jsonl
// Output is a compound of independent bounded faces, not a material solid.
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Geom_BSplineSurface.hxx>
#include <Geom_BezierSurface.hxx>
#include <Standard_Failure.hxx>
#include <TColStd_Array1OfInteger.hxx>
#include <TColStd_Array1OfReal.hxx>
#include <TColStd_Array2OfReal.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TopoDS_Compound.hxx>
#include <algorithm>
#include <array>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr double pi = 3.141592653589793238462643383279502884;
struct Case {
    const char* family;
    int uDegree, vDegree;
    bool rational, multiple, periodic;
};
struct Axis {
    TColStd_Array1OfReal knots;
    TColStd_Array1OfInteger multiplicities;
    int poles;
    Axis(int degree, bool multiple, bool periodic)
        : knots(1, periodic ? 9 : multiple ? 4 : 2),
          multiplicities(1, knots.Length()), poles(0) {
        if (periodic) {
            for (int i = 1; i <= knots.Length(); ++i) {
                knots(i) = i - 1;
                multiplicities(i) = 1;
            }
            poles = 8;
        } else {
            knots(1) = 0;
            knots(knots.Length()) = 1;
            multiplicities(1) = multiplicities(knots.Length()) = degree + 1;
            poles = degree + 1;
            if (multiple) {
                knots(2) = 0.37;
                knots(3) = 0.71;
                // Repeated interior knots on degree >=3 retain at least C1.
                multiplicities(2) = std::min(2, degree - 1);
                multiplicities(3) = 1;
                poles += multiplicities(2) + multiplicities(3);
            }
        }
    }
};
gp_Pnt controlPoint(double u, double v, double offset, bool periodic) {
    if (periodic) {
        const double angle = 2 * pi * u;
        return {offset + 4 * std::cos(angle), 4 * std::sin(angle),
                5 * v + 0.2 * std::sin(2 * angle) * (v - 0.5)};
    }
    return {offset + 5 * u, 7 * v,
            0.4 * std::sin(pi * u) * std::cos(pi * v) + 0.15 * u * v + 0.06 * u * u * v};
}
Handle(Geom_Surface) surface(const Case& spec, double offset) {
    const Axis u(spec.uDegree, spec.multiple, spec.periodic);
    const Axis v(spec.vDegree, spec.multiple, false);
    TColgp_Array2OfPnt poles(1, u.poles, 1, v.poles);
    TColStd_Array2OfReal weights(1, u.poles, 1, v.poles);
    for (int i = 1; i <= u.poles; ++i) for (int j = 1; j <= v.poles; ++j) {
        const double a = double(i - 1) / (spec.periodic ? u.poles : u.poles - 1);
        const double b = double(j - 1) / (v.poles - 1);
        poles(i, j) = controlPoint(a, b, offset, spec.periodic);
        // Strictly positive, varying in both parameter directions.
        weights(i, j) = 1 + 0.2 * std::sin(1.7 * a + 0.6 * b) + 0.15 * a * b;
    }
    if (std::string(spec.family) == "bezier") {
        if (spec.rational) return new Geom_BezierSurface(poles, weights);
        return new Geom_BezierSurface(poles);
    }
    if (spec.rational)
        return new Geom_BSplineSurface(poles, weights, u.knots, v.knots,
            u.multiplicities, v.multiplicities, spec.uDegree, spec.vDegree, spec.periodic, false);
    return new Geom_BSplineSurface(poles, u.knots, v.knots,
        u.multiplicities, v.multiplicities, spec.uDegree, spec.vDegree, spec.periodic, false);
}
void describe(int index, const Case& spec, const TopoDS_Face& face) {
    const BRepAdaptor_Surface actual(face);
    std::cout << "{\"type\":\"face\",\"index\":" << index
              << ",\"family\":\"" << spec.family << "\",\"u_degree\":" << actual.UDegree()
              << ",\"v_degree\":" << actual.VDegree()
              << ",\"u_rational\":" << (actual.IsURational() ? "true" : "false")
              << ",\"v_rational\":" << (actual.IsVRational() ? "true" : "false")
              << ",\"u_periodic\":" << (actual.IsUPeriodic() ? "true" : "false")
              << ",\"v_periodic\":" << (actual.IsVPeriodic() ? "true" : "false")
              << ",\"u_poles\":" << actual.NbUPoles() << ",\"v_poles\":" << actual.NbVPoles()
              << ",\"bounds\":[" << actual.FirstUParameter() << ',' << actual.LastUParameter()
              << ',' << actual.FirstVParameter() << ',' << actual.LastVParameter() << ']';
    if (actual.GetType() == GeomAbs_BSplineSurface) {
        const auto spline = actual.BSpline();
        std::cout << ",\"u_knots\":[";
        for (int i = 1; i <= spline->NbUKnots(); ++i) {
            if (i > 1) std::cout << ',';
            std::cout << '[' << spline->UKnot(i) << ',' << spline->UMultiplicity(i) << ']';
        }
        std::cout << "],\"v_knots\":[";
        for (int i = 1; i <= spline->NbVKnots(); ++i) {
            if (i > 1) std::cout << ',';
            std::cout << '[' << spline->VKnot(i) << ',' << spline->VMultiplicity(i) << ']';
        }
        std::cout << ']';
    }
    std::cout << "}\n";
}
std::vector<Case> cases() {
    const std::array<std::array<int, 2>, 3> degrees{{{2, 8}, {8, 2}, {3, 3}}};
    std::vector<Case> result;
    for (const auto& degree : degrees) for (bool rational : {false, true}) {
        result.push_back({"bezier", degree[0], degree[1], rational, false, false});
        result.push_back({"bspline", degree[0], degree[1], rational, false, false});
        result.push_back({"bspline", degree[0], degree[1], rational, true, false});
    }
    // Uniform cubic periodic ring with eight poles and nine simple U knots.
    // Periodic pole count is sum(multiplicities) excluding one endpoint =8.
    for (bool rational : {false, true}) result.push_back({"bspline", 3, 2, rational, false, true});
    return result;
}
}
int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "Usage: spline-fixtures output.brep\n";
        return 2;
    }
    try {
        std::cout << std::setprecision(17);
        TopoDS_Compound compound;
        BRep_Builder builder;
        builder.MakeCompound(compound);
        int index = 0;
        for (const auto& spec : cases()) {
            BRepBuilderAPI_MakeFace make(surface(spec, index * 20.0), 1e-7);
            if (!make.IsDone()) throw std::runtime_error("Synthetic surface face construction failed");
            const auto face = make.Face();
            if (!BRepCheck_Analyzer(face).IsValid()) throw std::runtime_error("Invalid synthetic surface face");
            builder.Add(compound, face);
            describe(index++, spec, face);
        }
        if (!BRepTools::Write(compound, argv[1], false, false, TopTools_FormatVersion_CURRENT))
            throw std::runtime_error("Could not write synthetic BRep compound");
        std::cout << "{\"type\":\"summary\",\"faces\":" << index << "}\n";
    } catch (const Standard_Failure& failure) {
        std::cerr << "OCCT fixture failure: " << failure.GetMessageString() << '\n';
        return 1;
    } catch (const std::exception& failure) {
        std::cerr << failure.what() << '\n';
        return 1;
    }
}
