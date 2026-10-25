#include "kernel.h"
#include "deferred-presentation.h"
#include "presentation-mesh.h"
#include "erosion.h"
#include "measurement.h"
#include "mesh-fit.h"
#include "timing.h"
#include "geometry-policy.h"
#include <boost/property_tree/json_parser.hpp>
#include <BRepTools.hxx>
#include <OSD_Parallel.hxx>
#include <OSD_ThreadPool.hxx>
#include <algorithm>
#include <BRep_Builder.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

std::string quoted(const std::string& value) {
    std::ostringstream out; out << '"';
    for (unsigned char c : value) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
        else out << c;
    }
    out << '"'; return out.str();
}
gp_Pnt point(const Tree& tree) {
    double xyz[3]; size_t i = 0;
    for (const auto& child : tree) {
        if (i >= 3) throw std::runtime_error("Expected three coordinates");
        xyz[i] = child.second.get_value<double>();
        if (!std::isfinite(xyz[i++])) throw std::runtime_error("Coordinates must be finite");
    }
    if (i != 3) throw std::runtime_error("Expected three coordinates");
    return {xyz[0], xyz[1], xyz[2]};
}
void validate(const TopoDS_Shape& shape) {
    if (shape.IsNull() || !BRepCheck_Analyzer(shape).IsValid()) throw std::runtime_error("Kernel produced invalid geometry");
}
std::string encode(const TopoDS_Shape& shape) {
    std::ostringstream stream; BRepTools::Write(shape, stream, false, false, TopTools_FormatVersion_CURRENT);
    const auto bytes = stream.str(); std::string result; result.reserve(bytes.size() * 2);
    for (unsigned char c : bytes) { result += "0123456789abcdef"[c >> 4]; result += "0123456789abcdef"[c & 15]; }
    return result;
}
TopoDS_Shape decode(const std::string& data) {
    if (data.empty() || data.size() % 2) throw std::runtime_error("Invalid exact-shape encoding");
    auto digit = [](char c) { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; throw std::runtime_error("Invalid shape byte"); };
    std::string bytes; bytes.reserve(data.size() / 2);
    for (size_t i = 0; i < data.size(); i += 2) bytes += char(digit(data[i]) * 16 + digit(data[i + 1]));
    std::istringstream stream(bytes); TopoDS_Shape shape; BRep_Builder builder;
    BRepTools::Read(shape, stream, builder); validate(shape); return shape;
}
std::vector<Operand> operands(const Tree& input) {
    std::vector<Operand> result;
    if (auto values = input.get_child_optional("bodies")) for (const auto& item : *values) {
        const auto& value = item.second;
        Operand body{value.get<std::string>("id"), decode(value.get<std::string>("brep")), {}};
        for (const auto type : {TopAbs_FACE, TopAbs_EDGE}) {
            TopTools_IndexedMapOfShape shapes; TopExp::MapShapes(body.shape, type, shapes);
            const auto& keys = value.get_child(type == TopAbs_FACE ? "faces" : "edges");
            if (keys.size() != size_t(shapes.Extent())) throw std::runtime_error("Mismatched serialized topology identity");
            int index = 1;
            for (const auto& item : keys) {
                const auto shape = shapes(index++);
                const auto actual = signature(shape); const auto& expected = item.second.get_child("signature");
                if (actual.size() != expected.size()) throw std::runtime_error("Invalid topology signature");
                size_t i = 0;
                for (const auto& v : expected) {
                    const double number = v.second.get_value<double>();
                    if (!std::isfinite(number) || std::abs(number - actual[i]) > 1e-7 * std::max(1.0, std::abs(actual[i])))
                        throw std::runtime_error("Serialized topology identity does not match geometry");
                    ++i;
                }
                body.entities.push_back({item.second.get<std::string>("id"), shape});
            }
        }
        result.push_back(std::move(body));
    }
    return result;
}
namespace {
void writeMassCenter(std::ostream& reply, const std::vector<Operand>& bodies) {
    if (bodies.size() != 1) throw std::runtime_error("Select one body for center of mass");
    GProp_GProps properties;
    // GK omits first moments unless CGFlag is explicitly enabled.
    const double error = BRepGProp::VolumePropertiesGK(bodies.front().shape, properties,
                                                      1e-10, false, true, true);
    const auto center = properties.CentreOfMass();
    if (!std::isfinite(error) || error < 0 || !std::isfinite(properties.Mass()) ||
        std::abs(properties.Mass()) <= geometry_policy::minimumSolidVolumeMm3 ||
        !std::isfinite(center.X()) || !std::isfinite(center.Y()) || !std::isfinite(center.Z()))
        throw std::runtime_error("Center of mass integration failed");
    reply << std::setprecision(17) << "{\"centerOfMass\":[" << center.X() << ','
          << center.Y() << ',' << center.Z() << "]}";
}
void request(std::ostream& reply, const Tree& input, KernelTiming& timing) {
    if (input.get<std::string>("kind") == "complete-preview") {
        completePresentation(reply);
        return;
    }
    clearDeferredPresentation();
    if (input.get<std::string>("kind") == "fit-mesh") {
        std::ostringstream output; mesh_fit::reconstruct(output,input);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "export-step") {
        std::ostringstream output; exportStep(output, input);
        reply << output.str(); return;
    }
    const auto bodies = operands(input); std::string mode;
    timing.phase("operands");
    if (input.get<std::string>("kind") == "center-of-mass") {
        writeMassCenter(reply, bodies); return;
    }
    if (input.get<std::string>("kind") == "topology") {
        std::ostringstream output; output << std::setprecision(17);
        inspectTopology(output, input, bodies);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "measure") {
        std::ostringstream output; measureSelection(output, input, bodies);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "edge-finish-selection") {
        std::ostringstream output;
        edgeFinishSelection(output, input, bodies);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "edge-finish-targets") {
        std::ostringstream output; output << std::setprecision(17);
        edgeFinishTargets(output, input, bodies);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "offset-sketch") {
        std::ostringstream output; offsetSketch(output, input);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "sections") {
        std::ostringstream output; sketchSections(output, input, bodies);
        reply << output.str(); return;
    }
    if (input.get<std::string>("kind") == "project") {
        std::ostringstream output; projectCurves(output, input, bodies);
        reply << output.str(); return;
    }
    std::vector<std::string> participants;
    Tree erosionQuality;
    std::vector<Result> tools;
    const bool erode = input.get<std::string>("kind") == "erode";
    if (erode) mode = "new";
    const auto results = erode ? erodeBodies(input,bodies,participants,&erosionQuality)
        : calculate(input,bodies,mode,participants,&tools);

    timing.phase("calculate");
    if (input.get<std::string>("presentation", "") == "deferred") {
        const auto kind = input.get<std::string>("kind");
        if (kind != "move-faces" && kind != "move-edges")
            throw std::runtime_error("Deferred presentation requires boundary movement");
        deferPresentation(reply, results, mode, participants);
        return;
    }
    const bool visual = input.get<std::string>("presentation", "") == "visual";
    if (visual && (input.get<std::string>("kind") != "extrude" || (mode != "new" && mode != "union") || !participants.empty()))
        throw std::runtime_error("Visual presentation currently requires a new extrusion");
    const auto presentation = visual ? presentVisual : present;
    std::ostringstream output; output << std::setprecision(17) << "{\"mode\":" << quoted(mode) << ",\"participants\":[";
    for (size_t i = 0; i < participants.size(); i++) { if (i) output << ','; output << quoted(participants[i]); }
    output << "],\"results\":[";
    const double deflection = input.get<std::string>("kind") == "inspect"
        ? input.get<double>("deflection", 0.05) : 0.05;
    for (size_t i = 0; i < results.size(); i++) { if (i) output << ','; presentation(output, results[i], deflection); }
    output << "],\"tools\":[";
    for (size_t i = 0; i < tools.size(); i++) { if (i) output << ','; presentation(output, tools[i], deflection); }
    timing.phase("presentation");
    output << ']';
    if (visual) output << ",\"presentation\":\"visual\"";
    if (erode && input.get<std::string>("method","fast") == "fast") writeErosionQuality(output,erosionQuality);
    reply << output.str() << '}';
    timing.phase("write");
}
}
int main() {
    const char* configuredThreads = std::getenv("MAKESHIFT_KERNEL_THREADS");
    if (!configuredThreads) configuredThreads = std::getenv("FREAC_KERNEL_THREADS");
    const int processors = std::max(1, OSD_Parallel::NbLogicalProcessors());
    const int threads = configuredThreads ? std::clamp(std::atoi(configuredThreads), 1, processors)
        : processors;
#ifdef __EMSCRIPTEN__
    OSD_ThreadPool::DefaultPool(1);
#else
    OSD_ThreadPool::DefaultPool(threads);
#endif
    std::cout << std::setprecision(17);
    std::string line;
    while (std::getline(std::cin, line)) {
        KernelTiming timing;
        try {
            Tree input; std::istringstream stream(line); boost::property_tree::read_json(stream, input);
            timing.operation(input.get<std::string>("kind")); timing.phase("parse");
            std::ostringstream output;
            request(output,input,timing);
            std::cout << output.str() << std::endl;
        } catch (const erosion::AllowanceFailure& e) {
            clearDeferredPresentation();
            std::cout << "{\"error\":" << quoted(e.what());
            if (std::isfinite(e.allowance))
                std::cout << ",\"erosionAllowance\":" << std::setprecision(17) << e.allowance;
            std::cout << "}" << std::endl;
        } catch (const Standard_Failure& e) {
            clearDeferredPresentation();
            const std::string detail = e.GetMessageString() ? e.GetMessageString() : "Geometry calculation failed";
            const auto message = detail.find("Courbes non jointives") != std::string::npos
                ? "The operation could not join the curves within tolerance." : detail;
            std::cerr << detail << std::endl;
            std::cout << "{\"error\":" << quoted(message) << "}" << std::endl;
        }
        catch (const std::exception& e) {
            clearDeferredPresentation();
            std::cout << "{\"error\":" << quoted(e.what()) << "}" << std::endl;
        }
    }
    return 0;
}
