#include "revolved-profile.h"
#include "boolean-probe.h"
#include "edge-finish-validation.h"
#include "geometry-policy.h"
#include "timing.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <Bnd_Box.hxx>
#include <Precision.hxx>
#include <algorithm>
#include <stdexcept>

namespace {
using revolved_profile::Band;
constexpr double tolerance = Precision::Confusion();

void checkBoreSpan(const TopoDS_Edge& edge, const Band& band) {
    gp_Trsf local;
    local.SetTransformation(band.frame);
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(edge, local, true).Shape(), bounds, false, false);
    double lowX, lowY, lowZ, highX, highY, highZ;
    bounds.Get(lowX, lowY, lowZ, highX, highY, highZ);
    if (lowX <= tolerance || lowY < -tolerance || highY > band.height + tolerance ||
        lowZ < -tolerance || highZ > tolerance)
        throw std::runtime_error("Could not recover the bore profile between its end guides");
}

struct Section {
    TopoDS_Wire wire;
    std::vector<SourceEntity> edges;
};

Section boreSection(const Band& band) {
    BRepBuilderAPI_MakeWire wire;
    std::vector<SourceEntity> origins;
    const auto add = [&](const TopoDS_Edge& edge, const std::string& source = "") {
        wire.Add(edge);
        if (!wire.IsDone()) throw std::runtime_error("Could not close the recovered bore profile");
        if (!source.empty()) origins.push_back({source, wire.Edge()});
    };
    gp_Pnt start, end;
    const auto& spans = band.meridians;
    for (std::size_t i = 0; i < spans.size(); ++i) {
        const auto& span = spans[i];
        const auto& curve = span.curve;
        const auto a = curve->Value(curve->FirstParameter());
        const auto b = curve->Value(curve->LastParameter());
        if (i == 0) start = a;
        else if (a.Distance(end) > tolerance)
            throw std::runtime_error("Could not connect the recovered bore walls");
        end = b;
        const auto edge = BRepBuilderAPI_MakeEdge(curve).Edge();
        checkBoreSpan(edge, band);
        add(edge, span.face);
    }
    if (spans.empty() || start.Distance(end) <= tolerance)
        throw std::runtime_error("The profile needs two distinct ends");
    const auto radial = gp_Vec(band.frame.XDirection());
    const auto onGuide = [&](const gp_Pnt& p, double height) {
        return p.Distance(band.at(gp_Vec(band.frame.Location(), p).Dot(radial), height)) <= tolerance;
    };
    if (!onGuide(start, 0) || !onGuide(end, band.height))
        throw std::runtime_error("The profile must start and end on the end guides");
    add(BRepBuilderAPI_MakeEdge(end, band.at(0, band.height)).Edge());
    add(BRepBuilderAPI_MakeEdge(band.at(0, band.height), band.at(0, 0)).Edge());
    add(BRepBuilderAPI_MakeEdge(band.at(0, 0), start).Edge());
    return {wire.Wire(), origins};
}

TopoDS_Shape turnFace(const TopoDS_Face& profile, const gp_Ax1& axis,
                      const std::vector<SourceEntity>& edges, std::vector<SourceEntity>& origins) {
    validate(profile);
    BRepPrimAPI_MakeRevol sweep(profile, axis, true);
    if (!sweep.IsDone()) throw std::runtime_error("Could not revolve the edited profile");
    for (const auto& edge : edges)
        for (const auto& face : sweep.Generated(edge.shape))
            if (face.ShapeType() == TopAbs_FACE) origins.push_back({edge.id, face});
    return sweep.Shape();
}
TopoDS_Shape turnSection(const Section& section, const gp_Ax1& axis, std::vector<SourceEntity>& origins) {
    return turnFace(BRepBuilderAPI_MakeFace(section.wire, true).Face(), axis, section.edges, origins);
}

TopoDS_Shape recutBores(TopoDS_Shape stock, const Band& band, std::vector<SourceEntity>& origins) {
    for (const auto& bore : band.bores) {
        const auto cutterBand = revolved_profile::boreProfile(band.body, bore, stock);
        std::vector<SourceEntity> boreOrigins;
        const auto cutter = turnSection(boreSection(cutterBand), cutterBand.axis(), boreOrigins);
        const BooleanProbe overlap(stock, cutter);
        if (!revolved_profile::hasMaterial(overlap.shape(), geometry_policy::minimumSolidVolumeMm3)) continue;
        origins.insert(origins.end(), boreOrigins.begin(), boreOrigins.end());
        stock = overlap.subtract(origins);
    }
    return stock;
}
}

