# Shell performance: source investigation

Research-only audit on 2026-10-08. No compilation or benchmark was run by this
worker. Main orchestrator owns `/tmp/makeshift-geometry-compute.lock` and all
performance experiments. Findings below are source observations and hypotheses,
not measured speedups.

Application snapshot inspected: `7861122fb791c71692d7b48a70bfcb3a381fc95a`.
OCCT source inspected: pinned 7.9.3 commit
`a016080bf6738d6aeae020badee4e888ad1540a5` in `.cache/kernel/source`.
The rounded-offset pipe precision adaptation remains essential; do not revert it
to gain speed. Reviewed `AGENTS.md`, current research brief, architecture/process,
Shell architecture, kernel README and relevant kernel/topology reference sections.

## Current pipeline and cost multiplication

`native/kernel/shell.cpp::shellBody` serializes source, deep-copies and prepares it
via `shell_tool::canonical`, serializes prepared body, checks offset feasibility,
validates the prepared solid again, constructs offset/wall, recomputes freeform
pcurves, checks generated boundaries, checks per-face correspondence, serializes
both input shapes again to establish immutability, and validates the wall.

`offset_geometry::prepare` already calls `validSolid` before returning. If that
initial check fails it forces SameParameter, tightens boundaries and validates
again. `canonical` returns directly when there are no recognized cylindrical
splines, so the subsequent `shellBody` source validation is an immediate duplicate
strict validation of that exact prepared shape. When recognition succeeds,
`canonical` additionally validates source and canonical result and performs two
warning-free difference Booleans to establish equivalence.

`validSolid` includes exact BRep geometry checks, volume, infinite-point orientation,
closure/tolerance checks and Boolean self-interference analysis. This is materially
more work than a cheap IsDone/IsValid test.

Closed shell construction additionally checks and tightens its intermediate offset
solid, runs a difference Boolean and validates that Boolean result. Open shells
use MakeThickSolidByJoin directly. Final wall validation again checks strict solid
validity, then a material-containment Boolean, then whole-skin minimum distance,
then one opening Common Boolean for every opening face.

`shellBodies` catches *every* runtime_error from the complete first attempt and
repeats the entire pipeline with all-parallel intersections enabled. Even failure
in input preparation, correspondence, serialization immutability or final opening
validation triggers a second fresh deep-copy attempt. Profiling a rejected request
must distinguish these two attempts and failure stage.

Existing timers separate canonicalize, validate-source, offset, correspondence,
valid-solid, containment, separation and openings. They do not separate boundary
repair from correspondence or fine-grained preparation/self-check cost. Closed
shell's `offset` phase includes intermediate validation and its construction
Boolean; do not interpret that phase as pure OCCT offset time.

## Ranked experiments

### 1. Reuse already established input validation within one attempt

Hypothesis: remove the duplicate strict `validSolid(body.shape)` in shellBody when
canonical/prepare guarantees it, without changing the checks themselves. This
avoids repeated exact boundary tests and self-interference. Establish the contract
explicitly: every successful canonical return must have passed strict validity,
and no body mutation may occur between return and construction. Measure source
validation and whole request independently. In no-conversion branch this follows
directly from current code. For conversion branch result validation precedes the
equivalence Booleans; verify those are truly non-destructive including flags before
reusing results. Do not reuse wall validity across repair or forced SameParameter.

Impact: unknown; strong code evidence for duplicate work. Effort low, risk low
with explicit lifetime/mutation boundaries. Prefer local reuse over a persistent
shape-validation cache because current calculator is stateless and serialized
requests reconstruct topology.

### 2. Reuse projection solver initialization across correspondence samples

`offset_geometry::checkParallel` constructs a new GeomAPI_ProjectPointOnSurf for
every sample, and another for every orientation sample. Generic surfaces have
three samples per C2 span per parameter direction, so the Cartesian product can
grow substantially. Existing analytic-equivalent projection optimization already
landed; simply replacing Geom_OffsetSurface with exact analytic equivalent is not
a new opportunity.

