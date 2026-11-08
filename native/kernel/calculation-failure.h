#pragma once
#include <stdexcept>
#include <string>

// Only known geometry failures may request a smaller-size probe in the application.
class CalculationFailure : public std::runtime_error {
public:
    const char* code;
    CalculationFailure(const char* category, const std::string& message)
        : std::runtime_error(message), code(category) {}
};
class GeometricFailure : public CalculationFailure {
public:
    explicit GeometricFailure(const std::string& message)
        : CalculationFailure("geometric-infeasibility", message) {}
};
class InvalidGeometryFailure : public CalculationFailure {
public:
    explicit InvalidGeometryFailure(const std::string& message)
        : CalculationFailure("invalid-geometry", message) {}
};
