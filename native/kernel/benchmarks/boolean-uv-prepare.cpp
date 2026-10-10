#include "boolean-uv.h"
#include "geometry-policy.h"
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepGProp.hxx>
#include <BRepLib.hxx>
#include <BRepTools.hxx>
#include <BOPAlgo_PaveFiller.hxx>
#include <BOPDS_DS.hxx>
#include <BOPDS_Iterator.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <gp_Pln.hxx>
#include <ShapeBuild_ReShape.hxx>
#include <ShapeUpgrade_FaceDivideArea.hxx>
#include <ShapeUpgrade_WireDivide.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <boost/property_tree/json_parser.hpp>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace {
class OriginalBoxes : public BOPAlgo_PaveFiller {
public:
    TopTools_MapOfShape collidingFaces(const boolean_uv::Pair& pair) {
        TopTools_ListOfShape arguments; arguments.Append(pair.outer); arguments.Append(pair.inner);
        SetArguments(arguments); SetNonDestructive(true); SetRunParallel(true);
        SetFuzzyValue(geometry_policy::cubicBooleanToleranceMm);
        Init(Message_ProgressRange());
        if (HasErrors()) throw std::runtime_error("Original box filtering failed");
        TopTools_MapOfShape faces;
        myIterator->Initialize(TopAbs_FACE,TopAbs_FACE);
        for (; myIterator->More(); myIterator->Next()) {
            int first,second; myIterator->Value(first,second);
            faces.Add(myDS->Shape(first)); faces.Add(myDS->Shape(second));
        }
        return faces;
    }
};
TopoDS_Shape decode(const std::string& hex) {
    if (hex.empty() || hex.size()%2) throw std::runtime_error("Invalid BRep encoding");
    const auto digit = [](char c) {
        if (c >= '0' && c <= '9') return c-'0';
        if (c >= 'a' && c <= 'f') return c-'a'+10;
        throw std::runtime_error("Invalid BRep digit");
    };
    std::string bytes; bytes.reserve(hex.size()/2);
    for (std::size_t i = 0; i < hex.size(); i += 2)
        bytes.push_back(char(16*digit(hex[i])+digit(hex[i+1])));
    std::istringstream stream(bytes);
    TopoDS_Shape shape; BRep_Builder builder;
    BRepTools::Read(shape, stream, builder);
    if (shape.IsNull() || !BRepCheck_Analyzer(shape).IsValid())
        throw std::runtime_error("Invalid captured body");
    return shape;
}
TopoDS_Shape subdivide(const TopoDS_Shape& shape, int u, int v,
                      const TopTools_MapOfShape& colliding) {
    if (u == 1 && v == 1) return shape;
    // Exact OCCT UV interval subdivision; no upstream implementation is copied.
    BRepBuilderAPI_Copy copy(shape, true, false);
    Handle(ShapeBuild_ReShape) context = new ShapeBuild_ReShape;
    for (TopExp_Explorer f(shape,TopAbs_FACE); f.More(); f.Next()) {
        if (!colliding.Contains(f.Current())) continue;
        const auto face = TopoDS::Face(copy.ModifiedShape(f.Current()).Oriented(TopAbs_FORWARD));
        ShapeUpgrade_FaceDivideArea split(face);
        split.SetContext(context);
        split.MaxArea() = -1; split.NbParts() = u*v;
        split.SetSplittingByNumber(true); split.SetNumbersUVSplits(u,v);
        split.SetPrecision(1e-7); split.SetMinTolerance(1e-7);
        split.SetMaxTolerance(boolean_uv::maximumTolerance(shape));
        split.GetWireDivideTool()->SetMinTolerance(1e-7);
        split.Perform();
        if (split.Status(ShapeExtend_FAIL)) throw std::runtime_error("UV subdivision failed");
        if (split.Status(ShapeExtend_DONE)) context->Replace(face,split.Result());
    }
    const auto result = context->Apply(copy.Shape());
    // The divider leaves new edges with SameRange/SameParameter flags unset.
    // Include parameter consistency in preparation cost and report tolerance growth.
    BRepLib::SameParameter(result, 1e-7, true);
    return result;
}
std::array<double,6> bounds(const TopoDS_Shape& shape) {
    Bnd_Box box; BRepBndLib::AddOptimal(shape,box,false,false);
    std::array<double,6> result;
    box.Get(result[0],result[1],result[2],result[3],result[4],result[5]);
    return result;
}
void matchingVolume(const TopoDS_Shape& shape, double expected) {
    const double actual = boolean_uv::volume(shape);
    if (std::abs(actual-expected) > 1e-8*std::max(1.0,std::abs(expected)))
        throw std::runtime_error("Subdivision/cut changed volume");
}
}

