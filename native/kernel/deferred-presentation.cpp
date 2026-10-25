#include "deferred-presentation.h"
#include "presentation-mesh.h"
#include "timing.h"
#include <iomanip>
#include <optional>
#include <stdexcept>
#include <utility>

namespace {
struct Pending {
    std::vector<Result> results;
    std::string mode;
    std::vector<std::string> participants;
};
// Also survives separate WASM entry calls on the same calculator worker.
std::optional<Pending> pending;
void header(std::ostream& out, const Pending& value) {
    out << std::setprecision(17) << "{\"mode\":" << quoted(value.mode) << ",\"participants\":[";
    for (size_t i = 0; i < value.participants.size(); ++i) {
        if (i) out << ',';
        out << quoted(value.participants[i]);
    }
    out << "],\"tools\":[],\"results\":[";
}
}
void clearDeferredPresentation() { pending.reset(); }
void deferPresentation(std::ostream& out, std::vector<Result> results, const std::string& mode,
                       const std::vector<std::string>& participants) {
    Pending next{std::move(results), mode, participants};
    header(out, next);
    for (size_t i = 0; i < next.results.size(); ++i) {
        if (i) out << ',';
        presentVisual(out, next.results[i]);
    }
    out << "],\"presentation\":\"deferred\"}";
    pending = std::move(next);
}
void completePresentation(std::ostream& out) {
    auto value = std::exchange(pending, std::nullopt);
    if (!value) throw std::runtime_error("No preview presentation to complete");
    KernelTiming timing("complete-preview");
    header(out, *value);
    for (size_t i = 0; i < value->results.size(); ++i) {
        if (i) out << ',';
        presentMeshed(out, value->results[i]);
    }
    out << "]}";
}
