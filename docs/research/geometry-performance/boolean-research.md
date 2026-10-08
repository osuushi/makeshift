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
