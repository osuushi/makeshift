#include "kernel.h"
#include "erosion.h"
#include "measurement.h"
#include "mesh-fit.h"
#include "timing.h"
#include <boost/property_tree/json_parser.hpp>
#include <BRepTools.hxx>
#include <OSD_Parallel.hxx>
#include <OSD_ThreadPool.hxx>
#include <algorithm>
#include <BRep_Builder.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <gp_Pln.hxx>
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
double volume(const TopoDS_Shape& shape) {
    KernelTiming timing("volume");
    if (shape.IsNull()) return 0;
    GProp_GProps props;
    bool planar = true;
    for (TopExp_Explorer e(shape, TopAbs_FACE); e.More(); e.Next())
        if (BRepAdaptor_Surface(TopoDS::Face(e.Current())).GetType() != GeomAbs_Plane) planar = false;
    double error;
    if (planar) error = BRepGProp::VolumeProperties(shape, props, 1e-10);
    else {
        Bnd_Box bounds; BRepBndLib::AddOptimal(shape, bounds, false, false);
        timing.phase("bounds");
        if (bounds.IsVoid()) return 0;
        double lo[3], hi[3]; bounds.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
        // Integrate across spline spans. Ordinary adaptive quadrature can converge
        // to different volumes for the same solid after its faces are repartitioned.
        // A nearby exterior plane avoids near-zero integrals on trimmed faces,
        // without amplifying boundary tolerances along the body's longest axis.
        std::array<int,3> axes{0,1,2};
        std::stable_sort(axes.begin(),axes.end(),[&](int a,int b) { return hi[a]-lo[a] < hi[b]-lo[b]; });
        for (const int axis : axes) {
            gp_Pnt origin(lo[0],lo[1],lo[2]);
            origin.SetCoord(axis+1,lo[axis]-1);
            const gp_Dir normal(axis == 0,axis == 1,axis == 2);
            error = BRepGProp::VolumePropertiesGK(shape,props,gp_Pln(origin,normal),1e-10,false,true);
            if (std::isfinite(error) && error >= 0) break;
            // A failed face aborts GK before all properties are accumulated. Try a
            // different integral reference, never accept its partial mass or error.
            if (std::getenv("MAKESHIFT_KERNEL_TIMING"))
                std::cerr << "volume integration reference " << axis << " failed: " << error << std::endl;
        }
    }
    if (!std::isfinite(error) || error < 0) throw std::runtime_error("Solid volume integration failed");
    const double value = std::abs(props.Mass());
    timing.phase("integrate");
    if (!std::isfinite(value)) throw std::runtime_error("Non-finite solid volume");
    return value;
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
void request(std::ostream& reply, const Tree& input, KernelTiming& timing) {
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
    const bool erode = input.get<std::string>("kind") == "erode";
    if (erode) mode = "new";
    const auto results = erode ? erodeBodies(input,bodies,participants,&erosionQuality)
        : calculate(input,bodies,mode,participants);

    timing.phase("calculate");
    std::ostringstream output; output << std::setprecision(17) << "{\"mode\":" << quoted(mode) << ",\"participants\":[";
    for (size_t i = 0; i < participants.size(); i++) { if (i) output << ','; output << quoted(participants[i]); }
    output << "],\"results\":[";
    const double deflection = input.get<std::string>("kind") == "inspect"
        ? input.get<double>("deflection", 0.05) : 0.05;
    for (size_t i = 0; i < results.size(); i++) { if (i) output << ','; present(output, results[i], deflection); }
    timing.phase("presentation");
    output << ']';
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
            std::cout << "{\"error\":" << quoted(e.what());
            if (std::isfinite(e.allowance))
                std::cout << ",\"erosionAllowance\":" << std::setprecision(17) << e.allowance;
            std::cout << "}" << std::endl;
        } catch (const Standard_Failure& e) {
            const std::string detail = e.GetMessageString() ? e.GetMessageString() : "Geometry calculation failed";
            const auto message = detail.find("Courbes non jointives") != std::string::npos
                ? "The operation could not join the curves within tolerance." : detail;
            std::cerr << detail << std::endl;
            std::cout << "{\"error\":" << quoted(message) << "}" << std::endl;
        }
        catch (const std::exception& e) { std::cout << "{\"error\":" << quoted(e.what()) << "}" << std::endl; }
    }
    return 0;
}
