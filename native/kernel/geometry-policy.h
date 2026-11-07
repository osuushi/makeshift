#pragma once

// Numerical budgets have different dimensions and responsibilities. These are
// application checks, not replacements for OCCT's per-entity tolerances.
namespace geometry_policy {
// Modeling resolution for recoverable rounds/bevels, independent of BRep validity.
constexpr double minimumFinishMm = 0.001;
constexpr double minimumSolidVolumeMm3 = 1e-12;
constexpr double boundaryDistanceMm = 1e-6;
constexpr double offsetTopologyToleranceMm = 2e-6;
constexpr double generatedVertexAdjustmentMm = 0.001;
constexpr double parameterCorrespondenceMm = 1e-7;
constexpr double projectionBudgetMm = 0.001;
constexpr double projectionEndpointMm = projectionBudgetMm / 2;
constexpr double projectionFitMm = projectionBudgetMm / 2;
constexpr double cubicBooleanToleranceMm = 0.0001;
constexpr double projectionCollapsedLengthMm = 1e-7;
constexpr double edgeOnDirectionDot = 1e-12;
constexpr double fullCircleAngleRad = 1e-9;
// Printable relief at an otherwise nonmanifold tangent crescent; this is an
// intentional modeling adjustment, not an enlarged validation tolerance.
constexpr double crescentFilletMm = 0.01;
}
