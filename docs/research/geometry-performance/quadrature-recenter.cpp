// Public-API mass-only conditioning experiment against pinned OCCT 7.9.3.
// Build/run only under /tmp/makeshift-geometry-compute.lock.
// Link TKPrim TKTopAlgo TKBRep TKGeomBase TKG3d TKG2d TKMath TKernel.
// Usage: quadrature-recenter [all|thin-box] [samples=1]
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakeSphere.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Pln.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr long double pi = 3.141592653589793238462643383279502884L;
constexpr double eps = 1e-10;
struct Primitive {
    std::string name, placement;
    TopoDS_Shape shape;
    long double analytic;
};
struct Variant {
    const char* name;
    TopoDS_Shape shape;
};
void require(bool pass, const char* message) {
    if (!pass) throw std::runtime_error(message);
}
std::string encoding(const TopoDS_Shape& shape) {
    std::ostringstream stream;
    BRepTools::Write(shape, stream);
    return stream.str();
}
std::uint64_t hash(const std::string& bytes) {
    std::uint64_t value = 14695981039346656037ULL;
    for (unsigned char byte : bytes) { value ^= byte; value *= 1099511628211ULL; }
    return value;
}
TopLoc_Location translation(const gp_Vec& shift) {
    gp_Trsf transform;
    transform.SetTranslation(shift);
    return TopLoc_Location(transform);
}
gp_Pnt center(const TopoDS_Shape& shape) {
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(shape, bounds, false, false);
    double x, y, z, X, Y, Z;
    bounds.Get(x, y, z, X, Y, Z);
    return gp_Pnt((x + X) / 2, (y + Y) / 2, (z + Z) / 2);
}
double low(const TopoDS_Shape& shape, int axis) {
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(shape, bounds, false, false);
    double x, y, z, X, Y, Z;
    bounds.Get(x, y, z, X, Y, Z);
    return std::array<double, 3>{x, y, z}[axis];
}
std::vector<Primitive> primitives(const std::string& filter) {
    std::vector<Primitive> result;
    const std::array<gp_Vec, 3> shifts{
        gp_Vec(0., 0., 0.), gp_Vec(1234., -4567., 123.), gp_Vec(1e6, -2e6, 3e6)};
    const std::array<const char*, 3> names{"origin", "moderate", "far"};
    for (size_t i = 0; i < shifts.size(); ++i) {
        std::vector<Primitive> local{
            {"box", names[i], BRepPrimAPI_MakeBox(12., 7., 5.).Shape(), 420.L},
            {"thin-box", names[i], BRepPrimAPI_MakeBox(12., 7., 1e-4).Shape(), 84.L * 1e-4L},
            {"cylinder", names[i], BRepPrimAPI_MakeCylinder(3., 5.).Shape(), 45.L * pi},
            {"sphere", names[i], BRepPrimAPI_MakeSphere(3.).Shape(), 36.L * pi}};
        for (auto& primitive : local) {
            if (filter != "all" && primitive.name != filter) continue;
            primitive.shape = primitive.shape.Moved(translation(shifts[i]));
            result.push_back(primitive);
        }
    }
    BRep_Builder builder;
    TopoDS_Compound nested;
    builder.MakeCompound(nested);
    builder.Add(nested, BRepPrimAPI_MakeBox(12., 7., 1e-4).Shape()
        .Moved(translation(gp_Vec(1e6, -2e6, 3e6))));
    result.push_back({"thin-box", "nested-far-child", nested.Moved(translation(gp_Vec(71., -37., 23.))),
                      84.L * 1e-4L});
    result.push_back({"thin-box", "intrinsic-world-support",
        BRepPrimAPI_MakeBox(gp_Pnt(1e6, -2e6, 3e6), 12., 7., 1e-4).Shape(), 84.L * 1e-4L});
    return result;
}
std::vector<Variant> variants(const TopoDS_Shape& shape) {
    const auto inverse = TopLoc_Location(shape.Location().Transformation().Inverted());
    const auto midpoint = center(shape);
    return {{"original", shape},
            {"inverse-root-location", shape.Moved(inverse)},
            {"bbox-center", shape.Moved(translation(-gp_Vec(midpoint.XYZ())))}};
}
void number(long double value) {
    if (std::isfinite(value)) std::cout << value;
    else std::cout << "null";
}
void measure(const Primitive& primitive, const Variant& variant, bool valid,
             int axis, const char* reference, double origin, int sign, int block) {
    gp_Pnt point(0., 0., 0.);
    point.SetCoord(axis + 1, origin);
    GProp_GProps properties;
    const auto start = std::chrono::steady_clock::now();
    const double estimated = BRepGProp::VolumePropertiesGK(variant.shape, properties,
        gp_Pln(point, gp_Dir(sign * (axis == 0), sign * (axis == 1), sign * (axis == 2))),
        eps, false, true, false, false, false);
    const double milliseconds = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - start).count();
    const long double actual = properties.Mass();
    const long double relative = std::abs(actual - primitive.analytic) / primitive.analytic;
    std::cout << "{\"type\":\"mass\",\"primitive\":\"" << primitive.name
              << "\",\"placement\":\"" << primitive.placement << "\",\"variant\":\"" << variant.name
              << "\",\"axis\":" << axis << ",\"reference\":\"" << reference << "\",\"normal_sign\":" << sign
              << ",\"plane_origin_axis\":" << origin << ",\"block\":" << block
              << ",\"requested_eps\":" << eps << ",\"valid\":" << (valid ? "true" : "false")
              << ",\"milliseconds\":" << milliseconds << ",\"mass\":";
    number(actual);
    std::cout << ",\"analytical_mass\":"; number(primitive.analytic);
    std::cout << ",\"analytical_relative_error\":"; number(relative);
    std::cout << ",\"estimated_error\":"; number(estimated);
    std::cout << ",\"within_requested_eps\":"
              << (valid && estimated >= 0 && std::isfinite(actual) && relative <= eps ? "true" : "false")
              << "}\n";
}
void run(const std::string& filter, int samples) {
    for (const auto& primitive : primitives(filter)) {
        const auto original = encoding(primitive.shape);
        const auto originalLocation = primitive.shape.Location();
        const auto originalOrientation = primitive.shape.Orientation();
        for (const auto& variant : variants(primitive.shape)) {
            require(variant.shape.IsPartner(primitive.shape), "Recenter changed the source TShape");
            require(variant.shape.Orientation() == originalOrientation, "Recenter changed orientation");
            const bool valid = BRepCheck_Analyzer(variant.shape, true, false, true).IsValid();
            for (int axis = 0; axis < 3; ++axis) {
                const double boundary = low(variant.shape, axis) - 1.;
                const std::array<double, 3> origins{boundary, -boundary, 0.};
                const std::array<const char*, 3> labels{"supplied-low-minus-one", "mirrored-low-minus-one", "zero"};
                for (int block = 0; block < samples; ++block)
                    for (int reference = 0; reference < 3; ++reference) for (int sign : {1, -1})
                        measure(primitive, variant, valid, axis, labels[reference], origins[reference], sign, block);
            }
        }
        const auto after = encoding(primitive.shape);
        const bool unchanged = original == after && primitive.shape.Location().IsEqual(originalLocation)
            && primitive.shape.Orientation() == originalOrientation;
        std::cout << "{\"type\":\"source\",\"primitive\":\"" << primitive.name
                  << "\",\"placement\":\"" << primitive.placement << "\",\"before_hash\":" << hash(original)
                  << ",\"after_hash\":" << hash(after) << ",\"encoding_bytes\":" << original.size()
                  << ",\"unchanged\":" << (unchanged ? "true" : "false") << "}\n";
        require(unchanged, "Source encoding/location/orientation changed");
    }
}
}
int main(int argc, char** argv) {
    std::cout << std::setprecision(21);
    try {
        const std::string filter = argc > 1 ? argv[1] : "all";
        const int samples = argc > 2 ? std::stoi(argv[2]) : 1;
        if (argc > 3 || samples < 1 || (filter != "all" && filter != "thin-box")) {
            std::cerr << "Usage: quadrature-recenter [all|thin-box] [samples=1]\n";
            return 2;
        }
        run(filter, samples);
        return 0;
    } catch (const Standard_Failure& error) {
        std::cerr << "OCCT failure: " << error.GetMessageString() << '\n';
        return 1;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