void revolved_profile::verifyBoreRecovery(const Band& band) {
    std::vector<SourceEntity> unused;
    const auto cutter = turnSection(boreSection(band), band.axis(), unused);
    unused.clear();
    const auto recovered = booleanShape(band.stock->shape, cutter, "subtract", unused);
    verifySameMaterial(band.body.shape, recovered, "The through-bore could not be recovered from its surrounding surfaces");
}

void revolved_profile::verifySectionRecovery(const Band& band, bool exactSupports) {
    KernelTiming timing("profile-section-recovery");
    std::vector<SourceEntity> unused;
    const auto stock = turnFace(recoveredSectionFace(band), band.axis(), {}, unused);
    timing.phase("revolve");
    const auto rebuilt = recutParallel(stock, band.parallelCuts, unused);
    timing.phase("recut");
    verifySectionMaterial(band.body.shape, rebuilt, exactSupports);
    timing.phase("compare");
}

std::vector<Result> replaceRevolvedProfile(const Tree& input, const std::vector<Operand>& bodies,
                                           std::vector<std::string>& participants) {
    const auto band = revolved_profile::inspect(input, bodies);
    std::vector<SourceEntity> edges;
    const auto profile = profileFace(input, bodies, &edges);
    for (const auto& edge : edges)
        if (std::ranges::find(band.meridians, edge.id, &revolved_profile::Meridian::face) ==
            band.meridians.end())
            throw std::runtime_error("Unknown profile face");
    std::vector<SourceEntity> origins;
    const auto revolved = turnFace(profile, band.axis(), edges, origins);
    TopoDS_Shape shape;
    if (band.stock) {
        origins.insert(origins.end(), band.stock->predecessors.begin(), band.stock->predecessors.end());
        shape = booleanShape(band.stock->shape, revolved, "subtract", origins);
    } else {
        shape = revolved_profile::trimDimples(revolved, band, origins);
        shape = recutBores(shape, band, origins);
        shape = revolved_profile::recutParallel(shape, band.parallelCuts, origins);
    }
    validate(shape);
    validateFinishManifold(shape);
    validateFinishIntersections(shape);
    std::vector<Result> results;
    solids(results, shape, origins, {band.body.id});
    if (results.size() != 1 || volume(results.front().shape) <= 0)
        throw std::runtime_error("The edited profile must enclose one solid");
    participants.push_back(band.body.id);
    return results;
}

void describeRevolvedProfile(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto band = revolved_profile::inspect(input, bodies, true);
    if (band.stock) revolved_profile::verifyBoreRecovery(band);
    Tree frame;
    out << "{\"profile\":{\"height\":" << band.height << ",\"endGuides\":"
        << (band.endGuides ? "true" : "false") << ",\"frame\":{";
    const auto coordinate = [&](const char* key, const gp_XYZ& xyz) {
        out << quoted(key) << ":[" << xyz.X() << ',' << xyz.Y() << ',' << xyz.Z() << ']';
        Tree values;
        for (double n : {xyz.X(), xyz.Y(), xyz.Z()}) {
            Tree value;
            value.put_value(n);
            values.push_back({"", value});
        }
        frame.add_child(key, values);
    };
    coordinate("origin", band.frame.Location().XYZ());
    out << ',';
    coordinate("u", band.frame.XDirection().XYZ());
    out << ',';
    coordinate("v", band.frame.YDirection().XYZ());
    out << "},\"spans\":[";
    for (std::size_t i = 0; i < band.meridians.size(); ++i) {
        if (i) out << ',';
        const auto& entry = band.meridians[i];
        out << "{\"face\":" << quoted(entry.face) << ",\"curves\":";
        const auto edge = entry.sectionEdge.IsNull() ? BRepBuilderAPI_MakeEdge(entry.curve).Edge() : entry.sectionEdge;
        planarSketchCurves(out, edge, frame);
        out << '}';
    }
    out << "]}}";
}