boolean_uv::Pair boolean_uv::readFixture(const std::string& path) {
    boost::property_tree::ptree fixture;
    boost::property_tree::read_json(path,fixture);
    const auto& operation = fixture.get_child("snapshot.lastEdit.operation");
    if (operation.get<std::string>("mode") != "subtract" ||
        operation.get_child("ids").size() != 2)
        throw std::runtime_error("Benchmark requires a captured two-body subtraction");
    std::vector<TopoDS_Shape> ordered;
    for (const auto& id : operation.get_child("ids")) {
        bool found = false;
        for (const auto& body : fixture.get_child("snapshot.document.bodies")) {
            if (body.second.get<std::string>("id") != id.second.get_value<std::string>()) continue;
            ordered.push_back(decode(body.second.get<std::string>("brep")));
            found = true; break;
        }
        if (!found) throw std::runtime_error("Captured operand is missing");
    }
    return {ordered[0],ordered[1]};
}
double boolean_uv::maximumTolerance(const TopoDS_Shape& shape) {
    double result = 1e-7;
    for (TopExp_Explorer e(shape,TopAbs_FACE); e.More(); e.Next())
        result = std::max(result,BRep_Tool::Tolerance(TopoDS::Face(e.Current())));
    for (TopExp_Explorer e(shape,TopAbs_EDGE); e.More(); e.Next())
        result = std::max(result,BRep_Tool::Tolerance(TopoDS::Edge(e.Current())));
    for (TopExp_Explorer e(shape,TopAbs_VERTEX); e.More(); e.Next())
        result = std::max(result,BRep_Tool::Tolerance(TopoDS::Vertex(e.Current())));
    return result;
}
boolean_uv::Prepared boolean_uv::prepare(const Pair& source, const Variant& variant) {
    const auto start = std::chrono::steady_clock::now();
    TopTools_MapOfShape colliding;
    if (variant.outerU*variant.outerV*variant.innerU*variant.innerV > 1) {
        OriginalBoxes boxes; colliding = boxes.collidingFaces(source);
    }
    Pair result{subdivide(source.outer,variant.outerU,variant.outerV,colliding),
                subdivide(source.inner,variant.innerU,variant.innerV,colliding)};
    if (!BRepCheck_Analyzer(result.outer).IsValid() || !BRepCheck_Analyzer(result.inner).IsValid())
        throw std::runtime_error("Invalid subdivided operands");
    const double outer = maximumTolerance(result.outer), inner = maximumTolerance(result.inner);
    const bool preserved = outer <= maximumTolerance(source.outer)*(1+1e-6) &&
                           inner <= maximumTolerance(source.inner)*(1+1e-6);
    const double ms = std::chrono::duration<double,std::milli>(
        std::chrono::steady_clock::now()-start).count();
    return {result,ms,std::max(outer,inner),preserved};
}
int boolean_uv::count(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
    TopTools_IndexedMapOfShape shapes; TopExp::MapShapes(shape,type,shapes);
    return shapes.Extent();
}
double boolean_uv::volume(const TopoDS_Shape& shape) {
    const auto box = bounds(shape);
    int axis = 0;
    for (int i = 1; i < 3; ++i) if (box[i+3]-box[i] < box[axis+3]-box[axis]) axis = i;
    gp_Pnt origin(box[0],box[1],box[2]); origin.SetCoord(axis+1,box[axis]-1);
    GProp_GProps properties;
    const double error = BRepGProp::VolumePropertiesGK(shape,properties,
        gp_Pln(origin,gp_Dir(axis == 0,axis == 1,axis == 2)),1e-10,false,true);
    if (!std::isfinite(error) || error < 0 || !std::isfinite(properties.Mass()))
        throw std::runtime_error("Benchmark volume integration failed");
    return std::abs(properties.Mass());
}
std::vector<boolean_uv::Probe> boolean_uv::probes(const Pair& pair) {
    const auto box = bounds(pair.outer);
    BRepClass3d_SolidClassifier outer(pair.outer), inner(pair.inner);
    std::vector<Probe> result;
    // Offset grid avoids intentionally landing on symmetry/seam planes.
    for (int x = 0; x < 9; ++x) for (int y = 0; y < 5; ++y) for (int z = 0; z < 5; ++z) {
        const gp_Pnt p(box[0]+(x+0.43)/9*(box[3]-box[0]),
                       box[1]+(y+0.37)/5*(box[4]-box[1]),
                       box[2]+(z+0.41)/5*(box[5]-box[2]));
        outer.Perform(p,geometry_policy::boundaryDistanceMm);
        inner.Perform(p,geometry_policy::boundaryDistanceMm);
        if (outer.State() == TopAbs_ON || inner.State() == TopAbs_ON) continue;
        if (inner.State() == TopAbs_IN && outer.State() != TopAbs_IN)
            throw std::runtime_error("Fixture is not a contained cavity case");
        result.push_back({p,outer.State() == TopAbs_IN && inner.State() == TopAbs_OUT});
    }
    return result;
}
void boolean_uv::verify(const Pair& original, const Pair& split, const TopoDS_Shape& result,
                       const std::array<double,2>& volumes, const std::vector<Probe>& samples) {
    if (count(result,TopAbs_SOLID) != 1) throw std::runtime_error("Expected one cavity solid");
    if (!split.outer.IsSame(original.outer)) matchingVolume(split.outer,volumes[0]);
    if (!split.inner.IsSame(original.inner)) matchingVolume(split.inner,volumes[1]);
    matchingVolume(result,volumes[0]-volumes[1]);
    BRepClass3d_SolidClassifier classifier(result);
    for (const auto& sample : samples) {
        classifier.Perform(sample.point,geometry_policy::boundaryDistanceMm);
        if (classifier.State() != (sample.material ? TopAbs_IN : TopAbs_OUT))
            throw std::runtime_error("Cavity material probe disagrees with original operands");
    }
}
