#include "erosion-field-grid.h"
#include <cmath>
#include <map>
#include <stdexcept>

namespace erosion {
namespace {
using Index = std::array<int,3>;
class Sampler {
    const mesh_fit::V& origin;
    double spacing;
    const std::function<double(const mesh_fit::V&)>& field;
    std::chrono::steady_clock::time_point start;
    std::map<Index,int> indices;
    int sample(const Index& point) {
        if (const auto found = indices.find(point); found != indices.end()) return found->second;
        if (grid.points.size() >= 300000) throw std::runtime_error("Erode distance field exceeds sampling budget");
        if (grid.points.size()%256 == 0 && std::chrono::steady_clock::now()-start > std::chrono::seconds(12))
            throw std::runtime_error("Erode distance field exceeded its calculation budget");
        const auto p = origin+mesh_fit::V(point[0],point[1],point[2])*(spacing/2);
        const double value = field(p);
        if (!std::isfinite(value)) throw std::runtime_error("Invalid erosion distance sample");
        const int result = int(grid.points.size());
        indices.emplace(point,result);
        grid.points.push_back(p); grid.values.push_back(value);
        return result;
    }
public:
    FieldGrid grid;
    Sampler(const mesh_fit::V& origin,double spacing,const std::function<double(const mesh_fit::V&)>& field,
            std::chrono::steady_clock::time_point start) : origin(origin),spacing(spacing),field(field),start(start) {}
    void block(const Index& low,const Index& high) {
        Index midpoint;
        mesh_fit::V diagonal;
        bool leaf = true;
        for (int i = 0; i < 3; ++i) {
            midpoint[i] = low[i]+high[i];
            diagonal.SetCoord(i+1,high[i]-low[i]);
            leaf &= high[i]-low[i] == 1;
        }
        const double value = grid.values[sample(midpoint)];
        // A signed distance changes by at most the distance traveled. The sphere
        // enclosing this block therefore excludes a crossing without dropping a
        // small disconnected interior merely because its corners are exterior.
        if (std::abs(value) > diagonal.Modulus()*spacing/2+1e-10) return;
        if (leaf) {
            std::array<int,8> corners;
            for (int c = 0; c < 8; ++c) {
                Index point;
                for (int i = 0; i < 3; ++i) point[i] = 2*((c&(1<<i)) ? high[i] : low[i]);
                corners[c] = sample(point);
            }
            grid.cells.push_back(corners);
            return;
        }
        Index split;
        for (int i = 0; i < 3; ++i) split[i] = (low[i]+high[i])/2;
        for (int c = 0; c < 8; ++c) {
            Index a,b;
            bool empty = false;
            for (int i = 0; i < 3; ++i) {
                a[i] = (c&(1<<i)) ? split[i] : low[i];
                b[i] = (c&(1<<i)) ? high[i] : split[i];
                empty |= a[i] == b[i];
            }
            if (!empty) block(a,b);
        }
    }
};
}
FieldGrid sampleDistanceGrid(const mesh_fit::V& low,const std::array<int,3>& count,double spacing,
    const std::function<double(const mesh_fit::V&)>& field,std::chrono::steady_clock::time_point start) {
    Sampler sampler(low,spacing,field,start);
    sampler.block({0,0,0},{count[0]-1,count[1]-1,count[2]-1});
    return std::move(sampler.grid);
}
}
