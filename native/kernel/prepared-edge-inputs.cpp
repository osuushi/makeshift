#include "prepared-edge-inputs.h"
#include "edge-finish-conditioning.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <boost/property_tree/json_parser.hpp>
#include <deque>
#include <set>
#include <sstream>
#include <stdexcept>

namespace {
struct Prepared { std::string key; Operand body; };
// Exact BRep and ordered topology identities/signatures are part of the key.
// The calculator owns this disposable cache, never the accepted document or ID allocation.
std::deque<Prepared> cache;
size_t bytes = 0;
constexpr size_t maxEntries = 8, maxBytes = 32 * 1024 * 1024;

Operand isolated(const Operand& source) {
    // OCCT builders/meshing may modify shared TShapes and geometry. Never lend
    // the cached source to an operation, including the first calculation.
    BRepBuilderAPI_Copy copy(source.shape, true, false);
    if (!copy.IsDone()) throw std::runtime_error("Cannot copy prepared edge input");
    Operand result{source.id, copy.Shape(), {}};
    for (const auto& entity : source.entities)
        result.entities.push_back({entity.id, copy.ModifiedShape(entity.shape)});
    return result;
}

Operand prepare(const Tree& value) {
    std::ostringstream encoded;
    boost::property_tree::write_json(encoded, value, false);
    auto key = encoded.str();
    for (auto it = cache.begin(); it != cache.end(); ++it) {
        if (it->key != key) continue;
        auto entry = std::move(*it);
        cache.erase(it);
        cache.push_back(std::move(entry));
        return isolated(cache.back().body);
    }
    Tree input, bodies;
    bodies.push_back({"", value});
    input.add_child("bodies", bodies);
    auto body = conditionEdgeFinish(operands(input).front());
    auto result = isolated(body);
    if (key.size() <= maxBytes) {
        while (!cache.empty() && (cache.size() >= maxEntries || bytes + key.size() > maxBytes)) {
            bytes -= cache.front().key.size();
            cache.pop_front();
        }
        bytes += key.size();
        cache.push_back({std::move(key), std::move(body)});
    }
    return result;
}
}

std::vector<Operand> preparedEdgeOperands(const Tree& input) {
    std::set<std::string> involved;
    for (const auto& item : input.get_child("edges"))
        involved.insert(item.second.get<std::string>("body"));
    std::vector<Operand> result;
    if (const auto bodies = input.get_child_optional("bodies"))
        for (const auto& item : *bodies)
            if (involved.count(item.second.get<std::string>("id")))
                result.push_back(prepare(item.second));
    return result;
}
