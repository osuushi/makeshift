#pragma once
#include <BinTools.hxx>
#include <Standard_Failure.hxx>
#include <TopoDS_Shape.hxx>
#include <list>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>

// Exact geometry can be read, copied and meshed repeatedly. Binary BReps
// include placement, support, trims and tolerances, excluding display meshes.
// The serial calculator owns only measured values and their full keys.
inline std::string measurementKey(const TopoDS_Shape& shape) {
    std::ostringstream stream(std::ios::out | std::ios::binary);
    try {
        BinTools::Write(shape, stream, false, false, BinTools_FormatVersion_CURRENT);
    } catch (const Standard_Failure&) {
        return {};
    }
    return stream ? std::move(stream).str() : std::string{};
}

template<class Value> class MeasurementCache {
public:
    struct Entry {
        std::string key;
        Value value;
    };
    MeasurementCache(size_t capacity, size_t byteLimit) : capacity(capacity), byteLimit(byteLimit) {}
    std::shared_ptr<Entry> lookup(const TopoDS_Shape& shape) {
        auto key = measurementKey(shape);
        if (key.empty() || key.capacity() > byteLimit) return nullptr;
        if (const auto found = byGeometry.find(key); found != byGeometry.end()) {
            entries.splice(entries.begin(), entries, found->second);
            return entries.front();
        }
        while (entries.size() >= capacity || bytes + key.capacity() > byteLimit) {
            const auto& oldest = entries.back()->key;
            bytes -= oldest.capacity();
            byGeometry.erase(oldest);
            entries.pop_back();
        }
        auto entry = std::make_shared<Entry>();
        entry->key = std::move(key);
        bytes += entry->key.capacity();
        entries.push_front(entry);
        byGeometry.emplace(entry->key, entries.begin());
        return entry;
    }
private:
    using Entries = std::list<std::shared_ptr<Entry>>;
    Entries entries;
    std::unordered_map<std::string_view, typename Entries::iterator> byGeometry;
    const size_t capacity, byteLimit;
    size_t bytes = 0;
};
