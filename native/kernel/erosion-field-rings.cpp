#include "erosion-field-planar.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace erosion::sections {
using namespace mesh_fit;
namespace {
V center(const Loop& loop) {
    V result;
    for (const auto& point : loop) result += point/double(loop.size());
    return result;
}
double area(const Loop& loop,const V& axis) {
    V sum;
    for (size_t i = 0; i < loop.size(); ++i)
        sum += (loop[i]-loop[0]).Crossed(loop[(i+1)%loop.size()]-loop[0]);
    return std::abs(sum.Dot(axis));
}
bool inside(const Loop& loop,const V& point,const V& axis) {
    double angle = 0;
    for (size_t i = 0; i < loop.size(); ++i) {
        const auto a = loop[i]-point, b = loop[(i+1)%loop.size()]-point;
        angle += std::atan2(a.Crossed(b).Dot(axis),a.Dot(b));
    }
    return std::abs(angle) > M_PI;
}
}
void order(Loops& loops,const Loops& previous,const V& axis) {
    std::sort(loops.begin(),loops.end(),[&](const auto& a,const auto& b) { return area(a,axis)>area(b,axis); });
    for (size_t i = 1; i < loops.size(); ++i) {
        if (!inside(loops[0],loops[i][0],axis))
            throw std::runtime_error("Erosion section has separate outer regions");
        for (size_t j = 1; j < i; ++j)
            if (inside(loops[j],loops[i][0],axis) || inside(loops[i],loops[j][0],axis))
                throw std::runtime_error("Erosion section has nested islands");
    }
    if (previous.empty()) return;
    if (loops.size() != previous.size()) throw std::runtime_error("Erosion section topology changes along this axis");
    // These are temporary contour correspondences, not persistent topology IDs.
    for (size_t i = 1; i < loops.size(); ++i) {
        const auto target = center(previous[i]);
        const auto best = std::min_element(loops.begin()+i,loops.end(),[&](const auto& a,const auto& b) {
            return (center(a)-target).SquareModulus() < (center(b)-target).SquareModulus();
        });
        std::iter_swap(loops.begin()+i,best);
    }
}
Loop controls(const Loop& polygon,const Loop& prior,int count) {
    std::vector<double> cumulative{0};
    for (size_t i = 0; i < polygon.size(); ++i)
        cumulative.push_back(cumulative.back()+length(polygon[(i+1)%polygon.size()]-polygon[i]));
    if (cumulative.back() < 1e-8) throw std::runtime_error("Collapsed erosion ring");
    const auto sample = [&](double distance) {
        distance = std::fmod(distance+cumulative.back()*2,cumulative.back());
        const auto it = std::upper_bound(cumulative.begin(),cumulative.end(),distance);
        const auto index = std::min(polygon.size()-1,size_t(it-cumulative.begin()-1));
        const double fraction = (distance-cumulative[index])/(cumulative[index+1]-cumulative[index]);
        return polygon[index]+(polygon[(index+1)%polygon.size()]-polygon[index])*fraction;
    };
    double phase = 0;
    if (!prior.empty()) {
        double cost = 1e100;
        const auto evaluate = [&](double candidate) {
            double next = 0;
            for (int i = 0; i < count; ++i) {
                const auto target = (prior[(i+count-1)%count]+prior[i]*4+prior[(i+1)%count])/6;
                next += (target-sample(cumulative.back()*i/count+candidate)).SquareModulus();
            }
            if (next < cost) { cost = next; phase = candidate; }
        };
        for (int shift = 0; shift < count; ++shift) evaluate(cumulative.back()*shift/count);
        for (double step = cumulative.back()/count/2; step > 1e-5; step /= 2) {
            const double current = phase;
            evaluate(current-step); evaluate(current+step);
        }
    }
    Loop samples;
    const auto origin = polygon[0];
    for (int i = 0; i < count; ++i) samples.push_back(sample(cumulative.back()*i/count+phase)-origin);
    auto result = samples;
    // Solve the cyclic cubic collocation system; using samples as poles would
    // smooth across concave corners instead of interpolating the contour.
    for (int iteration = 0; iteration < 48; ++iteration) {
        auto next = result;
        for (int i = 0; i < count; ++i)
            next[i] = samples[i]*1.5-(result[(i+count-1)%count]+result[(i+1)%count])*0.25;
        result = std::move(next);
    }
    for (auto& point : result) point += origin;
    return result;
}
}
