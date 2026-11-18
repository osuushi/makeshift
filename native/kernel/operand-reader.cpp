#include "kernel.h"
#include "calculation-failure.h"
#include "timing.h"
#include "shape-measurements.h"
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <cmath>
#include <sstream>

namespace {
struct CheckedOperand {
    std::string brep;
    std::vector<std::vector<double>> signatures;
};
// Keep only the last substantial input, never a mutable kernel shape. Rebuild its
// topology privately on each request and verify the caller's current signatures.
CheckedOperand previous;
TopoDS_Shape readShape(const std::string& data, bool checked) {
    KernelTiming timing("decode");
    if (data.empty() || data.size() % 2) throw std::runtime_error("Invalid exact-shape encoding");
    auto digit = [](char c) { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; throw std::runtime_error("Invalid shape byte"); };
    std::string bytes; bytes.reserve(data.size() / 2);
    for (size_t i = 0; i < data.size(); i += 2) bytes += char(digit(data[i]) * 16 + digit(data[i + 1]));
    std::istringstream stream(bytes); TopoDS_Shape shape; BRep_Builder builder;
    BRepTools::Read(shape, stream, builder);
    timing.phase("read");
    if (shape.IsNull() || (!checked && !BRepCheck_Analyzer(shape).IsValid()))
        throw CalculationFailure("invalid-request", "Invalid exact-shape geometry");
    timing.phase("validation");
    return shape;
}
}

TopoDS_Shape decode(const std::string& data) { return readShape(data, false); }

std::vector<Operand> operands(const Tree& input) {
    std::vector<Operand> result;
    if (const auto values = input.get_child_optional("bodies")) for (const auto& item : *values) {
        const auto& value = item.second;
        const auto& bytes = value.get_child("brep").data();
        const bool cached = !previous.brep.empty() && bytes == previous.brep;
        const bool retain = !cached && bytes.size() >= 65536 && bytes.size() <= 8 * 1024 * 1024;
        Operand body{value.get<std::string>("id"), readShape(bytes, cached), {}};
        if (retain) prepareSurfaceSignatures(body.shape);
        std::vector<std::vector<double>> measured;
        size_t index = 0;
        for (const auto type : {TopAbs_FACE, TopAbs_EDGE}) {
            TopTools_IndexedMapOfShape shapes;
            TopExp::MapShapes(body.shape, type, shapes);
            const auto& keys = value.get_child(type == TopAbs_FACE ? "faces" : "edges");
            if (keys.size() != size_t(shapes.Extent())) throw std::runtime_error("Mismatched serialized topology identity");
            int position = 1;
            for (const auto& entry : keys) {
                const auto& shape = shapes(position++);
                std::vector<double> fresh;
                if (!cached) fresh = signature(shape);
                const auto& actual = cached ? previous.signatures.at(index) : fresh;
                const auto& expected = entry.second.get_child("signature");
                if (actual.size() != expected.size()) throw std::runtime_error("Invalid topology signature");
                size_t i = 0;
                for (const auto& v : expected) {
                    const double number = v.second.get_value<double>();
                    if (!std::isfinite(number) || std::abs(number - actual[i]) > 1e-7 * std::max(1.0, std::abs(actual[i])))
                        throw std::runtime_error("Serialized topology identity does not match geometry");
                    ++i;
                }
                if (retain) measured.push_back(std::move(fresh));
                ++index;
                body.entities.push_back({entry.second.get<std::string>("id"), shape});
            }
        }
        if (retain) previous = {bytes, std::move(measured)};
        result.push_back(std::move(body));
    }
    return result;
}
