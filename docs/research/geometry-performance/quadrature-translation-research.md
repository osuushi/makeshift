# Reference-plane translation and structural zeros

Source-only follow-up, 2026-10-08; no builds or geometry runs by this worker.
Companion to quadrature-research.md. OCCT source pin:
`a016080bf6738d6aeae020badee4e888ad1540a5`. All suggested changes remain experiments.

## A discriminating plane-sign test

Closed-solid volume cannot isolate a reference-plane sign convention: exact
divergence flux is independent of translation of the reference. An open rectangular
planar face can. For an oriented +Z face at height h, area A, plane origin z=q:

- Geometric signed plane distance produces face flux A(h-q).
- The literal pinned source algebra produces A(h+q).

VinertGK plane Perform sets coefficient D to D minus n dot location. UFunction
then computes n dot (P-location) minus that coefficient. Because gp_Pln uses
D=-n dot planeOrigin, location cancels and the resulting factor is n dot
(P+planeOrigin). This source observation does not rely on numerical profiling.

The new standalone `tests/geometry-performance/quadrature-primitives.cpp` prints
both predictions alongside actual face flux. Its 3-by-5 patch has h=Tz+4 and
q=Tz+2, repeated for q and -q. At Tz=0, predicted fluxes are 30 versus 90;
at Tz=123, they are 30 versus 3780. The test uses no approximation, no tolerance
relaxation and no modified kernel. Open-face properties are a diagnostic of the
implemented flux, not an assertion about valid solid volume.

## Located analytical solid experiment

The same harness compares ordinary adaptive and GK mass against independent
formulas for a 12x7x5 box (420), a 12x7x1e-4 thin box (0.0084), radius-3 height-5
cylinder (45*pi) and radius-3 sphere (36*pi). It uses original local shapes with
TopLoc translations [0,0,0], [1234,-4567,123] and [1e6,-2e6,3e6]. Local geometry
and dimensions remain unchanged; constructing a fresh thin box directly at huge
world coordinates could bake endpoint rounding into the input geometry and
confound integration errors with a changed represented dimension.

For every axis, test supplied low-minus-one, its mirrored coordinate, and zero,
with either normal sign. Default eps remains 1e-10, span integration true and
mass-only flags false/false. Output includes actual and analytical mass, actual
relative error, kernel estimate, requested eps, plane coordinate and single-call
timings. CLI allows a primitive filter, sample count and stricter eps reruns.
Analytical errors are observations; the harness does not return failure just
because a baseline error estimate proved optimistic. Kernel exceptions/invalid
BReps are failures. Run only under the orchestrator's compute lock.

Recommended main sequence: patch-only once to discriminate convention; analytic
box/cylinder once at all translations/planes; thin-box separately; then repeated
randomized/interleaved timing experiments only for pathological combinations.
Changing normal sign should leave the by-plane mass integrand mathematically
unchanged since both normal projection and signed-distance factors change sign.
Any sign sensitivity reveals floating/implementation differences rather than
a new intended material definition.

## Why translation can amplify cancellation

For a box of height H, projected area A, bottom T and supplied plane origin T-1,
the literal Z-plane face contributions are -A(2T-1) and A(2T+H-1), summing to AH.
For large positive T, the sum of absolute terms divided by volume is approximately
4T/H. With H=5 and T=3e6 this is approximately 2.4e6. A relative tolerance on each
large signed term can therefore permit a much larger relative error in the final
small difference. Mirroring the supplied plane coordinate makes the implemented
reference sit near the actual solid, reducing this conditioning effect.

Even correcting reference sign does not fix local small-integral relative tests:
zero projected side flux can still demand excessive refinement if D1 introduces
tiny roundoff. Whole-solid summation, per-face cancellation and inner-integral
cancellation are different conditioning layers. Global accuracy needs an absolute
error accounting scheme, not a per-local relative test with an unqualified
machine-epsilon switch. Existing Gauss/Kronrod discrepancies are estimates, not
certified error bounds; do not claim certification from apparent convergence.

## Conservative mathematical structural-zero certificates

Target only by-plane mass, for which the integrand contains
`(Du cross Dv) dot n`. These certificates establish zero projected Jacobian
of the represented surface, not agreement with every floating-point baseline
evaluation. Skipping a mathematically zero term may intentionally remove existing
D1 roundoff, so bitwise equality is not its correctness criterion.

1. **Analytic cylinder, extrusion axis parallel to n.** Every axial tangent is
   parallel to n, so the projected Jacobian is zero on the entire support.
   A cone is not eligible: changing radius along its axis contributes axial flux.
2. **Geom_SurfaceOfLinearExtrusion direction parallel to n.** Applies to arbitrary
   regular basis curves, including rational curves. The geometric surface is
   translationally invariant along n. Require well-defined input support; bypassing
   a solver failure on a singular/invalid surface would change rejection semantics.
