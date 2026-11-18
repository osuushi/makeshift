#include "shape-measurements.h"
#include "kernel.h"
#include "measurement-cache.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <BinTools.hxx>
#include <OSD_ThreadPool.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <memory>
#include <sstream>

namespace {
Bnd_Box measureBounds(const TopoDS_Shape& shape) {
    Bnd_Box box;
    BRepBndLib::AddOptimal(shape, box, false, false);
    return box;
}
struct Measurements {
    std::optional<Bnd_Box> bounds;
    std::optional<GProp_GProps> surface;
};

using FaceCache = MeasurementCache<Measurements>;
FaceCache splines(512, 16 * 1024 * 1024);
std::shared_ptr<FaceCache::Entry> splineMeasurements(const TopoDS_Face& face) {
    const auto type = BRepAdaptor_Surface(face).GetType();
    if (type != GeomAbs_BSplineSurface && type != GeomAbs_BezierSurface) return nullptr;
    return splines.lookup(face);
}
Bnd_Box faceBounds(const TopoDS_Face& face) {
    const auto cached = splineMeasurements(face);
    if (cached && cached->value.bounds) return *cached->value.bounds;
    const auto box = measureBounds(face);
    if (cached) cached->value.bounds = box;
    return box;
}
struct MeasurementJob {
    TopoDS_Face source;
    std::shared_ptr<FaceCache::Entry> entry;
    Measurements result;
};
GProp_GProps measureSurface(const TopoDS_Face& face) {
    GProp_GProps properties;
    BRepGProp::SurfaceProperties(face, properties);
    return properties;
}
void finishMeasurements(std::vector<MeasurementJob>& jobs, Bnd_Box* bounds) {
    if (jobs.empty()) return;
    if (jobs.size() > 1) {
        OSD_ThreadPool::Launcher launcher(*OSD_ThreadPool::DefaultPool(), int(jobs.size()));
        launcher.Perform(0, int(jobs.size()), [&](int, int i) {
            auto& job = jobs[i];
            // Adjacent faces can share mutable OCCT representations. Each worker
            // reads its own exact binary geometry and never touches a live shape.
            try {
                std::istringstream stream(job.entry->key, std::ios::in | std::ios::binary);
                TopoDS_Shape local;
                BinTools::Read(local, stream);
                if (stream && !local.IsNull() && local.ShapeType() == TopAbs_FACE &&
                    measurementKey(local) == job.entry->key) {
                    if (bounds) job.result.bounds = measureBounds(local);
                    else job.result.surface = measureSurface(TopoDS::Face(local));
                }
            } catch (const Standard_Failure&) {}
        });
    }
    for (auto& job : jobs) {
        if (bounds) {
            if (!job.result.bounds) job.result.bounds = measureBounds(job.source);
            job.entry->value.bounds = job.result.bounds;
            bounds->Add(*job.result.bounds);
        } else {
            if (!job.result.surface) job.result.surface = measureSurface(job.source);
            job.entry->value.surface = job.result.surface;
        }
    }
    jobs.clear();
}

void measureFaces(const TopoDS_Shape& shape, Bnd_Box* box) {
    std::vector<MeasurementJob> pending;
    size_t pendingBytes = 0;
    const int workers = OSD_ThreadPool::DefaultPool()->NbThreads();
    for (TopExp_Explorer it(shape, TopAbs_FACE); it.More(); it.Next()) {
        const auto face = TopoDS::Face(it.Current());
        const auto entry = splineMeasurements(face);
        if (!entry) {
            if (box) box->Add(measureBounds(face));
        } else if (box && entry->value.bounds) box->Add(*entry->value.bounds);
        else if (!box && entry->value.surface) continue;
        else {
            // Bound the additional live keys even on a cold, heavily trimmed model.
            if (pendingBytes + entry->key.size() > 16 * 1024 * 1024) {
                finishMeasurements(pending, box);
                pendingBytes = 0;
            }
            pending.push_back({face, entry, {}});
            pendingBytes += entry->key.size();
            if (int(pending.size()) >= workers) {
                finishMeasurements(pending, box);
                pendingBytes = 0;
            }
        }
    }
    finishMeasurements(pending, box);
}

}

GProp_GProps measuredSurface(const TopoDS_Face& face) {
    const auto cached = splineMeasurements(face);
    if (cached && cached->value.surface) return *cached->value.surface;
    const auto properties = measureSurface(face);
    if (cached) cached->value.surface = properties;
    return properties;
}

Bnd_Box exactShapeBounds(const TopoDS_Shape& shape) {
    if (shape.ShapeType() == TopAbs_FACE) return faceBounds(TopoDS::Face(shape));
    // OCCT also includes loose edges and isolated vertices in shape bounds.
    if (TopExp_Explorer(shape, TopAbs_EDGE, TopAbs_FACE).More() ||
        TopExp_Explorer(shape, TopAbs_VERTEX, TopAbs_EDGE).More()) return measureBounds(shape);
    Bnd_Box box;
    measureFaces(shape, &box);
    return box;
}

void prepareSurfaceSignatures(const TopoDS_Shape& shape) {
    if (OSD_ThreadPool::DefaultPool()->HasThreads()) measureFaces(shape, nullptr);
}

std::array<double, 6> resultBounds(const Result& result) {
    if (result.exactBounds) return *result.exactBounds;
    std::array<double, 6> values;
    exactShapeBounds(result.shape).Get(values[0], values[1], values[2], values[3], values[4], values[5]);
    return values;
}
