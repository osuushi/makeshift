# Exact ray-hit range filtering before trimmed-face classification

Research, 2026-10-08. Initially source-only in the delegated lane; orchestrator
execution is recorded below. Independent artifact:
[patches/intcurvesface-early-hit-range.patch](patches/intcurvesface-early-hit-range.patch).
It modifies only `src/IntCurvesFace/IntCurvesFace_Intersector.cxx` against original
OCCT 7.9.3 commit `a016080bf6738d6aeae020badee4e888ad1540a5`, not the compiled
ray-setup or other experimental overrides. Original SHA256
`88e2c0b6891ef15a3eaf7d954975e2ba2c153771dd7144669cbeb4a8e98c35b2`;
modified temporary copy SHA256
`f4d04a64d39b03ec6a98f0fea3d9557dfea8d1ad0ac2e006484084f5b5a21583`.
Temporary original/modified copies are in `/tmp/makeshift-ray-range/`.
Upstream source and SDK are untouched. A git apply --check against that original
source succeeded; this was an applicability check only, not a build or execution. The original file retains its OCCT
LGPL-2.1-with-exception provenance/license header; this 46-line unified patch
adds no upstream source redistribution under a different license.

## Waste identified and proposed exact change

Pinned [Intersector::InternalCall](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L218)
receives infinite-support intersections from HICS. Whenever there are support
hits, it scans all edge tolerances, computes surface U/V resolutions, and
classifies **every** hit's UV coordinates against the trimmed face. Only after
classification returns IN/ON does it check `W >= parinf && W <= parsup`.
An out-of-range hit cannot appear in the original accepted result regardless
of classification. For short thickness segments, many body faces may intersect
the infinite supporting line far beyond the requested ray range; actual
frequency has not been measured yet.

The independent patch first scans HICS point W values with the same inclusive
comparisons. If no point is in range, it returns before tolerance scanning or
classification. Otherwise it retains the old tolerance calculation and reverse
point traversal, skipping each out-of-range point **before** UV construction
and classification. The original final range check, point insertion, boundary
state, reversed-face transition and sorting behavior remain unchanged. There
is no epsilon expansion, approximate box test, nearest-hit pruning or hit merge.

First-prototype runtime scope is `!myPolyhedron`, finite lower/upper bounds and
`parinf <= parsup`. Pinned constructor uses no polyhedron for elementary plane,
cylinder, cone, sphere and torus supports; non-elementary faces use the original
polyhedron route. Infinite, NaN or reversed ranges and polyhedron queries retain
the original path. This restriction avoids broadening the experiment to every
curve/freeform/range contract; it is not a mathematical need for approximate
clipping. For arbitrary finite point W the new comparison is byte-for-byte the
original accepted-result predicate; NaN W fails it just as before.

For gp_Lin analytic queries,
[Perform](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L353)
passes the original caller range through unchanged in the no-polyhedron branch.
InternalCall is also shared with the generic Adaptor3d_Curve overload; the
patch's no-polyhedron guard is a face-support guard, **not** a gp_Lin-only guard.
An isolated experiment must include that overload as a regression control or
narrow its activation further before application beyond thickness queries.

## Classifier initialization and state

