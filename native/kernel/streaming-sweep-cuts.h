#pragma once
#include "boolean-probe.h"
#include <algorithm>
#include <exception>
#include <utility>

// Finish positive Subtract pairs immediately, retaining results rather than fillers.
// Geometric Cut failures are replayed after classification in final target order.
class StreamingSweepCuts {
    struct Pending {
        const Operand* body;
        TopoDS_Shape shape;
        std::vector<SourceEntity> origins;
        std::exception_ptr failure;
    };
    std::vector<Pending> pending;
public:
    void add(const Operand& body, const BooleanProbe& operation,
             const std::vector<SourceEntity>& toolOrigins) {
        Pending item{&body, {}, {}, {}};
        try {
            item.origins = body.entities;
            item.origins.insert(item.origins.end(), toolOrigins.begin(), toolOrigins.end());
            item.shape = operation.subtract(item.origins);
        } catch (...) {
            item.failure = std::current_exception();
        }
        pending.push_back(std::move(item));
    }
    bool append(std::vector<Result>& results, const Operand& body) const {
        const auto found = std::find_if(pending.begin(), pending.end(),
            [&](const Pending& item) { return item.body == &body; });
        if (found == pending.end()) return false;
        if (found->failure) std::rethrow_exception(found->failure);
        solids(results, found->shape, found->origins, {body.id});
        return true;
    }
};
