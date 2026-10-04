#include "mesh-fit.h"
#include "mesh-fit-analytic.h"
#include <algorithm>
#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <iostream>

namespace mesh_fit {
Fitted fitSurface(Input input,bool deviations,bool approximate) {
    const bool automatic = input.layout.quads.empty();
    if (input.layout.quads.empty()) {
        if (const auto result = analytic::reconstruct(input)) {
            return {result->shape,result->stats,result->planes+result->cylinders+result->spheres,0,
                    std::array<int,3>{result->planes,result->cylinders,result->spheres},
                    deviations ? result->vertexErrors : std::vector<double>{}};
        }
        input.layout = automaticLayout(input.target,input.maxPatches);
        std::vector<std::vector<int>> faces;
        for (const auto& f : input.layout.quads) faces.emplace_back(f.begin(),f.end());
        if (topology(input.layout.vertices,faces,"Automatic quad layout") != 2)
            throw std::runtime_error("Automatic quad layout changed mesh topology");
    }
    // With no declared creases, a coarse triangle's steep normal change is curvature,
    // not a request for a sharp feature (especially around thin, rounded rims).
    Search target(input.target,input.layout.creases.empty());
    auto network = initialize(input.layout,target);
    Statistics stats;
    std::optional<Fitted> best;
    while (true) {
        if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "mesh-fit: " << network.patches.size() << " patches\n";
        const auto seed = network;
        for (int pass = 0; pass < 3; ++pass) {
            fit(network,seed,input.target,target,12);
            stats = assess(network,input.target,target);
            if (stats.oriented && std::max(stats.forward,stats.reverse) <= input.tolerance && stats.normalAngle <= input.smoothAngle) break;
        }
        if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "mesh-fit deviation "
            << std::max(stats.forward,stats.reverse)*input.scale << ", seam " << stats.normalAngle << "\n";

        if (approximate && stats.oriented && (!best || std::max(stats.forward,stats.reverse) < std::max(best->stats.forward,best->stats.reverse))) {
            try { best = Fitted{assemble(network,input),stats,int(network.patches.size()),int(network.controls.size()),{}, {}}; }
            catch (const Standard_Failure&) {}
            catch (const std::runtime_error&) {}
        }
        if (stats.oriented && std::max(stats.forward,stats.reverse) <= input.tolerance && stats.normalAngle <= input.smoothAngle) {
            if (!approximate) break;
            if (best) return *best;
        }
        if (network.patches.size()*4 > size_t(input.maxPatches)) {
            if (approximate) {
                if (best) return *best;
                throw std::runtime_error("Remesh could not construct a valid surface within the CAD face budget. Try more faces, finer mesh detail or Analytic.");
            }
            std::ostringstream message;

            message << "Mesh fit exceeds requested tolerance within patch budget: sampled deviation "
                << std::max(stats.forward,stats.reverse)*input.scale << " mm; smooth seam angle "
                << stats.normalAngle << " degrees" << (stats.oriented ? "" : "; surface faces away from the target")
                << (!automatic
                    ? ". Increase the budget/tolerance or revise the quad layout."
                    : ". Try a different accuracy or patch budget; some meshes cannot be reconstructed.");
            throw std::runtime_error(message.str());
        }
        network = refine(network);
    }
    Fitted result{assemble(network,input),stats,int(network.patches.size()),int(network.controls.size()),{}, {}};
    if (deviations) {
        SurfaceSearch surface(network,12);
        for (const auto& point : input.target.vertices)
            result.vertexErrors.push_back(length(point-surface.closest(point).value.point)*input.scale);
    }
    return result;
}
void reconstruct(std::ostream& out,const Tree& tree) {
    const auto input = read(tree);
    const bool automatic = !tree.get_child_optional("layout");
    const auto result = fitSurface(input,automatic);
    const auto& stats = result.stats;
    out << std::setprecision(17) << "{\"mode\":\"new\",\"participants\":[],\"results\":[";
    present(out,{result.shape,{},{}});
    out << "],\"fit\":{\"patches\":" << result.patches
        << ",\"controlPoints\":" << result.controlPoints;
    if (result.analyticFaces) {
        const auto& faces = *result.analyticFaces;
        out << ",\"analyticFaces\":{\"planes\":" << faces[0] << ",\"cylinders\":" << faces[1]
            << ",\"spheres\":" << faces[2] << '}';
    }
    out << ",\"sampledSurfaceToMesh\":" << stats.forward*input.scale
        << ",\"sampledMeshToSurface\":" << stats.reverse*input.scale
        << ",\"sampledRms\":" << stats.rms*input.scale
        << ",\"sampledSeamAngle\":" << stats.normalAngle
        << ",\"samples\":" << stats.samples;
    if (automatic) {
        out << ",\"vertexErrors\":[";
        for (size_t i = 0; i < result.vertexErrors.size(); ++i) {
            if (i) out << ',';
            out << result.vertexErrors[i];
        }
        out << ']';
    }
    out << "}}";
}
}
