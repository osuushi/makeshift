#pragma once
#include "kernel.h"
#include <TopTools_ShapeMapHasher.hxx>
#include <set>
#include <unordered_map>

// Sewing and Boolean history can list the same predecessor more than once.
// Preserve the sorted unique IDs for each placed topology member.
class PresentationOrigins {
    std::unordered_map<TopoDS_Shape, std::set<std::string>, TopTools_ShapeMapHasher,
                       TopTools_ShapeMapHasher> byShape;
public:
    explicit PresentationOrigins(const Result& result) {
        byShape.reserve(result.predecessors.size());
        for (const auto& source : result.predecessors) byShape[source.shape].insert(source.id);
    }
    void write(std::ostream& out, const TopoDS_Shape& shape) const {
        out << '[';
        const auto found = byShape.find(shape);
        if (found != byShape.end()) {
            bool comma = false;
            for (const auto& id : found->second) {
                if (comma) out << ',';
                out << quoted(id);
                comma = true;
            }
        }
        out << ']';
    }
};