Use the public surface-only Init(bounds, tolerance, algorithm), then Perform(point)
repeatedly on a local solver for the same immutable expected/support surface.
Preserve domain and current Precision::Confusion tolerance semantics. Upstream
GenExtPS retains sampled surface initialization using `myInit`; recreating the
solver discards it. Optional MIN-only projection search deserves a separate
experiment because only lower distance and nearest parameters are consumed.
MIN/MAX settings here are active; they are *not* active for DistShapeShape below.

Apply the same reuse idea to `shell-canonical.cpp::cylinders`, where 17 x 17 support
samples each create a new projection solver, although analytic cylinder projection
is cheap and recognition/equivalence may dominate instead.

Impact: potentially high for genuine freeform correspondence, unknown for analytic
cases. Effort low/moderate. Compare accepted/rejected outcomes and distance/nearest
parameters across periodic seams, multi-extrema and near-singular offset supports.
Keep solver local, not shared across threads. Tree-vs-Grad is a separate correctness
and robustness investigation, not a guaranteed faster setting.

### 3. Enable existing CPU parallel APIs currently left serial

Whole-skin separation constructs `BRepExtrema_DistShapeShape(retainedSkin, offsetSkin)`.
Its shape constructor immediately Performs with `myIsMultiThread=false`.
Default-construct, SetMultiThread(pool.HasThreads()), LoadS1, LoadS2, Perform.
Calling SetMultiThread after the current constructor would add no benefit unless
recomputing. The pool/thread-count setup already exists in application startup.

Strict validation constructs `BRepCheck_Analyzer(shape,true,false,true)`: exact
checking remains enabled, parallel checking is explicitly disabled. Test the
third argument using pool.HasThreads. `BOPAlgo_ArgumentAnalyzer` likewise never
receives SetRunParallel here, although its TestSelfInterferences forwards
myRunParallel to BOPAlgo_CheckerSI. Set the inherited option before Perform.

Impact uncertain on this cloud CPU quota; useful across supported multicore CPUs.
Effort low. Test serial, two threads and quota-appropriate caps independently;
large detected logical CPU counts can waste resources. Parallelism can alter
extrema result ordering and floating accumulation: preserve acceptance and geometry
and test adversarial cases. Do not make bitwise extrema ordering a requirement.

### 4. Avoid retrying failures unaffected by offset-intersection mode

Classify error stages and use the expensive global-intersection retry only where
construction or wall verification could plausibly improve. Deterministic invalid
input, invalid opening IDs and non-finite/radius-collapse inputs do not benefit.
Canonical preparation is independent of intersections and need not execute twice
when it deterministically fails. Prefer moving unchanging preparation outside
retry while supplying a fresh independent construction copy each attempt.

Impact principally rejection latency, not successful first attempts. Effort
moderate. Preserve fallback for valid narrow regions: some correspondence and
boundary failures can improve with alternate topology, so do not suppress all
validation-stage retries blindly. Reusing a mutated failed construction copy is
forbidden.

### 5. Kernel fork: accelerate extrema broad phase with conservative hierarchy

Pinned DistShapeShape decomposes both skins into vertices/edges/faces. Its
DistancePairFunctor traverses every pair of bounding boxes in each requested
type combination, filters by distance and stores candidates. DistanceMapMap
sorts candidates before exact narrow-phase processing. This is a quadratic box
pair scan even when most geometry is far apart.

Experiment with a conservative BVH pair traversal or threshold-specific query,
retaining exact narrow-phase extrema and all relevant boundary combinations.
Shell needs only to determine whether minimum distance is below abs(thickness)
minus 1e-6; a kernel threshold API could reject immediately on a verified violating
distance and skip boxes with a proven lower bound above threshold. Accepting
requires exhausting every potentially violating pair. A point correspondence
witness is an upper bound and cannot establish global minimum separation.

Initial bounding boxes use BRepBndLib::Add; inspect loose spline boxes and test
conservative optimal bounds as a separate microexperiment. This does not authorize
triangulation-based distances or treating approximate boxes as proof. Bounding
gap/tolerance semantics and located shapes must remain correct.

