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