Pinned [BRepTopAdaptor_TopolTool::Classify](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTopAdaptor/BRepTopAdaptor_TopolTool.cxx#L176)
lazily creates FClass2d using the face and first supplied tolerance. Its
[FClass2d constructor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTopAdaptor/BRepTopAdaptor_FClass2d.cxx#L90)
does not receive the first queried UV point. Perform is const and uses local
query/reframing state plus stored face/polygon/tolerance data. On an immutable
face the min/max face/edge tolerances are unchanged, so delaying first
classification until an in-range hit initializes the same data with the same
tolerance. The auxiliary wider-tolerance classifier is call-local and likewise
point-independent at initialization. Original accepted hits visit classifiers
in the same relative order and retain all their current predicates.

Returning early also delays any support-resolution lazy initialization and
other private classifier work. This is intentional avoided work, not a proof
that observable allocation/progress/global-cache behavior is unchanged. Do not
combine this experiment with parallel metadata or concurrent support mutation;
shared spline resolution hazards remain a separate research problem. See
[presentation-research.md](presentation-research.md).

## Public error behavior is a real limitation

**This is not established as a general exception-compatible backport.** The
baseline can throw while scanning tolerances, initializing resolution/classifier
state, classifying an out-of-range UV point, or running the wider-tolerance
nearest-edge projection. The patch may now return an empty result or omit that
classification without raising the same exception. It can therefore suppress
errors on invalid low-level faces; no approximation is involved, but error
observability still changes. The patch's scope check does not validate the face
or certify that every skipped classifier would have completed successfully.

One-time trusted application validation is a useful experiment precondition,
not a complete cure: BRep validity alone does not prove every downstream
projection/classifier can never throw. In particular a valid degenerate edge
can have no 3D curve; the baseline wider-tolerance fallback passes BRep_Tool::Curve
into GeomAPI_ProjectPointOnCurve, so nullable projection supports deserve an
explicit control. Begin with the already validated application box/perforated
plane/cylinder corpus, also checking relevant 3D curves/pcurves and tolerance
ranges. Record exception parity on malformed/missing-curve/high-tolerance faces
separately. Do not silently redefine all invalid inputs as empty intersections.

If the required public contract demands identical eager errors for every
out-of-range support hit, this early-skip optimization cannot satisfy it without
performing the skipped work or establishing a stronger safe-input domain. Keep
it in an isolated opt-in research library until that contract decision and
coverage are concrete; do not replace the SDK or describe validity as proof.
Cancellation, memory exhaustion and signal behavior also differ when work is
omitted. No new validation call is inserted into the kernel hot path.

## Preserve existing IsParallel behavior, including stale state

Pinned InternalCall sets `myIsParallel = HICS.IsParallel()` **only** in the
`HICS.IsDone() && HICS.NbPoints()==0` branch. Perform clears hit sequences/count
but does not reset this flag. A completed HICS with support points, even if none
is in the requested interval or trimmed face, leaves the previous flag value.
The new early return remains inside that points-present branch and likewise
does not touch the flag. Do not set it false, substitute HICS.IsParallel, or
route early-empty results through the no-support-points branch as part of this
patch: that would introduce an independent behavioral change. Regression tests
should include prior parallel/no-hit followed by out-of-range support hits and
then in-range hits, observing IsParallel as well as Done/count/hit fields.

## Isolated experiment and acceptance

Only TKTopAlgo implementation changes; no header, class layout or ABI change is
introduced. Rebuild/link an isolated TKTopAlgo against original 7.9.3 interfaces.
Keep the original implementation, ray-setup-only candidate and early-range-only
candidate identifiable. Later combination requires a separate interaction test;
the range patch is not rebased onto or silently combined with ray-setup reuse.

Untimed counters can establish HICS support-point count, in-range point count,
faces with all support points out of range, original classification calls,
tolerance scans, wider-classifier calls/projections and Done/IsParallel states.
Then compare ordered full hit fields (W/U/V/point/state/transition/face identity)
and exact metadata on perforated Fuse, open/closed shell, notched fixture,
planes/cylinders/cones/spheres/torus, holes/trim boundaries/seams, reversed and
located supports, endpoint-inclusive hits, signed zero, equal/reversed/infinite/
NaN ranges and generic-curve overload. Alternate short/long ranges on the same
intersector to exercise delayed initialization and state reuse. Include invalid
low-level faces and nonzero-tolerance/degenerate-edge controls with their error
outcomes explicitly reported.

Main's initial ray-setup-only 40-block Fuse estimate was approximately 1.013x,
but it did not reproduce in a second forty-block run; that is motivation to
target classifier work, not evidence for this new patch. No speedup or saved
classification count is claimed until
measured. Whole-request randomized serial comparisons must include new prepass
cost and all original validation/presentation, with output checks and independent
memory evidence. The inherited upstream InternalCall already exceeds 80 lines;
this source artifact edits that existing kernel function rather than adding a
new application abstraction.


## Public SDK controls prepared (not executed)

[ray-range-controls.cpp](../../../tests/geometry-performance/ray-range-controls.cpp)
is a standalone public-API, untimed JSONL harness (210 lines; all new functions
below 80 lines). It uses direct IntCurvesFace_Intersector gp_Lin calls and the
SDK's `Handle(Adaptor3d_Curve)` overload backed by GeomAdaptor_Curve/Geom_Line
with explicit curve domain [-1000,1000]. It records restriction=true and both
UseBToler=false/true configurations independently. Each fixture/overload/config
keeps one intersector through an ordered query sequence: prior parallel/no-hit,
out-of-range support hit, then in-range hit, outside-trim short/long ranges,
exact inclusive endpoint checks, reversed/NaN/infinite bounds, signed-zero
lower bounds, recovery to ordinary range and axis hits at possible poles/apex.
The prior parallel/no-hit label is an attempted condition, not an assertion
that every analytic surface recognizes that line as parallel; observed flags
are authoritative.

Fixtures include a trimmed plane, cylinder, sphere with degenerate poles, cone
with degenerate apex and torus, plus explicitly labeled missing-3D,
missing-pcurve and high-edge-tolerance plane variants. Construction reports
actual BRep validity, degenerate-edge occurrences and missing-3D occurrences;
labels do not substitute for those observations. Missing planar pcurves may be
regenerated privately by the SDK's projection fallback. A missing-3D/high-
tolerance plane and an outside-trim ray are an honest attempted trigger for
the nullable-curve wider-classifier projection; no exception divergence is
promised before execution.

Every query reports Done/IsParallel/count and ordered XYZ/U/V/W/state/transition
fields. Floating numbers retain exact uint64 bit patterns, including NaN,
infinity and signed zero, alongside finite numeric values. OCCT exceptions
include their dynamic exception type and message; the harness also reads public
post-exception state without assuming Done. It does not normalize candidate
answers, assert expected hit truth or silently discard malformed-face outcomes.
No build or execution occurred in this lane. The source header gives isolated
link requirements; main owns compilation and serial runs under the compute lock.

## Orchestrator execution

`build-ray-setup-preloads.sh range` builds a source-pinned, SDK-ABI-compatible
isolated TKTopAlgo preload module; the installed SDK is unchanged. The public
shape-intersector matrix matches all 6,900 query rows and 9,510 reported hits
bit-for-bit against fresh SDK outputs and the saved SDK references, across
serial/four-thread primitive, located and captured-spline contexts.
`run-ray-probe-matrix.sh range` reproduces that check while owning the lock.

The thirty named native regressions in seven files pass, including shell
collision/rejection, captured/located geometry, Boolean and twisted extrusion
cases (`results/regression-ray-range.log`). A 28-case full application output
comparison exits 1: closed perforated Shell's thickness face index differs
36 versus 34 although its single baseline repeat matched. Three other closed
or captured Shell cases also have ordering differences within the baseline.
The stable open/perforated/Boolean/sweep cases match. Ten fresh paired
closed-perforated Shell captures subsequently find one geometric descriptor
variant across all twenty replies, zero descriptor collisions, and the same
62 source→target thickness relations in every reply. Twelve exact BRep hashes
remain because enumeration changes in both labels. Source face0's same physical
target can be index31,34,36 within baseline repeats. This reconciles the index
discrepancy diagnostically without claiming formal BRep/trimmed-region identity
or exact ordered output parity. Raw replies are losslessly compressed in
`results/ray-range-shell-repeats-fresh.jsonl.gz`; the summary and log are separate.
Raw comparison: `results/ray-range-full-output.json`.

After isolating low-level controls into separate processes, all 36 fixture /
overload / bound-tolerance configurations match SDK, source control and range
variant byte-for-byte, including process exits and stderr. Twenty-eight
configurations complete successfully; eight missing-3D configurations crash
all three versions with SIGSEGV. Exact flushed query-start records locate the
failure, preserving it rather than skipping malformed observations. Valid
sphere/cone degenerate-edge configurations complete and match. This matrix
does not demonstrate exception suppression, nor rule it out for other inputs.
Raw/process provenance: `results/ray-range-isolated-controls.jsonl` and summary.

Untimed public Classify-symbol interposition was verified against the installed
SDK symbol `_ZN24BRepTopAdaptor_TopolTool8ClassifyERK8gp_Pnt2ddb`. Control→range
attempt counts are Cut 976→214; Fuse 10,757→3,720; open Shell 5,630→1,319;
bent captured Shell 47→23. All four metadata comparisons match; thickness ray
query counts are unchanged. Counts include every visible intercepted use,
not exclusively thickness code, and may miss hidden/inlined/subclass calls.
Raw full replies/counters: `results/ray-range-classifications-{control,range}.jsonl`.
Tracer overhead invalidates timings; no timing inference uses these runs.

The separate forty-pair application run resolves Cut 1.02423 (95% interval
1.00453–1.03215), Fuse 1.03029 (1.02270–1.04963), and circle 1.02503
(1.00095–1.04021). The other five intervals include 1. Open Shell is 1.02810
(0.99560–1.04790). All geometry/predecessor multisets match, with notched-Shell
baseline ordering variability recorded. These are exploratory pointwise
intervals, not adjusted for eight comparisons. An independent 120-block run
is now confirming these three workloads and open Shell. No kernel patch is
adopted. Raw/summary: `results/ray-range-confirmation{.jsonl,-summary.json}`.

Independent 120-block confirmation resolves Cut 1.01496 (95% interval
1.00584–1.02134), Fuse 1.02729 (1.02235–1.03767), and open Shell 1.02736
(1.02122–1.03992). Candidate medians are 107.67, 435.04 and 572.05 ms,
respectively. Circle is 1.00793 (0.99524–1.01953), so its first small effect
does not reproduce. All ordered summary outcomes match on these four cases.
This is a reproducible modest improvement on analytic Cut/Fuse/Shell workloads,
not an order-of-magnitude kernel gain or a universal public-error contract.
Raw/summary: `results/ray-range-extended-confirmation{.jsonl,-summary.json}`.

### SDK baseline crash and isolated control invocation

The orchestrator's initial **SDK-only** all-configuration run exited 139. Its
preserved [initial raw capture](results/ray-range-controls-sdk.jsonl) stops mid
plane-high-edge-tolerance adaptor query 12. Output was buffered, so that suffix
does not identify the crashing call; a later malformed fixture is a hypothesis,
not a confirmed boundary. This is baseline evidence, not a demonstrated
range-patch regression, and the original raw file remains unchanged.

The source harness is now 239 lines and accepts optional positional selectors:
`FIXTURE|all`, `gp_Lin|adaptor-bounded-line|all`, `0|1|all` (UseBToler). Example:
`ray-range-controls valid-plane gp_Lin 1`. Without selectors it retains the
original all-configuration behavior. For reliable isolation main should launch
one selected fixture/overload/tolerance configuration per process: 9 fixtures ×
2 overloads × 2 flags = 36 processes per SDK/control/candidate variant, with
independent exit code, timeout, stdout and stderr capture. Malformed-face
termination then cannot prevent the other valid configuration observations.

std::cout is unit-buffered. A construction-start row precedes validity analysis,
and a complete query-start row with line/range bit fields precedes each Perform.
The ordered state-reuse sequence remains unchanged within the selected process.
A missing query-result now identifies the active query boundary, while an
incomplete later result can distinguish a post-Perform state-access failure.
Construction/validity failures are separate from Perform outcomes; these rows
must not be normalized into a successful empty hit result. Unit-buffering makes
these runs especially unsuitable for any timing comparison. No revised harness
compilation or execution was performed in this lane.