Impact can scale strongly with face/edge count; need profiles to establish box
generation versus exact surface extrema share. Effort high; fork maintenance and
robustness risk high. No benchmark evidence yet. Prefer application API fixes first.

### 6. Representation and trusted immutable result reuse

Current cylindrical spline recognition/reparameterization is already important
and carefully validated; it may run the same conversion, exact checks and two
equivalence Booleans for each independent request. Measure its cost separately
before broadening recognition. Any future canonical representation stored once
must preserve accepted geometry, stable entity IDs and input precision; cannot
silently replace accepted source. Ordinary extrusion should retain analytic
supports wherever possible, reducing downstream offset/intersection complexity.

Serialized immutability checks perform four encodings per attempt. Benchmark them
separately before replacing with another mechanism. Pointer identity or topology
counts do not establish unchanged geometry. Hashing still requires traversal;
removing the checks without another adequate immutability guarantee weakens the
current contract. A cheap hash of only metadata is insufficient.

## Choices that are not safe shortcuts

- GeomAbs_Intersection join changes rounded distance-envelope behavior; it is
  not an equivalent performance knob for current Shell semantics.
- PerformBySimple explicitly skips intersection work and is not a replacement
  for general rounded shells. A proven restricted smooth-support route might
  be explored later, with the entire existing verification contract.
- Global intersections are documented incomplete; switching them on globally
  is neither guaranteed robust nor a justified default optimization.
- SelfInter removal is unimplemented in pinned offset source; setting true
  is not a collision solution. Keep independent strict self-interference checks.
- DistShapeShape SetFlag/SetAlgo are documented obsolete, unused parameters.
  Changing to MIN or Tree via those setters cannot yield the hoped-for effect.
- SameParameter force=true can damage already precise trimmed periodic Boolean
  edges; current preparation intentionally checks first and repairs only on failure.
  Do not force every source in the name of normalization.
- Whole-skin separation, containment and opening tests protect distinct properties;
  sampled face offsets alone do not substitute for them.

## Pinned upstream evidence

All links use the inspected OCCT commit; no upstream code was copied.

- [DistShapeShape constructors, immediate Perform and serial default](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepExtrema/BRepExtrema_DistShapeShape.cxx#L619-L676)
- [Obsolete flag/algo and active MultiThread API](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepExtrema/BRepExtrema_DistShapeShape.hxx#L162-L175)
- [Quadratic box-pair loop](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepExtrema/BRepExtrema_DistShapeShape.cxx#L398-L452)
- [Candidate generation, sorting, parallel narrow phase](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepExtrema/BRepExtrema_DistShapeShape.cxx#L472-L587)
- [BoxCalculation uses BRepBndLib::Add](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepExtrema/BRepExtrema_DistShapeShape.cxx#L58-L66)
- [ArgumentAnalyzer forwards run-parallel to self-checker](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_ArgumentAnalyzer.cxx#L340-L369)
- [BRepCheck exact edge and parallel handling](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Analyzer.cxx#L369-L439)
- [Projection surface-only initialization for repeated points](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomAPI/GeomAPI_ProjectPointOnSurf.cxx#L190-L234)
- [Reusable sampled surface initialization](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Extrema/Extrema_GenExtPS.cxx#L502-L568)
- [Offset API limitations, rounded versus intersection joins](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_MakeOffsetShape.hxx#L44-L105)
- [SelfInter implementation throws NotImplemented](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_MakeOffset.cxx#L2159-L2171)
- [MakeOffsetShape self-intersection removal call commented out](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_MakeOffset.cxx#L924-L943)

## Required benchmark coverage

Use ordinary analytic box/cylinder, outward rounded joins, concave and through-hole
collisions, spherical/toroidal closed hollows, canonicalized cylindrical splines,
genuine freeform bent sweep, conservative metadata and periodic trim inputs.
Cover no openings, one opening, both caps and adjacent openings; signed thickness;
rigid transforms; accepted/rejected outcomes; preserved entity IDs and source
immutability. Include deliberately invalid boundary and self-intersection controls.
The existing body-shell geometry/source-precision/sweep suites and captures cover
much of this matrix. Coordinate with orchestrator rather than running those here.
