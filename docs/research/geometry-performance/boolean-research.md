# Boolean and extrusion performance: source investigation

Research date: 2026-10-08. Research-only lane: no benchmarks, compilation,
installation, code changes, or commits performed. The orchestrator owns significant
compute through `/tmp/makeshift-geometry-compute.lock`.

Evidence baseline: Makeshift `7861122fb791c71692d7b48a70bfcb3a381fc95a`;
configured OCCT 7.9.3, commit `a016080bf6738d6aeae020badee4e888ad1540a5`.
All performance effects below are hypotheses until the experiment record confirms
them. Sources establish mechanisms, not speedups or Parasolid comparisons.

## Main findings

1. The primary Boolean helper already avoids eager two-shape constructors and
   enables non-destructive processing and OCCT parallel execution. It is not
   accidentally building each Boolean twice through its constructor.
2. Implicit extrusion target detection constructs an entire Common result and
   integrates its volume; the final Cut/Common repeats the same intersections.
   Explicit targets in a non-auto mode already skip this detection pass.
3. Exact-volume integration and validity checks recur around each Boolean and
   again during result extraction/presentation. Curved-shape volume uses expensive
   adaptive, span-aware quadrature. Removing repeated identical measurements is
   lower risk than reducing precision or dropping correctness checks.
4. Selected-body Booleans and multi-profile fuses are left-fold operations. Batch
   Fuse/Cut and prepared-intersection reuse are existing OCCT capabilities to test
   before inventing a kernel fork.
5. The pool defaults to all reported logical processors. That need not match
   container CPU quota or available compute. Thread-count tuning is directly
   available through `MAKESHIFT_KERNEL_THREADS`.

## Makeshift source observations

Links below are immutable to the baseline; local working-tree edits may differ.

- [booleans.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/booleans.cpp):
  `booleanShape` creates an empty Fuse/Cut/Common, assigns one argument and tool,
  chooses the existing cubic contact budget, and calls Build once. It then
  validates and maps Modified/Generated/Deleted history for source entities.
  Subtract first runs a validity check to trigger periodic-face repair; a valid
  first result is checked again by `validate`. `solids` checks each resulting
  solid again and computes `volume` to reject negligible solids. `booleanBodies`
  applies each selected body sequentially, growing both the result and origins.
- [geometry.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/geometry.cpp):
  `sweep` validates each extruded profile and sequentially fuses the profile tools.
  `calculateSweep` first rejects disjoint AABBs. Union target selection uses
  exact distance. Other implicit modes construct Common and integrate its volume
  against `1e-10`; auto may additionally calculate distance. The final selected
  target loop constructs Cut or Common again. For explicit targets with mode
  other than auto, the loop skips overlap detection.
- [main.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/main.cpp):
  `decode` validates all supplied bodies and `operands` recomputes geometry
  signatures for serialized topology identities. `volume` scans surface types;
  curved shapes get optimal bounds and adaptive Gauss-Kronrod integration across
  spans at `1e-10`, with up to three reference planes if integration fails. Pool
  sizing defaults to `OSD_Parallel::NbLogicalProcessors`, overridable by environment.
  Emscripten uses one thread. Costs attributable to these paths must be separated
  from actual intersection/kernel construction costs.
- [presentation.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/presentation.cpp):
  `present` meshes, serializes, computes `volume(result.shape)`, then separately
  integrates volume properties at `1e-10` for center of mass. Bounds, blend/chamfer
  recognition, source matching and signatures add more surrounding exact-geometry
  work. A kernel-only improvement may disappear in end-to-end timings if these
  dominate. Reusing one mass-properties result needs care: the current two
  integration methods are not identical for splines.
- [extrude-symmetric.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/extrude-symmetric.cpp):
  symmetric extrusion constructs two half-solids, validates them, integrates each,
  fuses them, validates again and integrates the result for conservation. A simple
  untwisted, undrafted symmetric extrusion could instead translate the profile
  by minus half the travel and construct one full-depth prism. This is exact
  geometry and avoids a Boolean; draft/twist semantics require separate treatment.
- [extrude-draft.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/extrude-draft.cpp):
  an ordinary extrusion is already `BRepPrimAPI_MakePrism`, preserving analytic
  construction. Analytic drafted boundaries offset and loft; holes require
  sequential Cuts and volume-conservation integration. Curved boundaries take
  another draft path. Do not attribute all extrusion costs to MakePrism.
- [cleanup.cpp](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/cleanup.cpp):
  explicit cleanup protects unselected boundaries, selected vertex relationships,
  and decoration-owned edges. Its conservation expression computes the same
  input volume twice. Globally calling SimplifyResult after every Boolean would
  bypass these topology intentions even if material volume remains unchanged.
- [setup-kernel.mjs](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/scripts/setup-kernel.mjs),
  [occt-recipe.json](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/scripts/occt-recipe.json):
  production SDK is a shared Release build, TBB off, with a pinned rounded-offset
  precision adaptation. Check actual installed SDK/build receipt before diagnosing
  unoptimized binaries. TBB off does not mean OCCT native thread-pool parallelism
  is disabled. Changing build flags must update SDK provenance/cache keys.

