// Original analytical-reference quadrature experiment; public OCCT APIs only.
// Source analysis targets OCCT a016080bf6738d6aeae020badee4e888ad1540a5.
// No upstream implementation copied, no approximation/tolerance relaxation.
// Build/run under flock /tmp/makeshift-geometry-compute.lock.
// c++ -O2 -std=c++20 -I.cache/kernel/sdk/include/opencascade
// tests/geometry-performance/quadrature-primitives.cpp -L.cache/kernel/sdk/lib
// -Wl,-rpath,$PWD/.cache/kernel/sdk/lib -lTKPrim -lTKTopAlgo -lTKBRep
// -lTKGeomBase -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/quadrature-primitives
// Usage: quadrature-primitives [all|box|cylinder|sphere|thin-box|patch] [samples=1] [eps=1e-10]
// Timings are raw observations; sample count alone does not establish speedup.
// A planar open face is a flux diagnostic, never a solid-volume assertion.
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopLoc_Location.hxx>
#include <gp_Ax2.hxx>
#include <gp_Pln.hxx>
#include <gp_Trsf.hxx>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
using Clock = std::chrono::steady_clock;
constexpr long double pi = 3.141592653589793238462643383279502884L;
struct Primitive {
    const char* name;
    TopoDS_Shape shape;
    long double analytical;
};
double milliseconds(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}
void number(long double value) {
    if (std::isfinite(value)) std::cout << value;
    else std::cout << "null";
}
std::vector<Primitive> primitives(const gp_Pnt& origin) {
    std::vector<Primitive> result{
        {"box", BRepPrimAPI_MakeBox(12, 7, 5).Shape(), 420},
        {"thin-box", BRepPrimAPI_MakeBox(12, 7, 1e-4).Shape(), 84.0L * 1e-4L},
        {"cylinder", BRepPrimAPI_MakeCylinder(3, 5).Shape(), 45 * pi},
        {"sphere", BRepPrimAPI_MakeSphere(3).Shape(), 36 * pi},
    };
    gp_Trsf shift;
    shift.SetTranslation(gp_Vec(origin.XYZ()));
    // Keep the exact same local supports/dimensions; vary only TopLoc placement.
    for (auto& primitive : result) primitive.shape = primitive.shape.Moved(TopLoc_Location(shift));
    return result;
}
void measure(const Primitive& primitive, const gp_Pnt& translation, const gp_Pln& plane,
             int axis, const char* reference, int sign, int block, double eps) {
    GProp_GProps properties;
    const auto start = Clock::now();
    const double estimated = BRepGProp::VolumePropertiesGK(
        primitive.shape, properties, plane, eps, false, true, false, false, false);
    const double duration = milliseconds(start);
    const long double actual = properties.Mass();
    const long double relative = std::abs(actual - primitive.analytical) / primitive.analytical;
    std::cout << "{\"type\":\"solid\",\"primitive\":\"" << primitive.name
              << "\",\"translation\":[" << translation.X() << ',' << translation.Y() << ',' << translation.Z()
              << "],\"axis\":" << axis << ",\"reference\":\"" << reference << "\",\"normal_sign\":" << sign
              << ",\"plane_origin_axis\":" << plane.Location().Coord(axis + 1)
              << ",\"block\":" << block << ",\"requested_eps\":" << eps << ",\"milliseconds\":" << duration
              << ",\"mass\":";
    number(actual);
    std::cout << ",\"analytical_mass\":";
    number(primitive.analytical);
    std::cout << ",\"analytical_relative_error\":";
    number(relative);
    std::cout << ",\"estimated_error\":";
    number(estimated);
    std::cout << ",\"within_requested_eps\":"
              << (estimated >= 0 && std::isfinite(actual) && relative <= eps ? "true" : "false") << "}\n";
}
void measureOrdinary(const Primitive& primitive, const gp_Pnt& translation, int block, double eps) {
    GProp_GProps properties;
    const auto start = Clock::now();
    const double estimated = BRepGProp::VolumeProperties(primitive.shape, properties, eps, false, false);
    const double duration = milliseconds(start);
    const long double relative = std::abs(static_cast<long double>(properties.Mass()) - primitive.analytical)
        / primitive.analytical;
    std::cout << "{\"type\":\"ordinary\",\"primitive\":\"" << primitive.name
              << "\",\"translation\":[" << translation.X() << ',' << translation.Y() << ',' << translation.Z()
              << "],\"block\":" << block << ",\"requested_eps\":" << eps << ",\"milliseconds\":" << duration
              << ",\"mass\":";
    number(properties.Mass());
    std::cout << ",\"analytical_relative_error\":";
    number(relative);
    std::cout << ",\"estimated_error\":";
    number(estimated);
    std::cout << "}\n";
}
void diagnosePatch(const gp_Pnt& translation, double eps) {
    const double height = translation.Z() + 4, supplied = translation.Z() + 2;
    const auto face = BRepBuilderAPI_MakeFace(
        gp_Pln(gp_Pnt(translation.X(), translation.Y(), height), gp_Dir(0, 0, 1)), 0, 3, 0, 5).Face();
    for (const double origin : {supplied, -supplied}) {
        GProp_GProps properties;
        const double estimated = BRepGProp::VolumePropertiesGK(face, properties,
            gp_Pln(gp_Pnt(0, 0, origin), gp_Dir(0, 0, 1)), eps, false, true, false, false, false);
        const long double intended = 15.0L * (static_cast<long double>(height) - origin);
        const long double literal = 15.0L * (static_cast<long double>(height) + origin);
        std::cout << "{\"type\":\"open_face_flux\",\"height\":" << height << ",\"plane_origin\":" << origin
                  << ",\"mass\":";
        number(properties.Mass());
        std::cout << ",\"geometric_plane_flux\":";
        number(intended);
        std::cout << ",\"source_literal_mirrored_flux\":";
        number(literal);
        std::cout << ",\"estimated_error\":";
        number(estimated);
        std::cout << "}\n";
    }
}
void run(const std::string& filter, int samples, double eps) {
    const std::array<gp_Pnt, 3> translations{
        gp_Pnt(0, 0, 0), gp_Pnt(1234, -4567, 123), gp_Pnt(1e6, -2e6, 3e6)};
    for (const auto& translation : translations) {
        if (filter == "all" || filter == "patch") diagnosePatch(translation, eps);
        if (filter == "patch") continue;
        for (const auto& primitive : primitives(translation)) {
            if (filter != "all" && filter != primitive.name) continue;
            if (!BRepCheck_Analyzer(primitive.shape, true, false, true).IsValid())
                throw std::runtime_error("Analytical primitive has invalid BRep");
            for (int block = 0; block < samples; ++block) {
                measureOrdinary(primitive, translation, block, eps);
                for (int axis = 0; axis < 3; ++axis) {
                    const double low = translation.Coord(axis + 1)
                        - (std::string(primitive.name) == "sphere" ||
                           (std::string(primitive.name) == "cylinder" && axis < 2) ? 3 : 0);
                    const std::array<double, 3> origins{low - 1, -(low - 1), 0};
                    const std::array<const char*, 3> labels{"supplied-low-minus-one", "mirrored-low-minus-one", "zero"};
                    for (int reference = 0; reference < 3; ++reference) for (int sign : {1, -1}) {
                        gp_Pnt origin(0, 0, 0);
                        origin.SetCoord(axis + 1, origins[reference]);
                        const gp_Dir normal(sign * (axis == 0), sign * (axis == 1), sign * (axis == 2));
                        measure(primitive, translation, gp_Pln(origin, normal), axis,
                                labels[reference], sign, block, eps);
                    }
                }
            }
        }
    }
}
}
int main(int argc, char** argv) {
    const std::string filter = argc > 1 ? argv[1] : "all";
    const int samples = argc > 2 ? std::stoi(argv[2]) : 1;
    const double eps = argc > 3 ? std::stod(argv[3]) : 1e-10;
    const std::array<std::string, 6> valid{"all", "box", "cylinder", "sphere", "thin-box", "patch"};
    if (argc > 4 || samples < 1 || !std::isfinite(eps) || eps <= 0 ||
        std::find(valid.begin(), valid.end(), filter) == valid.end()) {
        std::cerr << "Usage: quadrature-primitives [all|box|cylinder|sphere|thin-box|patch] [samples=1] [eps=1e-10]\n";
        return 2;
    }
    std::cout << std::setprecision(21);
    try {
        run(filter, samples, eps);
    } catch (const Standard_Failure& error) {
        std::cerr << "OCCT experiment failure: " << error.GetMessageString() << '\n';
        return 1;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
