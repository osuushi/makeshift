#include "erosion-field-planar.h"
#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>

namespace erosion::sections {
using namespace mesh_fit;
Frame::Frame(const Mesh& mesh,const V& direction) : axis(unit(direction)) {
    const V reference = std::abs(axis.X()) < 0.9 ? V(1,0,0) : V(0,1,0);
    x = unit(reference-axis*reference.Dot(axis));
    y = axis.Crossed(x);
    low = {1e100,1e100,1e100}; high = {-1e100,-1e100,-1e100};
    for (const auto& point : mesh.vertices) {
        const V projected(point.Dot(x),point.Dot(y),point.Dot(axis));
        for (int i = 1; i <= 3; ++i) {
            low.SetCoord(i,std::min(low.Coord(i),projected.Coord(i)));
            high.SetCoord(i,std::max(high.Coord(i),projected.Coord(i)));
        }
    }
}
void Budget::check() {
    if (++samples > 500000 || (samples%256 == 0 &&
        std::chrono::steady_clock::now()-start > std::chrono::seconds(20)))
        throw std::runtime_error("Erode section sampling exceeded its calculation budget");
}
namespace {
class Contour {
    const InteriorField& field;
    const Frame& frame;
    double depth;
    Budget& budget;
    std::vector<V> samples;
    std::vector<double> values;
    std::map<Edge,int> indices;
    std::vector<V> points;
    std::vector<std::vector<int>> neighbors;
    double value(const V& point) {
        budget.check();
        const double result = field.value(point,depth);
        if (!std::isfinite(result)) throw std::runtime_error("Invalid erosion distance sample");
        return result;
    }

    int crossing(int a,int b) {
        const auto key = edge(a,b);
        if (indices.contains(key)) return indices.at(key);
        double first = values[a], last = values[b], low = 0, high = 1, t = 0.5;
        for (int i = 0; i < 18; ++i) {
            t = std::clamp(low+(high-low)*first/(first-last),low+(high-low)*0.05,high-(high-low)*0.05);
            const double next = value(samples[a]+(samples[b]-samples[a])*t);
            if (std::abs(next) < 1e-8) break;
            if ((next > 0) == (first > 0)) { low = t; first = next; }
            else { high = t; last = next; }
        }
        const int index = int(points.size());
        points.push_back(samples[a]+(samples[b]-samples[a])*t);
        neighbors.emplace_back();
        indices[key] = index;
        return index;
    }
    void triangle(const std::array<int,3>& triangle) {
        std::vector<int> ends;
        for (int i = 0; i < 3; ++i) {
            const int first = triangle[i], last = triangle[(i+1)%3];
            if ((values[first] > 0) != (values[last] > 0)) ends.push_back(crossing(first,last));
        }
        if (ends.empty()) return;
        if (ends.size() != 2) throw std::runtime_error("Ambiguous erosion section");
        neighbors[ends[0]].push_back(ends[1]);
        neighbors[ends[1]].push_back(ends[0]);
    }
public:
    Contour(const InteriorField& field,const Frame& frame,double depth,Budget& budget) :
        field(field), frame(frame), depth(depth), budget(budget) {}
    void sample(double height,double spacing) {
        const double x = frame.low.X()-spacing*1.371, y = frame.low.Y()-spacing*1.371;
        const double width = std::ceil((frame.high.X()+spacing-x)/spacing)+1;
        const double heightCount = std::ceil((frame.high.Y()+spacing-y)/spacing)+1;
        if (!std::isfinite(width) || !std::isfinite(heightCount) || width <= 1 || heightCount <= 1 ||
            budget.samples >= 500000 || width*heightCount > 500000-budget.samples)
            throw std::runtime_error("Erode section exceeds sampling budget");
        const int nx = int(width), ny = int(heightCount);
        for (int j = 0; j < ny; ++j) for (int i = 0; i < nx; ++i) {
            const auto point = frame.point(x+i*spacing,y+j*spacing,height);
            samples.push_back(point);
            values.push_back(value(point));
        }
        for (int j = 0; j+1 < ny; ++j) for (int i = 0; i+1 < nx; ++i) {
            const int a = j*nx+i, b = a+1, c = a+nx, d = c+1;
            triangle({a,b,d}); triangle({a,d,c});
        }
    }
    Loops loops() const {
        if (points.empty()) throw std::runtime_error("Empty erosion section");
        std::vector<bool> visited(points.size());
        Loops result;
        for (size_t start = 0; start < points.size(); ++start) {
            if (visited[start]) continue;
            Loop loop;
            int current = int(start), previous = -1;
            do {
                if (neighbors[current].size() != 2 || visited[current])
                    throw std::runtime_error("Open erosion section");
                visited[current] = true;
                loop.push_back(points[current]);
                const auto& adjacent = neighbors[current];
                const int next = adjacent[0] == previous ? adjacent[1] : adjacent[0];
                previous = current; current = next;
            } while (current != int(start));
            if (loop.size() < 3) throw std::runtime_error("Collapsed erosion section");
            V normal;
            for (size_t i = 0; i < loop.size(); ++i)
                normal += (loop[i]-loop[0]).Crossed(loop[(i+1)%loop.size()]-loop[0]);
            if (normal.Dot(frame.axis) < 0) std::reverse(loop.begin(),loop.end());
            result.push_back(std::move(loop));
            if (result.size() > 16) throw std::runtime_error("Too many erosion section loops");
        }
        return result;
    }
};
}
Loops contour(const InteriorField& field,const Frame& frame,double height,double depth,double spacing,Budget& budget) {
    Contour result(field,frame,depth,budget);
    result.sample(height,spacing);
    return result.loops();
}
}
