// SPDX-License-Identifier: LGPL-2.1-or-later
#include "GCS.h"
#include <boost/property_tree/json_parser.hpp>
#include <array>
#include <cmath>
#include <deque>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <set>
#include <stdexcept>
#include <vector>

using Tree = boost::property_tree::ptree;

struct Calculation {
    std::vector<std::array<double, 2>> coordinates;
    std::vector<GCS::Point> points;
    std::vector<double> radii;
    std::set<size_t> fixed;
    std::set<size_t> fixedRadii;
    std::deque<double> constants;
    GCS::System system;

    explicit Calculation(const Tree& input) {
        for (const auto& entry : input.get_child("points")) {
            const double x = entry.second.get<double>("x");
            const double y = entry.second.get<double>("y");
            if (!std::isfinite(x) || !std::isfinite(y)) throw std::runtime_error("Invalid point");
            coordinates.push_back({x, y});
        }
        for (auto& value : coordinates) points.emplace_back(&value[0], &value[1]);
        for (const auto& entry : input.get_child("radii")) {
            const double radius = entry.second.get_value<double>();
            if (!std::isfinite(radius) || radius <= 0) throw std::runtime_error("Invalid radius");
            radii.push_back(radius);
        }
        if (const auto values = input.get_child_optional("fixed"))
            for (const auto& value : *values) fixed.insert(value.second.get_value<size_t>());
        if (const auto values = input.get_child_optional("fixedRadii"))
            for (const auto& value : *values) fixedRadii.insert(value.second.get_value<size_t>());
        int tag = 1;
        for (const auto& entry : input.get_child("constraints"))
            add(entry.second, entry.second.get<bool>("temporary", false) ? -1 : tag++);
    }
    GCS::Line line(const Tree& item, const char* key) {
        const auto index = item.get<size_t>(key);
        GCS::Line result;
        result.p1 = points.at(index);
        result.p2 = points.at(index + 1);
        return result;
    }
    bool addCurveRelation(const std::string& kind, const Tree& item, int tag) {
        if (kind == "tangent-normal") {
            addNormal(item, tag);
            return true;
        }
        if (kind == "tangent-circles") {
            system.addConstraintTangentCircumf(
                points.at(item.get<size_t>("a")), points.at(item.get<size_t>("b")),
                &radii.at(item.get<size_t>("radius")), &radii.at(item.get<size_t>("otherRadius")),
                item.get<bool>("internal"), tag);
            return true;
        }
        if (kind == "tangent-line") {
            auto edge = line(item, "a");
            GCS::Circle circle;
            circle.center = points.at(item.get<size_t>("b"));
            circle.rad = &radii.at(item.get<size_t>("radius"));
            system.addConstraintTangent(edge, circle, item.get<int>("side") > 0, tag);
            return true;
        }
        if (kind == "corner-angle") {
            auto first = line(item, "a"), second = line(item, "b");
            if (item.get<bool>("reverseA", false)) std::swap(first.p1, first.p2);
            if (item.get<bool>("reverseB", false)) std::swap(second.p1, second.p2);
            const double value = item.get<double>("value");
            if (!std::isfinite(value)) throw std::runtime_error("Invalid angle");
            constants.push_back(value);
            system.addConstraintL2LAngle(first, second, &constants.back(), tag);
            return true;
        }
        if (kind == "on-line") {
            auto edge = line(item, "b");
            system.addConstraintPointOnLine(points.at(item.get<size_t>("a")), edge, tag);
            return true;
        }
        if (kind == "on-circle") {
            GCS::Circle circle;
            circle.center = points.at(item.get<size_t>("b"));
            circle.rad = &radii.at(item.get<size_t>("radius"));
            system.addConstraintPointOnCircle(points.at(item.get<size_t>("a")), circle, tag);
            return true;
        }
        return false;
    }
    void add(const Tree& item, int tag) {
        const auto kind = item.get<std::string>("kind");
        if (addCurveRelation(kind, item, tag)) return;
        if (kind == "radius") {
            const double value = item.get<double>("value");
            if (!std::isfinite(value) || value <= 0) throw std::runtime_error("Invalid radius target");
            constants.push_back(value);
            GCS::Circle circle;
            circle.rad = &radii.at(item.get<size_t>("a"));
            system.addConstraintCircleRadius(circle, &constants.back(), tag);
            return;
        }
        if (kind == "horizontal" || kind == "vertical") {
            auto edge = line(item, "a");
            if (kind == "horizontal") system.addConstraintHorizontal(edge, tag);
            else system.addConstraintVertical(edge, tag);
            return;
        }
        auto& a = points.at(item.get<size_t>("a"));
        if (kind == "x" || kind == "y" || kind == "distance" || kind == "angle") {
            const double value = item.get<double>("value");
            if (!std::isfinite(value)) throw std::runtime_error("Invalid target");
            constants.push_back(value);
            auto* target = &constants.back();
            if (kind == "x") system.addConstraintCoordinateX(a, target, tag);
            else if (kind == "y") system.addConstraintCoordinateY(a, target, tag);
            else {
                auto& b = points.at(item.get<size_t>("b"));
                if (kind == "distance") system.addConstraintP2PDistance(a, b, target, tag);
                else system.addConstraintP2PAngle(a, b, target, tag);
            }
        } else if (kind == "coincident") {
            auto& b = points.at(item.get<size_t>("b"));
            system.addConstraintP2PCoincident(a, b, tag);
        } else {
            auto first = line(item, "a"), second = line(item, "b");
            if (kind == "parallel") system.addConstraintParallel(first, second, tag);
            else if (kind == "perpendicular") system.addConstraintPerpendicular(first, second, tag);
            else if (kind == "equal") system.addConstraintEqualLength(first, second, tag);
            else throw std::runtime_error("Unsupported constraint");
        }
    }
    void solve() {
        GCS::VEC_pD unknowns;
        for (size_t i = 0; i < coordinates.size(); ++i) {
            if (fixed.contains(i)) continue;
            auto& point = coordinates[i];
            unknowns.push_back(&point[0]);
            unknowns.push_back(&point[1]);
        }
        for (size_t i = 0; i < radii.size(); ++i)
            if (!fixedRadii.contains(i)) unknowns.push_back(&radii[i]);
        system.declareUnknowns(unknowns);
        system.initSolution(GCS::DogLeg);
        const int degrees = system.diagnose(GCS::DogLeg);
        GCS::VEC_I conflicting, redundant, partial;
        system.getConflicting(conflicting);
        system.getRedundant(redundant);
        system.getPartiallyRedundant(partial);
        if (degrees < 0 || !conflicting.empty() || !redundant.empty() || !partial.empty())
            throw std::runtime_error("Conflicting or redundant sketch constraints");
        const auto status = system.solve(GCS::DogLeg);
        if (status != GCS::SolveStatus::Success && status != GCS::SolveStatus::Converged)
            throw std::runtime_error("Sketch could not be solved");
        system.applySolution();
        for (const auto& point : coordinates)
            for (const double value : point)
                if (!std::isfinite(value)) throw std::runtime_error("Non-finite solver result");
    }
    void addNormal(const Tree& item, int tag) {
        GCS::Line a, b;
        a.p1 = points.at(item.get<size_t>("a")); a.p2 = points.at(item.get<size_t>("b"));
        b.p1 = points.at(item.get<size_t>("c")); b.p2 = points.at(item.get<size_t>("d"));
        if (item.get<bool>("parallel")) system.addConstraintParallel(a, b, tag);
        else system.addConstraintPerpendicular(a, b, tag);
    }
    void write() const {
        std::cout << "{\"points\":[";
        bool first = true;
        for (const auto& point : coordinates) {
            if (!first) std::cout << ',';
            first = false;
            std::cout << "{\"x\":" << point[0] << ",\"y\":" << point[1] << '}';
        }
        std::cout << "],\"radii\":[";
        first = true;
        for (const double radius : radii) {
            if (!first) std::cout << ',';
            first = false;
            std::cout << radius;
        }
        std::cout << "]}\n" << std::flush;
    }
};

int main() {
    std::cout << std::setprecision(17);
    std::string request;
    while (std::getline(std::cin, request)) {
        try {
            Tree input;
            std::istringstream stream(request);
            boost::property_tree::read_json(stream, input);
            Calculation calculation(input);
            calculation.solve();
            calculation.write();
        } catch (const std::exception& error) {
            Tree reply;
            reply.put("error", error.what());
            boost::property_tree::write_json(std::cout, reply, false);
            std::cout << '\n' << std::flush;
        }
    }
    return 0;
}