## Existing OCCT opportunities and constraints

### Prepared intersections

Pinned [BooleanOperation::Build](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BooleanOperation.cxx#L113)
conditionally computes intersections then constructs the operation's result.
The prepared-PaveFiller constructor allows skipping that first stage.

Pinned [BuilderAlgo implementation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BuilderAlgo.cxx#L34)
stores the external filler pointer; its Clear/destructor only owns fillers that
it created. BuildResult consumes precomputed intersections. Therefore retain
the filler for the complete lifetime of all operations using it. Configure
fuzzy tolerance, parallelism, safe-input and bounding options on the filler before
Perform. Changing builder flags afterward cannot retroactively change intersections.

Experiment: one non-destructive PaveFiller for each unchanged body/tool pair;
build Common for exact target semantics then Cut using the same filler. For
intersect mode, retain the already computed Common result rather than rebuild it.
The periodic repair path changes the argument and must invalidate/recompute the
filler. Do not reuse after transforms, tolerance changes, shape mutation or repair.
Measure memory as well as time when many candidate bodies keep fillers alive.

### Multi-argument Fuse/Cut

Pinned [BOPAlgo_BOP interface](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_BOP.hxx#L25)
describes operation groups: Fuse joins groups, Cut subtracts one group from another,
and Common intersects groups. Fuse all selected solids or Cut all selected tools
in a single operation to avoid successive reprocessing of an increasingly
fragmented intermediate. Benchmark sparse cutters, mutually overlapping cutters,
touching tools and dense intersections: batching can also increase work/memory.

Critical semantic constraint: Makeshift's sequential intersect means
`A ∩ B ∩ C`. A grouped Common with `A` as argument and `B,C` as tools does
not generally mean that same three-way intersection. Do not replace that fold
without demonstrating set equivalence. Batch histories can also differ from
composed histories; validate stable IDs, tags and decoration attachments separately.

### Disable unused history

Pinned [BuilderAlgo declarations](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BuilderAlgo.hxx#L156)
expose `SetToFillHistory(false)`. Use it only when no mapping consumer needs history.
Temporary overlap Common and half-solid union have empty origins today; production
operations with body entities require history. Validate retry/repair requirements
before switching it off even on temporary operations. Expected benefit is uncertain.
The same API exposes simplification, but it affects the entire result, including
unchanged tangent faces/edges; automatic global simplification is not authorized by
material correctness alone. Test downstream performance separately from operation
cost and preserve intentional topology boundaries.

### Oriented boxes and tolerance

Pinned [BOPAlgo_Options](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_Options.cxx#L43)
defaults OBB usage to false. It also clamps requested fuzzy tolerance to at least
Precision::Confusion; Makeshift setting zero does not create zero-tolerance Booleans.
Test `SetUseOBB(true)` for slanted thin features or long oblique tools with loose
AABBs. OBB construction adds cost, so a win on those cases does not justify a
global default. Do not enlarge fuzzy tolerance as a general speed optimization:
it changes contact semantics and can absorb small features.

### Gluing and inverted-solid checks

Pinned [GlueEnum contract](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_GlueEnum.hxx#L15)
requires arguments without real intersections. Partial coincidence can skip
face/face intersection work; full coincidence skips additional categories. OCCT
does not check the precondition; invalid selection can silently produce wrong
results. Restrict experiments to construction-proven face-adjacent shapes such as
simple symmetric prism halves. One-prism construction is preferable there if
possible. Arbitrary body contact or equal support surfaces do not prove gluing safe.
Disabling inverted-solid checks likewise requires an established orientation
contract; BRep validity alone should not be assumed to prove that contract.

### Thread count and eager constructors

Pinned [OSD_ThreadPool](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_ThreadPool.hxx#L20)
documents a persistent pool, defaults tied to logical processors, and launchers
normally occupying all available pool threads. DefaultPool's size argument only
takes effect at first initialization. Run fresh processes for thread-count trials;
record CPU quota, affinity and throttling, not just host logical CPUs. Compare
1, 2, 4 and quota-aware limits, with small and large analytic/spline cases.

Pinned [Fuse constructors](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_Fuse.cxx#L21)
confirm that the empty constructor defers Build whereas two-shape constructors
perform it immediately. The primary helper is already correct. Audit other
eager constructors only if later setters or explicit Build calls follow them.

## Ranked experiment queue

| Priority | Hypothesis | Evidence / expected reach | Effort and risk |
| --- | --- | --- | --- |
| 1 | Limit pool to available quota; measure small-operation serial crossover | Existing override; resource mismatch plausible, effect unmeasured | Very low effort; correctness low risk; hardware-dependent |
| 2 | Reuse identical volume measurements and subtract validity result | Repeated source calls established; curved integration may dominate | Low to medium effort; preserve precision and invalid-shape rejection |
| 3 | One full-depth prism for plain symmetric extrusion | Two halves + Fuse established; exact specialized alternative | Low effort; test signs, holes, origins and bounds |
| 4 | Reuse Common result / prepared intersections during target detection | Same unchanged pair processed twice | Medium effort; filler lifetime, retry and history constraints |
| 5 | Batch Fuse and multiple-tool Cut | Sequential fold established | Medium effort; topology histories, tolerances and memory regressions |
| 6 | Disable unused history for temporary operations | Existing API; empty origins in several paths | Low effort; savings unknown; repair may still need history |
| 7 | OBB for oblique/high-AABB-overlap cases | Existing disabled option | Low effort; overhead/regressions may outweigh pruning |
| 8 | Profile-driven kernel patches | Stage boundaries available | Higher effort/maintenance; optimize only demonstrated hot paths |

## Kernel patch directions after profiling

Pinned [PaveFiller::PerformInternal](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_PaveFiller.cxx#L226)
separates vertex/vertex, vertex/edge, edge/edge, vertex/face, edge/face,
face/face, repeated-intersection, block building, pcurve and degenerate-edge stages.
Instrument these boundaries or sample stacks. Broad-phase pruning, expensive
numerical intersections, rebuild/repair and classification require different fixes.
Count candidate pairs and completed interferences alongside time; operation
progress weights are not measured timing shares.

Potential fork experiments, conditional on profiles: tighten conservative bounds
for polynomial/spline spans; reuse surface/curve projection preparation inside
unchanged pair calculations; improve task granularity for many cheap pairs;
avoid repeated allocation or geometry-adaptor setup in demonstrated inner loops.
Never skip a candidate based on approximate samples alone. Any bound must remain
conservative with trims, locations and tolerance envelopes, including periodic seams.
Avoid fast-math as a baseline shortcut: numerical branch decisions and robustness
need explicit evidence. Compare Release/LTO/PGO only after confirming the actual SDK.

Before adopting a fork, track source patches and build provenance in the existing
recipe/source-packaging mechanism. OCCT licensing and exception texts must accompany
the corresponding sources; assess maintenance against measured gains. No upstream
implementation was copied in this research.

## Acceptance probes

Use touching vs positive-overlap, contained tools, no-op/disjoint tools, near
tangency, periodic cylinders, cubic approximation boundaries, spline face partitions,
multi-solid results and tiny valid solids. Include tagged-group/decoration continuity,
Undo/reopen and a subsequent shell/fillet/projection on resulting geometry. Compare
set differences or occupancy/dimensions as well as volume: equal volume and face
counts alone can hide changed material or naming. Preserve `1e-10` target-selection
semantics separately from `minimumSolidVolumeMm3 = 1e-12` output filtering.

No candidate in this document is ready for integration solely on source evidence.

## Smallest application change for intersection reuse

Source-only design follow-up, 2026-10-08. Current working tree now carries
orchestrator changes such as `Result::exactVolume`; those do not remove the
Common-detection/final-operation duplication described above. No application
mutation or benchmark performed by this lane.

### Step 1: reuse implicit intersect's existing result and mapping

For `mode == intersect` without an explicit target list, the smallest change
needs **no prepared-filler API**. During target detection assemble actual origins
(`body.entities` then `toolOrigins`) rather than the currently empty vector.
Call the existing `booleanShape(body.shape, tool, intersect, origins)` once,
retain its Common shape and mapped origins when its whole-shape volume exceeds
the unchanged `1e-10` positive-overlap threshold. In the final intersect loop
pass those retained values to `solids` and retain the existing participants and
`{body.id}` predecessor-body policy. Mapping origins does not affect construction;
it supplies the same Modified/Generated/IsDeleted correspondence now computed
by the repeated second Common. Keep validation and per-solid filtering intact.

Store request-local candidates keyed by the stable Operand address or index in
the unchanged const `bodies` vector. Retain shape and origins together; a Common
shape alone loses correspondence. Explicit non-auto targets bypass detection
today, so leave that route on its original single operation. Auto resolves to
subtract or union, never intersect; it does not need this result-only fast path.
No new global shape cache or document mutation is needed.

Do not reuse detection's whole-common volume as each output solid's volume. A
Common may produce multiple disconnected solids, or lower-dimensional contacts;
`solids` must still validate/filter/integrate each solid. Boundary-only contact
remains excluded by the whole-shape positive-volume threshold. Preserve the
distinction between detection `1e-10` and output `1e-12` volume budgets.

### Step 2: retain the probe operation to share its filler with Cut

Implicit subtract and auto-positive targets need different result assembly after
the same intersections. A small move-only request-local `BooleanProbe` can own
the already-built Common operation rather than constructing a separate standalone
PaveFiller. That Common already owns its DSFiller and has the correct arguments,
fuzzy budget, non-destructive and parallel settings. Retain it for positive
targets; destroy rejected candidates promptly. Factor the existing helper into
construction, validation/periodic retry, and origin mapping so the old direct API
and probe finishing path share behavior. Keep this bounded in a Boolean module;
do not scatter separate mapping copies into geometry.cpp.

At finishing, construct an **empty prepared** `BRepAlgoAPI_Cut(*probe.DSFiller())`,
assign arguments exactly `[body.shape]` and tools exactly `[tool]`, apply the same
parallel builder setting, and Build once. Source references remain pinned:
[BuilderAlgo borrowed-filler ownership](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BuilderAlgo.cxx#L34),
[BooleanOperation conditional intersection](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BooleanOperation.cxx#L113).
Do not call Common.Build again: that clears/replaces its owned filler. Ensure
borrowed Cut is destroyed before its Common owner. A retained Common can also
finish intersect by mapping actual origins through its original history rather
than storing mapped origins in Step 1; choose one coherent implementation if
both steps are adopted together.

For subtract, origin mapping must use the **Cut's** history, not Common history.
Do not map origins through Common and then feed that truncated mapping to Cut:
material outside Common survives subtract. Construct final origins from untouched
body/tool entities, apply normal Cut mapping after it succeeds, and preserve the
existing invalid-cut repair behavior. `splitFailedCutFaces` consults the failed
Cut's Modified history to identify implicated cylinders and remaps origins onto
prepared source topology. The repair changes the first operand, so the retry
must create a normal fresh Cut/filler on the prepared shape. Never reuse the old
probe filler with that repaired source.

### Configuration and lifetime constraints

Pinned [BOPAlgo_Builder::PerformWithFiller](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_Builder.cxx#L202)
copies non-destructive, fuzzy, glue and OBB options from the supplied filler.
Consequently setting different intersection options on the borrowed Cut cannot
retroactively alter preprocessing. Capture the original exact pair and config
in the probe; reject reuse after changed shapes, locations, orientations, bounds
policy, fuzzy budget or repair. Set parallelism consistently on probe and final
builder, but avoid global pool changes between these operations. Keep history
collection enabled where repair or final source mapping needs it.

Detection and final operations currently do not simplify results. Do not add
SimplifyResult to the reuse experiment, and do not simplify the retained Common
or mutate/mesh its arguments before final Cut. Retaining the operation rather
than just DSFiller/shape provides history and lifetime ownership. Builders using
the same filler should run sequentially; non-destructive protects arguments but
does not establish that filler internals are immutable or safe for concurrent
builders. Result-building state and tolerances should be compared against the
baseline on repeated Common→Cut and Common→Common probes.

Auto with explicit targets is subtle: target selection ultimately uses the
explicit list, including targets whose bounds failed or whose Common had no
positive volume. Keep an optional probe per body and fall back to the original
operation wherever no probe exists; do not accidentally shrink the explicit
selection to the positive list. Auto can switch to union if no positive target
exists; its sequential growing Fuse operands differ from detection body/tool
pairs and must not borrow those fillers. Preserve mode/participants behavior.

Keep one filler per actual pair. Sharing a tool across several bodies does not
make one pair's filler valid for another body. Whole bodies may contain multiple
solids; do not flatten arguments to a different set just for caching. Map final
origins through the whole operation, then let existing `solids` enumerate outputs
with unchanged predecessor-body policy. Retaining all candidate fillers raises
peak memory; measure this alongside speed, and restrict retention to positive
targets unless explicit-auto semantics require keeping a particular probe.

### Acceptance before implementation adoption

Benchmark three independent savings: Common-only result reuse, Common→Cut with
shared filler, and unchanged direct explicit-target path. Cover analytic/cubic
contact, tangency, contained tools, two-body through-cut, multi-solid output,
empty lower-dimensional Common, multiple candidates, explicit-auto including
disjoint selected bodies, and the periodic cylinder repair fixture. Verify exact
volume/set differences and topology signatures plus tag/decoration continuation,
face/edge selections and downstream operations. Compare origin correspondence
sets separately from incidental order; body participants and predecessor-body
order remain part of the existing application behavior. Retain raw timing and
memory samples before claiming that preprocessing dominates.
## Streaming positive Common-to-Cut experiment (2026-10-08)

Artifact: [patches/streaming-sweep-cuts.patch](patches/streaming-sweep-cuts.patch),
Initially against committed geometry.cpp at
ced39f05be1ab99d8d283a420bb9fc0883fb0286, now rebased onto that production working
tree plus the uncommitted twistedVolumeReferenceAxis hint. Exact base geometry.cpp
SHA256: c0cdba8e53862bd70601e0c112d3f174fa03e283386ac3224ad9fe6468527775.
It adds a small header-only
StreamingSweepCuts helper and changes calculateSweep. The prototype was made in
/tmp working copies and a durable diff; **no production native file was edited**,
and no build/benchmark was performed in this lane. The patch application check
passed against current source at handoff. Geometry remains 236 lines, helper
38; modified calculateSweep and helper functions stay below 80 lines.

Rebase audit: both hinted solids calls remain byte-for-byte unchanged: New
passes twistedVolumeReferenceAxis(input), and Union passes the hint only when
selected is empty. Streaming Subtract neither consumes nor changes the hint.
Helper review found no retained probe/filler pointer: add() executes while its
caller-owned Common remains alive and returns only the BRep value/origins.
Body pointers remain valid because the const operand vector outlives the
function-local helper. Completed outputs retain necessary topology handles;
they do not retain the Boolean builder. Null output still counts as a handled
pair and keeps the participant, matching the old solids() behavior.
Final ordered append checks a stored failure before solids(); unknown/disjoint
explicit targets return false and retain the existing fallback. No broader
exception-scheduling guarantee than the limitations below is asserted.

### Goal and retained contracts

The orchestrator reports about +14 MB peak memory on the 16-body cubic fixture
when retaining each positive Common's PaveFiller through the classification
pass. This candidate keeps the latency benefit of pair preprocessing reuse,
immediately finishes each positive implicit Subtract/Auto Cut, then destroys
that pair's Common/filler before classifying the next body. Only Cut shape,
mapped source/tool origins, body pointer and optional exception are retained.
Output geometry/origins remain necessary memory; total request memory is not
claimed constant-space.

- Eligibility, targets, body order, box broad phase, positive-volume threshold
  and Auto contact tests are unchanged.
- Common/prepared Cut use the existing operand pair, non-destructive mode,
  fuzzy/cubic budget, thread policy and builder/history APIs.
- Each Cut's origins start with body entities plus tool origins; Common history
  does not truncate them.
- Early successful outputs go through existing solids() only during the final
  selected-body pass. Participants/order and multi-solid filtering stay there.
- Explicit Subtract keeps its original direct Boolean fallback. Explicit Auto
  positive pairs stream; disjoint selected bodies have no cached Cut and retain
  their fallback if Auto resolves to Subtract.
- With no positive pairs Auto retains neutral Union and the same explicit/contact
  selection and independent-tool behavior.
- Implicit Intersect keeps its separate retained-Common result/history route.
- Invalid Cut repair stays in finishBoolean: splitFailedCutFaces changes the
  private source, requiring fresh preprocessing with the original fuzzy budget.

### Error ordering: deferred geometry failures, remaining limits

Naive streaming changes observable errors: Cut on A could fail before Common
classification on B, whereas previously B's classification failure wins.
The prototype stores early Cut exceptions in std::exception_ptr and continues
classification. Later classification errors still propagate directly and take
priority. After successful classification, the original selected-body loop
rethrows stored failures at their body positions. Earlier disjoint-body fallback
errors or solids-validation errors retain priority over later stored failures.
Successful solid splitting/mass validation is deferred to this final pass.

This preserves ordinary exception priority, not every runtime effect. More Cuts
can execute before an earlier final failure is replayed, so cancellation,
progress, signal faults and allocation failures can differ. Failed allocation
while storing a pending entry cannot reliably be deferred. Kernel caches see a
different evaluation order. Inputs must remain immutable; source-encoding checks
must accompany parity tests. If strict phase/error scheduling is a product
contract, retain the current two-phase path or use a bounded/recomputed strategy.

Retained exception objects may own diagnostic resources; failure-heavy requests
need memory coverage. Catching C++ exceptions here preserves phase priority; it
does not promise recovery from corrupted kernel state or memory exhaustion.

### Concrete measurement and acceptance

Apply only in an isolated build after the orchestrator's queued checkpoint.
Compare repeated independent Common/Cut baseline, current retained-fillers reuse,
and streaming reuse. Use the 16-body cubic high-memory request and 1/4/8/16-body
scaling where practical. Measure peak RSS and randomized paired latency serially
under the compute lock. Lower live-filler count need not lower RSS: freed allocator
arenas can remain reserved, and result geometry/origins remain live.

Require full response/encoding/history/participants/mode parity on implicit
Subtract, positive/neutral Auto, explicit Auto with disjoint targets, eligibility
filters, multiple solids, near-threshold volumes, cubic contacts and repaired
periodic cuts. Implicit Intersect is a regression control. Check source encodings
before/after and filler lifetime. Failure controls: early Cut/later classification,
early disjoint fallback/later cached Cut, early solids validation/later Cut.
Reject gains that lose correspondence, immutability or pair-reuse latency.

### Completed serial confirmation: latency and retained-filler memory

The orchestrator applied and built this candidate separately. The saved
[20-block metadata](results/streaming-cuts-memory-confirmation.jsonl.metadata.json)
identifies noReuse (`/tmp/makeshift-kernel-construction-reuse`), retained
(`/tmp/makeshift-kernel-twist-volume-axis`) and streaming
(`/tmp/makeshift-kernel-streaming-cuts`). Fixture construction uses a separate
process that closes before sampling. Every timed sample uses a fresh process;
request order is randomized within paired blocks. These are whole-request
measurements, including existing validation and presentation work, not isolated
Boolean timings. Cubic/perforated fixtures have 6/31 faces respectively.

[Latency confirmation](results/streaming-cuts-latency-confirmation-summary.json)
contains 20 successful samples per variant/case. Speedup is the paired median
baseline/candidate ratio; confidence intervals use paired bootstrap resampling.

| Implicit Subtract fixture | noReuse median ms | retained median ms | streaming median ms | streaming/noReuse speedup, 95% interval |
| --- | ---: | ---: | ---: | --- |
| cubic, 1 body | 79.51 | 64.67 | 66.68 | 1.204 [1.172, 1.236] |
| cubic, 16 bodies | 807.48 | 624.11 | 624.29 | 1.297 [1.275, 1.327] |
| perforated, 1 body | 178.52 | 176.45 | 172.46 | 1.039 [1.006, 1.055] |
| perforated, 16 bodies | 2380.77 | 2294.85 | 2300.25 | 1.033 [1.010, 1.056] |

The [direct retained comparison](results/streaming-cuts-versus-retained-latency-summary.json)
is derived from **these same paired blocks**, not an independent replication.
Streaming/retained speedup is 0.991 [0.928, 1.021] for cubic n1,
0.985 [0.959, 1.026] for cubic n16, 1.000 [0.979, 1.032] for
perforated n1 and 1.002 [0.990, 1.018] for perforated n16. No latency change
between reuse strategies is resolved here; crossing 1 is not a formal
noninferiority/equivalence test. Pair-preprocessing reuse versus noReuse is the
measured latency gain, while streaming addresses its lifetime/memory cost.

[Memory confirmation](results/streaming-cuts-memory-confirmation-summary.json)
uses process VmHWM, including native startup and the sole request, read outside
the elapsed request timing. It is not a sampled per-request peak delta. MiB is
proc KiB/1024. Intervals below are 10,000 seeded paired-block resamples of median
absolute differences; subtracting independent medians need not give that value.

| Fixture | noReuse HWM median MiB | retained HWM median MiB | streaming HWM median MiB | streaming minus retained MiB, 95% interval |
| --- | ---: | ---: | ---: | --- |
| cubic n1 | 24.520 | 24.773 | 24.770 | -0.002 [-0.092, 0.035] |
| cubic n16 | 29.320 | 44.000 | 29.412 | -14.531 [-14.693, -13.834] |
| perforated n1 | 29.992 | 30.152 | 30.152 | 0.000 [-0.086, 0.010] |
| perforated n16 | 87.033 | 88.508 | 87.092 | -1.414 [-1.641, -1.041] |

The [direct memory comparison](results/streaming-cuts-versus-retained-memory-summary.json)
also gives cubic n16 RSS reduction 14.281 MiB [14.099, 14.861]. Streaming
minus noReuse HWM at n16 is +0.100 MiB [-0.072, 0.328] cubic and
+0.043 MiB [-0.293, 0.637] perforated. Thus this fixture recovers the large
retained-filler footprint without a resolved replacement footprint at n16;
allocator behavior and necessary output storage still prevent a constant-memory
claim.

### Eight-block explicit Auto and scaling controls

[Auto latency controls](results/streaming-cuts-auto-controls-latency-summary.json)
and [memory controls](results/streaming-cuts-auto-controls-memory-summary.json)
compare retained versus streaming for 14 cases, 8 paired blocks each: implicit
Subtract n4 for both fixtures, and explicit Auto n1/n4/n16 with only overlapping
targets or those targets plus one explicitly selected disjoint body. All latency
intervals cross 1. Explicit Auto n16 streaming medians are cubic 612.56 ms
(overlap only) / 622.52 ms (extra disjoint), and perforated 2313.43 / 2443.32 ms.
Their speedups are respectively 0.989 [0.965, 1.005], 0.983 [0.962, 1.093],
1.001 [0.973, 1.020], and 0.973 [0.961, 1.012]. These controls support preserving
the disjoint explicit-target fallback without an established latency penalty;
8 blocks provide less statistical power than the primary confirmation.

Cubic n4 HWM drops 2.516 MiB [2.158, 2.848] for explicit Auto overlap only
and 2.113 MiB [1.984, 2.539] with the extra disjoint target; n16 drops
14.602 MiB [13.164, 14.859] and 14.221 MiB [13.539, 14.746]. Perforated n16
also drops 1.494 MiB [0.770, 1.953] and 1.340 MiB [1.055, 1.879]. Memory
is **not uniformly improved**: perforated n4 explicit Auto with an extra
disjoint target increases HWM 0.561 MiB [0.477, 0.652] and RSS 0.906 MiB
[0.848, 2.297]. Its overlap-only n4 HWM interval crosses zero, while RSS
increases 2.107 MiB [0.594, 2.215]. Do not extrapolate the cubic high-memory
benefit to every operand family or allocator pattern.

### Evidence available and remaining correctness coverage

All primary and Auto timed outcomes matched the saved ordered comparison and
face/edge geometry/predecessor multisets; all requests succeeded. Representative
full replies matched all fields except BRep string contents, with numeric
comparison tolerance 1e-9 and metadata/display/topology order retained. This is
not byte-identical BRep evidence and not a complete full-reply capture for every
sample. The saved [regression log](results/regression-streaming-cuts.log) reports
26 tests passed, zero failures. The separate 28-case full-output comparison
matched the sweep/Boolean cases. Its untouched shell path had a thickness target
index difference; repeated shell baseline itself subsequently varied. See
[presentation-research.md](presentation-research.md) and preserved repeat
captures for that unresolved geometry-region/tie evidence rather than treating
indices or equal thickness values alone as equivalence.

Current source eligibility audit confirms filters run **before** classification
or cached Cut creation. Explicit non-Auto modes skip probing as before. Only
positive-volume implicit Subtract and positive-volume Auto pairs stream;
explicit Auto still selects its entire filtered target list after resolving
mode, so disjoint targets use the old ordinary Cut fallback. No-positive Auto
executes unchanged Union; implicit Intersect retains its own Common route.
Participants are appended in original selected order before cached-result
handling; solids splitting, mass filtering, final validation and origin/history
correspondence are deferred to that same final pass. Operand pointer keys stay
valid for this request, and no retained Pending item owns a PaveFiller.

Source inspection supports the exception-priority design described above, but
successful benchmarks do not test it. Remaining targeted controls are early
cached Cut failure plus later Common/volume failure, early disjoint fallback
failure plus later cached Cut failure, and earlier solids-validation failure
plus later cached Cut failure. Eligibility exclusions, neutral/contact-only
Auto, multi-solid outputs, threshold/cubic-contact boundaries, repaired periodic
Cuts and source encodings need explicit coverage identified by case, rather than
assuming the passing general suite covers them. Allocation failure during
pending insertion, cancellation, kernel progress/global state and additional
work before a replayed failure retain the documented scheduling limits. No
source-only audit proves that earlier Cut execution cannot influence a later
Common through shared/global mutable kernel state; non-destructive inputs and
output parity are the current controls, not a universal proof.

### Focused streaming contract harness prepared (not executed)

[verify-streaming-cuts.mjs](../../../tests/geometry-performance/verify-streaming-cuts.mjs)
accepts `BASELINE CANDIDATE OUTPUT.jsonl`. It constructs shared serialized fixtures
through the baseline Client and existing square/cubic case helpers, then executes
serial requests in alternating binary order, three repeats per case. Coverage:
eligibility filters and empty eligibility, eligible/explicit-target intersection,
implicit cuts splitting one/two stocks into multiple solids, target-list versus
body traversal order, explicit Auto with disjoint targets first/last, neutral and
contact-only Auto, empty/disjoint Subtract errors, implicit Intersect control,
and cubic Subtract. Contained nominal 1e-12/1e-9 tools straddle the 1e-10 Common
volume classification threshold. These are nominal geometric expectations to
verify, not recorded runtime behavior or injected kernel failures.

The harness retains raw replies, ordered **exact** full metadata comparisons
(no numeric tolerance), repeated-response differences, expectations and separate
BRep hashes. Only existing string-valued BRep content is excluded from metadata
comparison; missing/type-changed BRep fields still fail. Any cross-binary metadata
or expected-contract failure exits nonzero. Repeated same-binary differences are
retained as diagnostic evidence rather than automatically blamed on streaming.

Before/after source inspect replies preserve re-encoding hashes, while original
JS serialized operand strings are checked unchanged. Important limit: inspect
decodes fresh topology each request. Stable hashes do not prove that a Cut left
its own request-local decoded TShapes untouched; that requires a native pre/post
encoding control inside the request. True repaired periodic Cut and deferred
kernel exception precedence are explicitly **not** covered by these ordinary
fixtures. This source-only lane has not run the harness or a geometry process;
the orchestrator owns execution under the shared compute lock.

## Disjoint explicit Union compound bypass: source-only audit

No implementation/build/benchmark in this lane. A sufficient spatial separation
test could avoid intersection preprocessing for genuinely disconnected Union
operands, but a raw Add-box test and compound assembly are not a complete
drop-in replacement for booleanShape.

### Two concrete blockers to a blanket shortcut

**Raw Add boxes do not incorporate every incident vertex tolerance.** Pinned
[BRepBndLib::Add](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBndLib/BRepBndLib.cxx#L82)
expands surface/edge bounds by their respective tolerances, but its final vertex
loop covers vertices *not in edges*. An incident vertex can carry a larger
tolerance than its edge. Pinned
[BOPDS::Init](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPDS/BOPDS_DS.cxx#L347)
instead builds each vertex box with vertex tolerance plus half
max(fuzzy, Precision::Confusion), unions vertex boxes into edge boxes and those
into face boxes, adding this half-budget at each stage. Thus raw Add boxes
separated by just fuzzy+Confusion are not a source-proven guard for all BOP
candidate interactions.

**Compound Add can change shared mutability flags.** Pinned
[TopoDS_Builder::Add](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopoDS/TopoDS_Builder.cxx#L42)
sets aComponent.TShape()->Free(false) before checking container compatibility.
A TopoDS value copy still shares that TShape. This does not move geometry or
change incidence, but can alter a builder mutability flag visible in serialized
state and subsequent builders. Do not claim universal encoded/flag immutability
from const parameters.

The application inputs are decoded request-local shapes, rather than the live
accepted document objects. Moreover the existing
[BOP::BuildRC](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_BOP.cxx#L763)
also adds untouched source shapes into its result compound. Its non-destructive
policy is not a blanket promise that no Free flag is written. Source inspection
therefore identifies a **potential** flag difference, not a newly proven
geometric/topological regression. Capture flags and encoding in both baseline
and shortcut; root flags may already be frozen on particular decoded inputs.
Encoding normalization alone must not hide a changed flag contract.

### Safest first geometry assembly route

Use BRepBuilderAPI_Copy(source, false, true) to create private topology for each
operand before adding it to a new identity/forward compound. The copyGeom=false
route shares exact support geometry and pcurves, retains tolerances and copies
topological objects. Pinned
[CopyModification](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_CopyModification.cxx#L30)
does not clone geometric support when that option is false. With copyMesh=true
and copyGeom=false, triangulation/polygon handles are **shared**, not deep copied;
this is not a promise of mesh isolation. Later meshing and topology flag behavior
need explicit source-encoding checks. copyMesh=false would drop mesh data on
geometric faces and can change remeshing/output behavior.

Map each original source entity through that operand's Copy.ModifiedShape,
preserving its ID, order and multiplicity, rather than leaving origins pointing
at replaced topology. Verify all mappings and location/orientation retention.
Copying only the root using EmptyCopied and then adding original children can
freeze shared child flags; it is not automatically equivalent isolation.
Topology copying costs allocations and may erase the expected gain on tiny
operands, so measure it separately from skipped BOP work.

### Proposed sufficient guard and narrow scope

Start with two valid, closed, forward-oriented solid operands only. Obtain the
**same** cubic-dependent fuzzy value as buildBoolean, with no lowered budget.
Use Add(shape, box, false), explicitly union every vertex point box expanded
by its vertex tolerance, then add a generous per-operand guard exceeding the
three half-budget BOP propagation stages. A per-operand 2*max(fuzzy, Confusion)
guard is a source-derived conservative candidate for these stages; it still
needs auditing against other iterator/narrow-phase increases before being
described as a complete proof. A coordinate-scale roundoff allowance and strict
finite, nonvoid, closed-box checks are also needed for large placements.
Fail closed to ordinary Fuse if any premise is uncertain. Do not use display
mesh-only boxes, AddOptimal with useShapeTolerance=false, or geometric distance
zero as this separation predicate.

Limit the first experiment to exactly two explicit Union operands with no
later growing-union step. The aggregate box of previously disconnected
components can overlap another operand despite actual disjointness; repeated
compound nesting also changes traversal order and result grouping. Multi-input
partitioning or per-component pair tests would be separate work.

Validate both input/private operands and the compound with the same existing
validate policy, then keep solids() per-solid validation, measured mass filtering
and result construction. Do not use this path to accept invalid/open solids
that the kernel previously rejected or repaired. Check error precedence too:
new early checks can report different errors than original Fuse construction.

### Output, history and ordering acceptance

On separated valid solids the mathematical Union is their disconnected set,
but that does not prove identical OCCT history or representation order.
The baseline may return originals, reorder faces/solids, reconstruct a shell,
or normalize metadata even without cross-operand intersections.

- Preserve selected IDs, keepOriginals participants, predecessors and each
  resulting body's origins exactly. Existing booleanBodies associates all
  selected predecessor body IDs with each Union result; do not independently
  relabel descendants by the compound component that contains them.
- Preserve entity IDs through explicit copy mapping, retaining repeated source
  origins. Do not claim original face IsSame identity after topology copy.
- Compare result-solid order, full faces/edges metadata, BRep, locations,
  orientations, triangulation, tolerances and minimum-volume filtering. Fast
  compound insertion order must match baseline traversal order, not an assumed
  operand-order contract.
- Test separately original geometric/topological state, exact encoding and
  Free/Modified/Checked flags on sources; report preexisting baseline flag
  effects rather than calling every source byte change a new shortcut defect.
- Reversed/inverted solids, compounds/multi-solids, open shells, missing curves,
  high vertex tolerance, periodic trim and overlap/contact must use fallback in
  the first candidate.

Controls: far boxes and cylinders, cubic boundaries with gaps just below/equal/
above the full guard, incident vertex tolerance larger than edge tolerance,
large translated/nested placements, same-TShape located instances, shared
geometry with private topology, retained originals and differing input mesh
states. Include a non-disjoint later operand as a fallback control. Require
positive valid masses and source immutability evidence, then randomized paired
latency/RSS with bounding/copy/validation setup charged to the request. A gain
from omitting validation or mesh work would not establish a Boolean optimization.
