# Exact volume and tight-bounds kernel research

2026-10-08, source research and an isolated experimental patch. No compilation,
benchmarks, production source/SDK edits or commits performed in this lane.
The orchestrator reports a roughly five-second serial request for a 90° twisted
circle with axis offset 5; that is motivating context, not a measurement made in
this lane. OCCT source baseline: `a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3).
Makeshift baseline links use `7861122fb791c71692d7b48a70bfcb3a381fc95a`.

## Highest-priority experiment

Separate `volume`'s tight bounding from quadrature. It calls
`BRepBndLib::AddOptimal(shape, bounds, false, false)` solely to choose an exterior
integration plane. Tight surface extrema are unnecessary for that purpose: a
conservative finite enclosure suffices. It then repeats the volume call during
solid extraction and presentation; presentation also computes tight bounds itself.
See [main.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/main.cpp),
[booleans.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/booleans.cpp),
[presentation.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/presentation.cpp).

Use a verified positive-weight rational B-spline/Bezier control-hull enclosure,
with correct locations and support domains, for volume reference selection.
Keep existing AddOptimal presentation bounds, whose extrema define handles.
General `BRepBndLib::Add(..., false)` is also worth timing but do not claim its
every fallback is a certified enclosure: generic sampling fallback paths exist.
Guard negative/zero weights, extrapolated parameter domains, offset supports and
unsupported geometry with the original method. Loose hulls can worsen integration
conditioning, so compare reference plane choices and retries, not just bounds time.
This changes neither accepted B-REP nor requested `1e-10` quadrature accuracy.

## Why AddOptimal can be costly

Source observation: [BRepBndLib::AddOptimal](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBndLib/BRepBndLib.cxx#L240)
uses edge boxes for eligible supports, but general spline surfaces use exact UV
bounds, surface bounding and potentially trimmed-face box adjustment. Degree-one
single-span spline directions get a special edge-only case. A curved loft generally
does not. Record actual degrees, knots, rational flags and trim restriction before
assuming which branch the offset-circle loft takes.

Source observation: [BndLib_AddSurface::AddGenSurf / AdjustExtr](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BndLib/BndLib_AddSurface.cxx#L501)
samples a grid, estimates deflections, and refines candidate extrema for three
coordinates. Refinement invokes particle swarm optimization with at least 8×8
particles, then Powell minimization capped at 200 iterations. Repeating refinement
over many candidate cells can produce large evaluation counts on a small number
of complicated faces. Its ordinary Add path instead uses eligible spline pole
hulls and has generic sampling fallbacks. These mechanisms are inspected; their
actual share of the reported five seconds remains unmeasured.

Instrumentation: count/time AddOptimal per shape and face, FindExactUVBounds,
AddGenSurf, AdjustExtr invocations, PSO and Powell iterations/evaluations, and
AdjustFaceBox. Record distinct unchanged faces to expose avoidable repeated queries.
Do not interpret particle count as an observed iteration count.

## Why volume quadrature can be costly

Source observation: [BRepGProp face loops](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L544)
run face integration sequentially, accumulate properties and stop immediately on
a negative face error. This can leave partial properties; taking an absolute
error is not a valid recovery. Reference plane retries must start the whole
calculation anew. The same shape can be integrated several times by callers.

Source observation: [VinertGK::PrivatePerform](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L248)
loops boundary curves and property components, integrates boundary spans, and
starts adaptive rules with empirically selected 5–15 points. It permits up to
1000 iterations. Only requested components are integrated: mass alone, mass plus
three first moments, or also six inertia components. The current Makeshift GK call
requests mass alone; adding center-of-mass computation is not free.

Source observation: [TFunction::Value](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_TFunction.cxx#L52)
evaluates a trimming pcurve and performs another adaptive integral over U spans
for every outer sample. It retrieves U knots each time. Thus evaluations multiply
across outer and inner rules, even for a single face; allocations and span setup
can recur frequently. Nearly zero pcurve derivative contributions already skip
the inner integral. Capture inner/outer evaluation counts, subdivision counts,
failure status and absolute error by face/curve/span/component.

Source observation: [UFunction::VolumeValue](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_UFunction.cxx#L68)
evaluates surface point and normal for each sample. Plane mode combines normal
projection and signed distance to the reference plane. First moments reuse that
form algebraically but are integrated separately. Candidate optimizations include
sharing evaluations at identical nodes, not changing the geometry or replacing its
measured volume with the ideal requested sweep volume.

Source observation: [BRepGProp API flags](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.hxx#L217)
define span handling for spline faces and estimated relative error. Estimated
quadrature convergence is not a formal bound on geometric accuracy. Existing
[plane-cut evidence](../../freecad/kernel-topology.md#plane-cut-volume-integration-2026-09-22)
records ordinary quadrature giving a materially different mass after repartition,
despite a small reported error. Keep span-aware integration and the established
reference-plane retry semantics during performance work.

## Safe optimization candidates, ranked

| Rank | Candidate | Reason / correctness conditions |
| --- | --- | --- |
| 1 | Conservative bounds for volume-plane selection; request-local identical-volume reuse | Removes exact extrema work and duplicate integration without lowering accuracy; cache only immutable, same-location/orientation shapes and identical options |
| 2 | Select a geometrically well-conditioned reference normal | A sweep-aligned plane may reduce cancellation for offset circular lofts; test translated/rotated bodies, cavities, partitioned faces and all retry failures |
| 3 | Reuse U-span metadata and quadrature tables within a face | Repeated setup is explicit; preserve clipping at the changing pcurve U endpoint, continuity breaks and tolerance accounting |
| 4 | Share surface D1 evaluations for mass and moments | Current scalar components repeat evaluation; use vector integration/shared node cache with per-component error criteria, and disable unused inertia |
| 5 | Specialized tensor-product integration for truly rectangular natural spline patches | Avoid nested trimming integration only when topology proves the parameter domain; holes or arbitrary trims invalidate this path |
| 6 | Parallel face integration with deterministic reduction | Independent adaptors/domain state per worker; common reference and stable sum order; few-face models may lose to overhead |
| 7 | Rational/spline extrema via conservative subdivision | Replace expensive heuristic searches with control-hull pruning; exact presentation bounds require termination/error proof, whereas plane-enclosure query can stop early |

Ranks describe investigation order, not measured expected gains. Cache keys cannot
be raw TShape pointers alone: location/orientation, mutable tolerance/geometry,
integration reference, span/CG/inertia/shared flags matter. A request-local cache
avoids introducing a second document owner or cross-request invalidation machinery.

For a circular loft the current source suppresses pure circle spin and converts
sections to exact rational circles before lofting:
[extrude-twist.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/extrude-twist.cpp),
[extrude-twist-curves.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/extrude-twist-curves.cpp).
This should yield much cleaner circle parameterization than a polynomial fit,
but inspect the actual resulting surface rather than infer separability. If the
stored rational surface factors into a circle plus a translation curve, its
mass-properties integrand may have a simpler structure. A kernel fast path must
prove that algebraic factorization from coefficients, not trust operation intent.
No draft, no holes and a known section area also supply independent expected-volume
probes, but the accepted loft is approximate in its orbital direction; ideal area
times depth cannot substitute for integrating the actual accepted B-REP.

## Newer OCCT opportunities

Inspected upstream performance patch
[c9bdc4b9f1d6d7526298e907e328edd68e96394c](https://github.com/Open-Cascade-SAS/OCCT/commit/c9bdc4b9f1d6d7526298e907e328edd68e96394c)
(PR #1091, merged 2026-02-15) caches face surface/location in BRepGProp_Face,
adds identity/equal-location fast paths to TopLoc_Location::Predivided, and avoids
unnecessary location composition in pcurve lookup.

Applicability clarification: 7.9.3 already retains `BRepAdaptor_Surface mySurface`
and `Normal()` directly calls `mySurface.D1`; this patch does **not** introduce
surface-evaluator retention for the per-quadrature-node normal hot path. Its new
context avoids repeated face-surface/location lookup when loading an edge's pcurve.
The inspected 7.9.3 `Load(edge)` does use the face-taking CurveOnSurface overload,
so analogous setup caching is possible, but edge loading is much less frequent
than nested surface evaluations. Treat this as a profile-dependent, narrow
adaptation across changed upstream structure, not a ready cherry-pick or proposed
fix for the five-second request. Source diff inspected; no local runtime comparison.
Relevant regression cited upstream: bug28402.

Do not blindly import neighboring caching changes:
[07f7db38ea330c4a20387826f671b7c0122659b1](https://github.com/Open-Cascade-SAS/OCCT/commit/07f7db38ea330c4a20387826f671b7c0122659b1)
(PR #1092) fixes volume solid-cache double counting with SkipShared, dropped free
faces/shells, and restrictions around transforms. These illustrate real correctness
hazards in properties caching. They target ordinary volume properties/instanced
compounds, not evidence of a fix for nested GK on this single loft. Release notes
also mention spline span/evaluator caching; pin and inspect each specific patch
before proposing it. An OCCT 8 migration is a separate ABI/build/testing effort.

## Published numerical direction

Gunderman, Weiss and Evans, *High-Accuracy Mesh-Free Quadrature for Trimmed
Parametric Surfaces and Volumes*, Computer-Aided Design 141 (2021), 103093,
[doi:10.1016/j.cad.2021.103093](https://doi.org/10.1016/j.cad.2021.103093),
[open manuscript](https://arxiv.org/abs/2101.06497).
The paper reduces integrals using generalized Stokes and high-order numerical
antiderivatives, retaining parametric geometry and trims. It reports efficient
convergence up to trimming approximation error and provides QuaHOG MATLAB code.
This fits exact-BREP CPU investigation; it is not remeshing. The abstract and
article preview were inspected here, not a complete independent algorithm audit.

Makeshift hypothesis: prototype precomputed high-order quadrature per spline span
and trim, reuse it across moments, and retain adaptive/error-controlled fallback.
OCCT already performs dimensional reduction with numerical antiderivatives; merely
invoking Stokes is not a novel optimization. The useful comparison is node count,
reuse strategy, cancellation handling and rigorous tolerance accounting. Read the
full paper and code license before implementing or copying anything. Validate
against independent integral/geometry probes and the known partition/cavity cases.

## Required timing breakdown

For the motivating case record surface degree/knots/weights/UV trims; time tight
bounds, each GK face, each reference attempt, extraction volume, presentation
volume, center-of-mass integration and presentation bounds separately. Compare
identical accepted B-REPs so a construction change cannot masquerade as an
integration speedup. Keep timing instrumentation outside inner sample loops where
possible; counters aggregated once per face avoid perturbing hot-path behavior.
No optimization above is ready to ship from source inspection alone.

## Concrete 7.9.3 patches preserving the integration rule

These are implementation suggestions, not executed changes. The first experiment
should retain the same reference plane, shape, flags and tolerance so setup savings
can be distinguished from different numerical conditioning.

1. **Move the existing zero-coefficient return ahead of span setup.** In
   [TFunction::Value](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_TFunction.cxx#L52),
   after D12d and the existing short-U-range return, compute the same coefficient
   and property-type validation, then apply the unchanged Angular threshold.
   Only surviving samples need GetUKnots and SetVParam. Return the same zero value;
   preserve error accumulators and unknown-property failure behavior. This removes
   setup for constant-V edges without changing quadrature samples or arithmetic
   for nonzero contributions. It will not fix cancellation inside a nonzero inner
   integral. Inspected [UFunction::SetVParam](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_UFunction.lxx#L29)
   is a simple assignment, so deferring it has no external side effects.
2. **Cache complete U knots once per loaded face, not each sample.** Pinned
   [Face::GetUKnots / GetRealKnots](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_Face.cxx#L532)
   allocates and copies complete spline knots, then allocates a clipped array.
   Store immutable complete U knots at face initialization; clip each query with
   the same comparisons and Confusion tolerance. Reuse clipped storage where bounds
   and length match. Invalidate on Load(face); keep non-spline/span-disabled behavior.
   Do not cache inner integral results using U limits alone: V changes per sample.
3. **Memoize clipped limits only for exactly repeated endpoints.** TFunction's
   UMin is fixed, while UMax comes from the current pcurve sample. Constant-U
   boundary curves offer repeated limits; general trims do not. Key on exact
   endpoints plus face/span state; avoid quantization that changes integration.
   Interior knot subset indices may be reused until UMax crosses a tolerance-aware
   boundary, but always retain the actual last endpoint and current span count,
   which affects the initial quadrature order.
4. **Reuse quadrature workspace/table copies.** Pinned
   [math_KronrodSingleIntegration](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_KronrodSingleIntegration.cxx#L130)
   allocates four node/weight vectors per Perform and two scratch vectors per
   GKRule. It initializes rules once per Perform, then reuses them through
   subdivisions. Add owned reusable scratch capacity and rule vectors keyed by
   odd point count. Retain evaluation order, sums, error estimator and subdivision
   decisions. Standard rules may already come from tabulated data; the target is
   repeated allocation/copy, not an unverified claim of costly rule generation.
   Nested integrators need separate scratch state; avoid mutable shared globals.

Suggested counters, aggregated per face: outer Value calls; zero-coefficient and
short-range returns; GetUKnots calls/allocations; cache hits; inner span count;
Normal/D1 evaluations; inner and outer reached iterations/points; final absolute
and relative error; retry count and elapsed time. The Kronrod code linearly scans
errors for the next subdivision and inserts into sequences; if iteration counts
are high, measure that overhead before redesigning its queue. Equal-error tie
handling and sum order must remain stable for an algorithm-preserving patch.

Near-zero signed inner integrals are a separate numerical issue: comparing a
small Gauss/Kronrod difference against an even smaller relative denominator can
cause substantial refinement. Altering absolute/relative stopping criteria would
change the integration algorithm and needs independent error-budget design; it
must not be folded into the allocation/cache experiment. Reference x/y/z trials
should report per-face cancellations and node counts rather than infer validity
from faster convergence alone. Preserve the known repartition/cavity regressions,
moments and shifted/rotated/scaled shape checks in any patch comparison.

## Fixed-V partial polynomial cache: a narrow evaluator patch

**Applicable source mechanism.** Pinned
[GeomAdaptor_Surface::D1](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomAdaptor/GeomAdaptor_Surface.cxx#L723)
uses the spline span cache unless boundary-side rules select LocalD1. Cache rebuild
depends on U/V span validity; a fixed V alone does not guarantee a fixed cache.
Keep existing boundary routing and cache validity checks unchanged.

Pinned [BSplSLib_Cache::D1](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BSplSLib/BSplSLib_Cache.cxx#L139)
normalizes parameters to the current spans. It evaluates the maximal-degree variable
first into two coefficient blocks, then evaluates the minimal-degree variable for
position and its tangent, and separately evaluates the maximal-degree tangent.
RationalDerivative converts homogeneous derivatives; tangents are scaled by inverse
half-span lengths. If V degree is at least U degree, the first evaluation uses V.
Its coefficient blocks therefore repeat for the same normalized V and span cache,
regardless of U. D1 currently computes them afresh at every sample.

**Proposed minimal patch.** For `degreeV >= degreeU`, retain the exact output of
the existing first `PLib::EvalPolynomial` call (both blocks, length
`2 * myPolesWeights->RowLength()`). On a subsequent D1 call with the same exact
normalized V and unchanged BuildCache generation, feed those blocks into the
unchanged two U polynomial calls. Keep initialization, RationalDerivative, tangent
assignment and scale operations in their original order. This is memoization of
an intermediate polynomial result, not geometry approximation or reassociation.
Using the same call to fill the cache preserves its Horner arithmetic rather than
constructing a new isoparametric B-spline curve with a different evaluator.

Increment a generation or invalidate explicitly in every BuildCache before
coefficients are rewritten. Initialize the cache as invalid; require finite input
and exact normalized-V equality. Cache miss fills both blocks once. Do not round
V or use tolerance-based equality. Retain original D1 for `degreeU > degreeV`:
collapsing fixed V there would change evaluation order. Degree equality is supported
because the existing else branch evaluates V first. Do not alter D0/D2/D3 initially.

For a degree-2 circle direction and degree-8 loft direction, a cache hit removes
the degree-8 evaluation over all homogeneous U coefficients. It retains low-degree
U evaluation and rational conversion. The ideal removed work is proportional to
V degree; actual speedup depends on hit rate, span switching and where time goes.
An inner integral holds V fixed, but crossing U spans rebuilds the polynomial.
A single-entry cache still helps the many samples within each span; a multi-span
cache is a separate memory/complexity experiment, not needed for the first patch.

**Instrumentation and acceptance.** Count D1 calls, degree-gate fallbacks,
LocalD1 calls, BuildCache generations, partial-cache hits/misses, normalized-V
changes, U-span changes, and first-stage PLib calls avoided. Report these per
face and reference-plane attempt with GK node counts. First compare P/Du/Dv
bit patterns against the original path under the same compiler options, then
normal/integrand values and final volume/error/iteration results. This patch aims
to keep adaptive decisions identical, not merely obtain a nearby final volume.
Measure scratch-copy overhead separately; `NCollection_LocalArray` may already
use stack storage for these small coefficient blocks, so avoid claiming existing
heap allocation is necessarily the main cost.

**Pitfalls and containment.** Periodic normalization and span origin/length changes
must remain part of the key via generation and exact normalized parameter. Test
seams, knot boundaries, extrapolation and adaptor trim-boundary LocalD1 routes.
All homogeneous coordinates and weight derivatives must remain cached together;
do not treat rational weights as constant or convert to Euclidean poles early.
Poles/weights/degree/knots mutated by an external caller remain subject to the
existing adaptor invalidation contract; the new partial cache must not outlive its
parent coefficients. Each worker needs an independent mutable cache/adaptor;
do not share this state through globals or a common geometry handle. Existing
const evaluator methods already mutate cache state, so const is not a thread-safety
guarantee. Surface locations and face reversal stay in existing BRep adaptor/normal
handling, rather than being absorbed into a reusable global result.

This is the strongest kernel patch candidate found for the fixed-V nested-GK
workload. Runtime validation remains the orchestrator's responsibility.

### Experimental patch artifact (2026-10-08)

Implemented the narrow candidate in copied overrides only:
`.cache/geometry-performance/bspline-cache/overrides/BSplSLib_Cache.hxx` and `.cxx`.
Durable [unified patch](patches/bspline-fixed-v-cache.patch) applies with `-p1`
at the OCCT source root. Original source and SDK were left untouched. No compilation
or runtime validation performed in this lane; `git apply --check` against the
source root passed, and the diff was reviewed.

The patch preserves existing first-stage PLib evaluation on misses and the later
polynomial/rational arithmetic. A thread-local last-partial vector holds two
RowLength coefficient blocks. Its key combines cache address, globally unique
coefficient-generation identity and exact normalized V (including signbit to
distinguish positive/negative zero). Constructor and every BuildCache receive
fresh identities from a relaxed atomic allocator; saturation throws instead of
reusing identities, preventing stale matches after object-address reuse. D1 has
no object writes, preserving concurrent read-only evaluation within an unchanged
span. Nonfinite normalized V and degreeU>degreeV retain per-call local scratch.
No counters or environment branches were added. The atomic identity allocator
is shared bookkeeping, not a shared coefficient cache.

Provenance: copied files retain OCCT's original copyright and LGPL-2.1/OCCT
exception headers. Baseline is the pinned recipe commit and matching source
archive already retained by the workspace. The patch is Makeshift's adaptation;
any distribution must provide corresponding original sources plus this patch,
license and exception text through the existing source-packaging mechanism.
This records provenance, not a complete distribution-license audit.

SHA-256 of original copied inputs:

- `BSplSLib_Cache.hxx`: `2273cd8c55495645083419bf81bbbf4bcb7014dcbfdf5a0ff9046a232fc934c0`
- `BSplSLib_Cache.cxx`: `e952080b8e9730de2aa64ade53a0858b9cdcdd2b596009c6d26fb0b2e1faa57b`

**Build and ABI constraint.** BSplSLib belongs to TKMath; GeomAdaptor belongs to
TKG3d and constructs `new BSplSLib_Cache`. Added private fields change class size
even though public method signatures remain unchanged.
Rebuild TKMath and TKG3d together against the modified header. A TKMath-only
replacement with old TKG3d is unsafe: allocation uses the old class size. Source
search finds direct header consumers in BSplSLib_Cache.cxx and
GeomAdaptor_Surface.cxx/.hxx; other transitive/reverse dependencies should rebuild
when their header graph requires it. Keep prototype includes, linked libraries
and runtime library search paths consistently on the experimental SDK. Use a
fully rebuilt coherent SDK before production integration; never swap one library
into the verified production receipt or mix modified headers with old binaries.

**Thread contract verified in source.** GeomAdaptor_Surface.hxx explicitly states
its spline evaluation cache is not thread-safe. ShallowCopy constructs a new
adaptor without copying its existing surface cache, enabling independent worker
state; ordinary copied objects/handles can still share state. That warning does
not justify introducing new races among concurrent readers of an already-valid
span: the first per-object mutable-buffer draft was replaced with thread-local
storage before any builds. BuildCache still cannot run concurrently with D1,
as in the original coefficient cache. PLib's polynomial routines were inspected:
despite nonconst coefficient references, these evaluation paths read coefficients
and write only their separate results, so later calls do not modify retained
blocks. No recursive callback occurs in those calls; TLS coefficients are not
overwritten while the subsequent U evaluation consumes them.

Source-size warning: upstream Cache.cxx already exceeds 300 lines and D1 exceeds
80 lines; the experiment increases both. Preserve the readable upstream diff for
research; factor the partial-cache helper coherently before maintaining a fork if
runtime gains justify adoption. The patch adds no production source changes.

### Constructor, ownership and invalidation audit

Source-only follow-up after the orchestrator compiled the isolated candidate.
No further patch change was required or made by this lane.

- `BSplSLib_Cache` already declares its copy constructor and assignment private
  without definitions. This prevents implicit copying, assignment and implicit
  moves; new objects cannot inherit another object's generation by a supported
  copy path. `BSplCLib_CacheParams` independently prohibits copying. There is no
  default constructor; the exported constructor initializes the generation.
- Source symbol search across OCCT `src` finds `new BSplSLib_Cache` only in
  `GeomAdaptor_Surface::RebuildCache` (TKG3d), for spline and Bezier surfaces.
  The class remains public: external plugins/tests allocating it directly also
  need the modified header and a rebuild. Handle copies share one object, not
  a duplicate generation. GeomAdaptor's ShallowCopy does not copy its cache;
  adaptor Load nullifies its cache, so a new object gets a fresh identity.
- Every BuildCache entry acquires a new generation before span location and
  coefficient writes. Failure during rebuilding cannot leave an earlier partial
  hit valid. Failed construction consumes an identity harmlessly. Counter
  exhaustion throws before reuse, including after repeated address recycling.
  There is one allocator in the loaded TKMath image; simultaneously loading or
  hot-swapping multiple incompatible TKMath copies is outside this coherent-SDK
  experiment and must not be used to bypass ABI constraints.
- Destruction need not purge TLS: Owner is used only as an equality key and
  never dereferenced after destruction; a same-address replacement differs in
  generation. Each thread retains at most its last partial buffer; vector capacity
  is bounded by the largest cache dimension encountered by that worker and is
  released at thread exit. Thread-local initialization and coefficient writes
  do not affect other readers. Concurrent BuildCache remains prohibited as in
  baseline; the non-atomic generation is safe only under that existing contract.
- All parent coefficient/span state is private; its supported mutation route is
  BuildCache. Out-of-band pole/weight mutation without rebuilding remains an
  existing stale-adaptor problem, not a new invalidation guarantee supplied by
  the patch. Floating-point rounding-mode changes between calls could invalidate
  bitwise expectations because cached intermediates were computed under another
  mode; baseline OCCT callers normally assume a stable FP environment. Any
  application that changes rounding modes mid-integral should disable the
  optimization or include the environment in its cache contract before adoption.

The orchestrator reports matching D1 hashes across grid/spans/fixed and alternating
V, reversed/located surfaces and four unchanged-span concurrent readers on circle
and bent-spline cases, plus identical mass/error in an initial GK trial. These
are delegated results; consult its raw records for timings, sample sizes and
coverage. They do not establish arbitrary topology robustness or speedups across
all evaluators. Remaining useful lifecycle probes are allocator-address reuse,
repeated BuildCache at fixed V, both degree orderings, rational/nonrational and
signed-zero/nonfinite fallback behavior.