3. **Analytic plane with support normal perpendicular to n.** This is exact
   incidence of represented directions. A tolerance-based small dot product is
   insufficient. For axis planes, exact component zeros are straightforward;
   generic directions need an exact algebraic dot predicate on stored numbers.
4. **Axis-aligned spline projection with a constant transverse coordinate.**
   If n=Z and all Euclidean poles have exactly the same X (or Y), then that
   rational coordinate is constant for any strictly positive weights; the two
   projected tangents are rank-deficient. This does not need equal weights.
   The same statement applies to Bezier surfaces and any whole-support knot span.
5. **Spline projected coordinates independent of one parameter.** For n=Z,
   each U pole column must have identical X/Y across V and identical positive
   weights across V. Partition of unity makes projected X/Y ratios depend only
   on U, so projected derivative in V is zero. Axial Z poles may vary arbitrarily.
   The symmetric U/V case also works. Rational weights with an exactly verified
   separable rank-one factorization generalize this, but floating ratio comparisons
   are not an exact factorization certificate. Start with literal equal weights.

Certificates on the full support automatically cover trims; arbitrary trimmed
domains do not create flux when the integrand is zero everywhere. Strip a
rectangular trimmed-surface wrapper only to inspect its unchanged basis. Face
orientation changes zero's sign but not eligibility. Locations and transforms
must be included: n is a world-space direction while pole/axis data may be local.
For the first implementation, restrict to exact axis-aligned placements or exact
stored-vector predicates. A nearly aligned rotation must fail the certificate.

Do not derive these certificates from a sampled normal range, tolerance-bounded
analytic recognition, surface degree or a few equal endpoints. Arbitrary offsets,
near cylinders and approximate twist symmetry must fail unless another explicit
algebraic certificate proves projected rank. Positive weights alone do not prove
rank deficiency. If the actual rational circular-twist fixture fails all simple
certificates, that is evidence to pursue numerical conditioning, not permission
to weaken the predicate.

For moment/inertia modes, projected-normal-zero still mathematically multiplies
all derived by-plane terms, but a mass-only first prototype has the smallest
verification surface. Avoid claiming a general optimization of by-point volume,
whose integrand is (P-location) dot normal rather than projected-plane flux.

## Provenance and required next evidence

- [Plane coefficient shift](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L218-L273)
- [VolumeValue projected normal/distance product](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_UFunction.cxx#L75-L99)
- [Whole-shape accumulation and relative error](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L577-L735)
- [Span tolerances and inner-error propagation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L314-L475)

No upstream implementation was copied. The harness is original public-API use.
It is uncompiled/unrun by this worker, so generated output and timings must be
attributed to subsequent orchestrator runs. A sign-convention patch needs explicit
open-face/moment compatibility review even if all closed analytic volumes agree.

## Orchestrator runtime evidence

The main investigator subsequently built/ran this harness with three samples per
solid combination. Raw JSONL is in
[results/quadrature-primitives.jsonl](results/quadrature-primitives.jsonl).
This worker read representative raw rows to cross-check the supplied findings;
it did not run the harness. No global mirror/axis policy or stopping change has
been accepted on this evidence.

The open-face diagnostic decisively matches the literal mirrored plane algebra:

| Face height h | Supplied plane q | Geometric flux A(h-q) | Observed flux |
| ---: | ---: | ---: | ---: |
| 4 | 2 | 30 | 90 |
| 127 | 125 | 30 | 3780 |
| 3000004 | 3000002 | 30 | 90000090 |

Mirroring q in each case yields approximately 30. This confirms the current
convention for these open planar faces; it does not establish that changing the
convention is backward-compatible for other open surfaces, centroid or inertia.

At translation [1e6,-2e6,3e6], supplied Z low-minus-one misses requested eps=1e-10:
box relative analytic error is 2.8383e-10, cylinder 2.0997e-10. Mirrored Z gives
zero reported box discrepancy and about 2.6274e-15 cylinder discrepancy. The
unmirrored estimated errors are also above eps for these rows, but the application
currently accepts any nonnegative finite estimate. Better reference conditioning
helps these fixtures, without establishing a robust general reference strategy.

The thin-box counterexample prohibits treating mirroring as a complete fix:
mirrored Z reports mass 0.0083999857306622516 instead of 0.0084, relative discrepancy
1.6987306843e-6, while its estimated error is only 1.3957113162e-11. Mirrored X/Y
give approximately 2.68e-16 relative discrepancy. This is an optimistic-error
failure at a nearly constant projected thickness even after flux cancellation
conditioning improves. The located shape preserves local thickness, so a likely
next source hypothesis is world-coordinate evaluation/subtraction losing small
thickness bits before quadrature; this is an inference requiring isolation of
surface-point values and local-reference arithmetic, not yet a measured cause.

All sampled sphere-axis actual errors were within 1e-10, although reported
estimates often exceed eps. Thus estimates can be optimistic or pessimistic;
changing acceptance solely to `estimated <= eps` would reject some accurate
answers while still missing this thin-box failure. Maintaining analytical and
independent geometric accuracy checks remains necessary for kernel experiments.
