// Public OCCT APIs; original diagnostic, no upstream implementation copied.
// OCCT source pin a016080bf6738d6aeae020badee4e888ad1540a5 (7.9.3).
// Compile/run only under /tmp/makeshift-geometry-compute.lock.
// Usage: volume-placement INPUT.brep OUTPUT.jsonl [KNOWN_VOLUME|-] [all|x|y|z]
// All measurements serial; placements are added translations, not refitted geometry.
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Pln.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {
constexpr double eps = 1e-10;
constexpr const char* pin = "a016080bf6738d6aeae020badee4e888ad1540a5";
struct Placement {
    const char* name;
    gp_Vec translation;
};
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
std::string quoted(const std::string& value) {
    std::ostringstream out;
    out << '"';
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c);
        else out << c;
    }
    out << '"';
    return out.str();
}
void number(std::ostream& out, long double value) {
    if (std::isfinite(value)) out << value;
    else out << "null";
}
std::string encoding(const TopoDS_Shape& shape) {
    std::ostringstream out;
    BRepTools::Write(shape, out, false, false, TopTools_FormatVersion_CURRENT);
    return out.str();
}
std::uint64_t hash(const std::string& bytes) {
    std::uint64_t value = 14695981039346656037ULL;
    for (unsigned char c : bytes) { value ^= c; value *= 1099511628211ULL; }
    return value;
}
TopoDS_Shape moved(const TopoDS_Shape& source, const gp_Vec& translation) {
    gp_Trsf transform;
    transform.SetTranslation(translation);
    return source.Moved(TopLoc_Location(transform));
}
std::array<double, 6> bounds(const TopoDS_Shape& shape) {
    Bnd_Box box;
    BRepBndLib::AddOptimal(shape, box, false, false);
    require(!box.IsVoid() && !box.IsOpen(), "Expected finite nonempty bounds");
    std::array<double, 6> values;
    box.Get(values[0], values[1], values[2], values[3], values[4], values[5]);
    for (double v : values) require(std::isfinite(v), "Bounds are not finite");
    return values;
}
void header(std::ostream& out, const Placement& placement, int axis, int sign,
            bool mirrored, double coordinate) {
    out << "{\"type\":\"mass\",\"placement\":" << quoted(placement.name)
        << ",\"axis\":" << axis << ",\"normal_sign\":" << sign
        << ",\"plane_convention\":" << quoted(mirrored ? "mirrored-low-minus-one" : "literal-low-minus-one")
        << ",\"plane_origin_axis\":" << coordinate;
}
bool measure(std::ostream& out, const TopoDS_Shape& shape, const Placement& placement,
             int axis, int sign, bool mirrored, double boundary,
             const std::optional<long double>& known) {
    const double coordinate = mirrored ? -boundary : boundary;
    header(out, placement, axis, sign, mirrored, coordinate);
    try {
        gp_Pnt origin(0., 0., 0.);
        origin.SetCoord(axis + 1, coordinate);
        const gp_Dir normal(sign * (axis == 0), sign * (axis == 1), sign * (axis == 2));
        GProp_GProps props;
        const auto start = std::chrono::steady_clock::now();
        const double estimated = BRepGProp::VolumePropertiesGK(shape, props,
            gp_Pln(origin, normal), eps, false, true, false, false, false);
        const double milliseconds = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - start).count();
        const long double signedMass = props.Mass(), mass = std::abs(signedMass);
        const bool done = std::isfinite(estimated) && estimated >= 0 && std::isfinite(mass);
        out << ",\"signed_mass\":"; number(out, signedMass);
        out << ",\"absolute_mass\":"; number(out, mass);
        out << ",\"estimated_error\":"; number(out, estimated);
        out << ",\"milliseconds\":"; number(out, milliseconds);
        out << ",\"api_success\":" << (done ? "true" : "false");
        bool accurate = true;
        if (known) {
            const long double absoluteError = std::abs(mass - *known);
            const long double relativeError = absoluteError / *known;
            accurate = done && relativeError <= eps;
            out << ",\"reference_absolute_error\":"; number(out, absoluteError);
            out << ",\"reference_relative_error\":"; number(out, relativeError);
            out << ",\"within_reference_relative_eps\":" << (accurate ? "true" : "false");
        } else out << ",\"reference_absolute_error\":null,\"reference_relative_error\":null,"
                   "\"within_reference_relative_eps\":null";
        out << "}\n";
        out.flush();
        return done && accurate;
    } catch (const Standard_Failure& error) {
        out << ",\"api_success\":false,\"error\":" << quoted(error.GetMessageString()) << "}\n";
    } catch (const std::exception& error) {
        out << ",\"api_success\":false,\"error\":" << quoted(error.what()) << "}\n";
    }
    out.flush();
    return false;
}
bool run(std::ostream& out, const TopoDS_Shape& source, const std::string& path,
         const std::optional<long double>& known, int selectedAxis) {
    const auto before = encoding(source);
    const auto location = source.Location();
    const auto orientation = source.Orientation();
    out << "{\"type\":\"provenance\",\"input\":" << quoted(path)
        << ",\"occt_source_pin\":" << quoted(pin) << ",\"requested_eps\":" << eps
        << ",\"only_closed\":false,\"use_spans\":true,\"cg\":false,\"inertia\":false,\"skip_shared\":false"
        << ",\"source_hash\":" << quoted(std::to_string(hash(before)))
        << ",\"source_bytes\":" << before.size() << ",\"known_positive_volume\":";
    if (known) number(out, *known); else out << "null";
    out << ",\"timing_claim\":\"diagnostic only; no statistical benchmark\"}\n";
    const std::array<Placement, 3> placements{{
        {"origin-added-zero", gp_Vec(0., 0., 0.)},
        {"modest-added-translation", gp_Vec(1234., -4567., 123.)},
        {"far-added-translation", gp_Vec(1e6, -2e6, 3e6)}}};
    bool passed = true;
    for (const auto& placement : placements) {
        const auto shape = moved(source, placement.translation);
        const bool partner = shape.IsPartner(source), sameOrientation = shape.Orientation() == orientation;
        const bool valid = BRepCheck_Analyzer(shape, true, false, true).IsValid();
        const auto box = bounds(shape);
        out << "{\"type\":\"placement\",\"placement\":" << quoted(placement.name)
            << ",\"translation\":[" << placement.translation.X() << ',' << placement.translation.Y()
            << ',' << placement.translation.Z() << "],\"same_tshape\":" << (partner ? "true" : "false")
            << ",\"same_orientation\":" << (sameOrientation ? "true" : "false")
            << ",\"exact_valid\":" << (valid ? "true" : "false") << ",\"bounds\":[";
        for (std::size_t i = 0; i < box.size(); ++i) out << (i ? "," : "") << box[i];
        out << "]}\n";
        require(partner && sameOrientation && valid, "Placement changed geometry or is invalid");
        for (int axis = 0; axis < 3; ++axis) {
            if (selectedAxis >= 0 && axis != selectedAxis) continue;
            for (bool mirrored : {false, true}) for (int sign : {1, -1})
                if (!measure(out, shape, placement, axis, sign, mirrored, box[axis] - 1., known)) passed = false;
        }
    }
    const auto after = encoding(source);
    const bool unchanged = before == after && location.IsEqual(source.Location())
        && orientation == source.Orientation();
    out << "{\"type\":\"source\",\"encoding_location_orientation_unchanged\":"
        << (unchanged ? "true" : "false") << ",\"after_hash\":" << quoted(std::to_string(hash(after))) << "}\n";
    require(unchanged, "Original source changed during measurement");
    return passed;
}
}
int main(int argc, char** argv) {
    try {
        require(argc >= 3 && argc <= 5, "Usage: volume-placement INPUT.brep OUTPUT.jsonl [KNOWN_VOLUME|-] [all|x|y|z]");
        std::optional<long double> known;
        if (argc >= 4 && std::string(argv[3]) != "-") {
            std::size_t consumed;
            const std::string text = argv[3];
            known = std::stold(text, &consumed);
            require(consumed == text.size() && std::isfinite(*known) && *known > 0, "Known volume must be finite and positive");
        }
        int axis = -1;
        if (argc == 5) {
            const std::string selected = argv[4];
            if (selected != "all") {
                require(selected == "x" || selected == "y" || selected == "z", "Axis must be all/x/y/z");
                axis = selected == "x" ? 0 : selected == "y" ? 1 : 2;
            }
        }
        require(std::string(argv[1]) != argv[2], "Output must differ from input");
        TopoDS_Shape source;
        BRep_Builder builder;
        require(BRepTools::Read(source, argv[1], builder), "Cannot read input BRep");
        require(!source.IsNull() && source.ShapeType() == TopAbs_SOLID, "Expected a single closed solid BRep");
        require(BRepCheck_Analyzer(source, true, false, true).IsValid(), "Input fails exact BRep validation");
        std::ifstream existing(argv[2]);
        require(!existing.good(), "Output already exists; choose a new path");
        std::ofstream output(argv[2]);
        require(output.good(), "Cannot open output JSONL");
        output << std::setprecision(21);
        const bool passed = run(output, source, argv[1], known, axis);
        output.flush();
        require(output.good(), "Cannot write output JSONL");
        return passed ? 0 : 1;
    } catch (const Standard_Failure& error) {
        std::cerr << "OCCT failure: " << error.GetMessageString() << '\n';
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
    }
    return 1;
}
