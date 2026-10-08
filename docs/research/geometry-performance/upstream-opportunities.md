# OCCT 8-era upstream opportunities for the pinned 7.9.3 kernel

Source-only audit, 2026-10-08. No builds, benchmarks, SDK mutations or application edits in this research lane. Baseline: OCCT `a016080bf6738d6aeae020badee4e888ad1540a5`. Commit dates below describe upstream changes; they do not establish that Makeshift executes the changed paths. Experimental timing evidence belongs in the orchestrator's records.

## Parallel exact validity: no demonstrated blocker from #1180

The release wording does **not** establish that Makeshift's fresh `BRepCheck_Analyzer(shape, true, parallel, true)` constructor is unsafe on 7.9.3. The relevant upstream [#1180 patch, `8d2d8650ca62cb927dec81dacdce82e8a47bedc8`](https://github.com/Open-Cascade-SAS/OCCT/commit/8d2d8650ca62cb927dec81dacdce82e8a47bedc8.patch) replaces a later optional `std::unique_ptr<std::mutex>` with an always-present mutex and a separate parallel flag. The changed BRepCheck critical sections already had conditional locks; this diff principally changes mutex ownership and guard construction. It removes the lazy allocation in `Result::SetParallel`. Other hunks protect Foundation globals, triangulation bounds and legacy TKBool mutable statics. Those have distinct triggering conditions and are not evidence that intrinsic parallel validation hits the same defect.

The following is an independent comparison with the actual pinned source, not an inference from the release summary:

- [7.9.3 Analyzer](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Analyzer.cxx): `Init` calls recursive `Put` serially. Every result gets `HR->SetParallel(myIsParallel)` before `Perform` starts `OSD_Parallel::For`. Each analyzer owns its result map; independent analyzers do not share these result objects.
- [7.9.3 Result](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Result.cxx): optional mutex storage is `Handle(Standard_HMutex)`, not the later unique pointer. Allocation occurs only when enabled and absent. No concurrent allocation is visible in this constructor route.
- [7.9.3 Standard_Mutex](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Standard/Standard_Mutex.hxx): pointer-taking `Sentry` explicitly handles null and otherwise locks the supplied mutex, unlocking at scope exit. Analyzer edge/wire status reads and result contextual map operations use this guard.

The lazy-allocation race would require multiple threads changing/initializing the **same** result's parallel state concurrently, or enabling it while another thread reads its mutex. That is a credible API misuse/hardening opportunity, but differs from serial initialization followed by worker execution. Likewise, changing global thread-backend settings while workers run differs from setting the backend once before requests. Shared triangulation cache writers/readers or simultaneous independent legacy TKBool operations deserve separate audits if introduced.

Recommendation: retain the present fresh-constructor parallel experiment; do not claim a complete thread-safety proof. A focused follow-up should compare serial/parallel validity and complete per-subshape status lists on malformed and shared-topology fixtures, then use a separately instrumented ThreadSanitizer kernel where feasible. Ordinary deterministic passes cannot exclude races. Keep configuration fixed throughout each call and shape geometry immutable during checks. Avoid toggling an already initialized analyzer: its inline `SetParallel` changes the analyzer flag, while existing result mutexes were selected during `Put`; the constructor/`Init` route is the evidenced route here. A whole #1180 transplant changes layouts and runtime policy unnecessarily for this question.

## Ranked selective experiments

| Rank | Candidate | Pinned applicability | Proposed acceptance |
| --- | --- | --- | --- |
| 1 | Small TKBO/TKOffset lookup and extraction changes from #1102 | Corresponding loops exist on 7.9.3 | Isolate hunks; instrument hit counts; compare Boolean history, validity, tolerances and shell output before timings |
| 2 | TopLoc/pcurve location changes from #1091 | Narrowly applicable; the claimed surface evaluation cache is partly already present | Located and unlocated shapes; exact mass/error and pcurve/seam behavior; profile location calls |
| 3 | BOPTools_Set vector storage from #1102 | Existing list-backed class makes this plausible, with ABI/allocation risks | Allocation counts, peak memory, many tiny sets and large sets; same equality/hash/topology behavior |
| 4 | Non-periodic span reuse from #1174 | Its GeomGridEval package is absent from pinned TKG3d | Treat as algorithm inspiration; prove monotonic/domain assumptions before porting to another evaluator |
| Separate correctness track | #1180 thread hardening | Different subfeatures have different baseline implementations | Reproduce a specific race before patch selection; constructor audit above finds no matching allocation trigger |

These priorities are research judgments, not measured gains.

### #1102: small, potentially useful work; separate storage changes

[Commit `82303a99a31ea939dbda00c72d4ef28cb50a4579`, 2026-02-20](https://github.com/Open-Cascade-SAS/OCCT/commit/82303a99a31ea939dbda00c72d4ef28cb50a4579.patch) changes TKBO copies/lookups, adds a movable PaveFiller argument overload, changes BOPTools_Set list storage to a vector, and hoists repeated vertex point/tolerance extraction plus a location transform in BRepOffset_Inter2d. Rendering changes are outside this investigation. The vector uses a block increment of 256, and the class layout changes.

Independent pinned-source inspection found the repeated extraction inside the duplicate-vertex loop, `IsBound` plus `Find` in tolerance correction, copied `TopoDS_Shape` temporaries and list-backed BOPTools_Set. Proposed first patch: adapt just redundant lookup/extraction hunks, retaining 7.9.3 types and output order. These avoid geometric approximation, but still need topology/history and tolerance checks. Keep the reversible local shape copy wherever orientation is changed; converting that site blindly to a mutable reference could corrupt the input.

Measure this separately from vector storage. Many tiny sets could pay disproportionate block allocation costs, and allocator propagation/copy/self-assignment behavior must be verified against **7.9.3's** NCollection_Vector. A speedup in large face sets may hide a regression in common tiny sets. Rebuild TKBO and every header consumer for a layout-changing candidate; TKOffset suffices for cxx-only offset hunks. Adding an rvalue overload alone does not improve existing calls without an actual ownership transfer at the call site.

### #1091: locate the residual cost, do not blindly backport

[Commit `c9bdc4b9f1d6d7526298e907e328edd68e96394c`](https://github.com/Open-Cascade-SAS/OCCT/commit/c9bdc4b9f1d6d7526298e907e328edd68e96394c.patch) adds identity/equality shortcuts to TopLoc_Location::Predivided, retains face surface/location for pcurve loading, and avoids unnecessary location division in BRep_Tool representation scans.

Pinned 7.9.3 already owns a BRepAdaptor_Surface in BRepGProp_Face, and `Normal` calls its `D1`. Consequently this is not a missing D1 surface cache that explains the fixed-V nested integration bottleneck. The narrower opportunities are edge-loading/pcurve lookup and placement arithmetic. See [volume-kernel-research.md](volume-kernel-research.md) for the previous exact comparison and our distinct fixed-V polynomial cache experiment. A semantic backport of location shortcuts should first cover equal locations, identity, compound locations, reversed/seam edges and nonidentity placements. Count calls and time them before assuming relevance to the slow sample.

### #1174: a grid optimization, not a direct scalar evaluator fix

[Commit `605098853506fe4c8f0b18794d96165f6c32abf4`, 2026-03-29](https://github.com/Open-Cascade-SAS/OCCT/commit/605098853506fe4c8f0b18794d96165f6c32abf4) modifies only GeomGridEval_BSplineCurve/Surface. For sorted non-periodic parameter grids it reuses the current span until the next knot boundary; periodic parameters retain the full location path. Cached and direct surface grids both change.

The pinned `src/TKG3d/PACKAGES` contains no GeomGridEval. Makeshift's scalar GeomAdaptor/BSplSLib D1 route therefore cannot receive this patch by cherry-picking two files. An adaptation would need both span bounds, not merely an upper-bound check, for unordered samples. Adaptive integration nodes and interval revisits do not inherit the sorted-grid assumption. Repeated knots, exact boundaries and tolerance-near-boundary span selection also need identical semantics to LocateParameter. Instrument span transitions and locator calls first; our existing fixed-V candidate instead removes repeated polynomial work without changing locator decisions.

## Backport hygiene and next concrete action

Create individual immutable-source patch artifacts against the pinned source, preserve upstream attribution/license headers, and retain full SDK/source provenance. Do not combine an OCCT major-version upgrade with these experiments: layout changes, collection migrations and API refactoring would confound causal attribution. Use the existing serial compute lock for compilation and randomized paired timings. Source availability obligations apply to distributed modified kernels.

Next smallest useful action: add opt-in counts around pinned `BRepOffset_Inter2d::EdgeInter` duplicate comparisons, `ExtentEdge` location retrieval, `BOPAlgo_PaveFiller::CorrectToleranceOfSE` map lookups and BOPTools_Set allocations. Pick whichever executes substantially in the shell/Boolean fixture, then benchmark the matching narrow #1102 adaptation. No benchmark claim is made by this note.

## #1102 follow-up: exact 7.9.3 hunk selection and workload gates

Source-only follow-up; no native edits or compute in this lane. The following
details are from direct inspection of the pinned source, independently of the
upstream patch summary above. They narrow the initial ranking considerably.

| Small adaptation | Exact pinned site | Semantics and ABI | Workload likely to exercise it |
| --- | --- | --- | --- |
| Replace `IsBound(nV) ? Find(nV) : 0` with one `Seek(nV)` and value-or-zero | [PaveFiller_6.cxx:4066](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_PaveFiller_6.cxx#L4066) | Same key/value and default, one hash lookup; cxx-only TKBO, no layout/API change | Many generated F-F section vertices whose tolerances are candidates for reduction |
| Hoist current outer vertex point/tolerance out of its inner duplicate-comparison loop | [Inter2d.cxx:632](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_Inter2d.cxx#L632) | Read-only snapshots while lists are inspected; same Max, point equality, removal/restart order; cxx-only TKOffset | Offset face intersections generating long candidate-vertex lists with duplicate cleanup |
| Copy `MinLoc.Transformation()` once before two endpoint projections | [Inter2d.cxx:1344](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_Inter2d.cxx#L1344) | Unchanged MinLoc within branch; same point transform/projection; cxx-only TKOffset | ConnexIntByInt edge extension with nonclosed/nonperiodic 3D curve and finite pcurve endpoints |
| Avoid face handle copies in BuildBOP, retaining a local copy only when reversing | [Builder.cxx:592](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_Builder.cxx#L592) | No geometry changes; do not Reverse the map/list entry through a reference; cxx-only TKBO | **Open-solid fallback**, not the ordinary closed-solid BOP path |
| Replace unsafe edge cast in BOPTools_Set with TopoDS::Edge | [Set.cxx:166](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPTools/BOPTools_Set.cxx#L166) | Explorer is explicitly EDGE in this branch; safer checked cast, no layout change | Sets of edges; correctness cleanup, no credible major performance gain |

### The Builder hunks have limited ordinary application reach

Pinned [BOPAlgo_BOP::BuildShape](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_BOP.cxx#L851)
calls BuildBOP only when both operand dimensions are three and
`CheckArgsForOpenSolid()` reports open solids. The source explicitly explains
that rebuilding solids this way loses solid modification history. Otherwise it
uses BuildRC and, for solid fuse, BuildSolid. Direct search found no additional
BuildBOP callers in pinned BOPAlgo/BRepOffset implementation files. Therefore do
not attribute improvements in normal validated closed-solid extrusions to these
copy-saving hunks without proving the fallback actually executes. Do not force
this alternative builder for speed: that would change application history and
input/output semantics. The later const-reference hunk around line650 is safe
within this source block because only nonmutating `Reversed()` is used there.

### Minimal first candidate: one redundant hash lookup

`NCollection_DataMap::Seek` already exists in
[pinned DataMap.hxx:482](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/NCollection/NCollection_DataMap.hxx#L482):
it performs a single lookup and returns null on absence. No new collection
implementation is needed. Proposed standalone patch is just two local lines:

```cpp
const Standard_Real* pMaxTol = aMVITol.Seek(nV);
Standard_Real aMaxTol = pMaxTol ? *pMaxTol : 0.;
```

No intervening map mutation, pointer retention, key conversion or tolerance
threshold change. This phase is invoked at the end of
[PaveFiller::MakeBlocks](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_PaveFiller_6.cxx#L1101).
The function processes generated F-F section-edge and associated vertex
tolerances; disjoint tools or trivial analytic intersections may execute almost
none of the affected lookup sites. Count eligible lookup executions rather than
only function entries. The saved lookup is small relative to intersection and
geometric tolerance verification; a whole-operation speedup may be below noise.
This is a cheap baseline optimization candidate, not an explanation for seconds
of nested integration.

### Offset hunks: preserve empty-loop behavior and test the right branch

`EdgeInter` can be reached through
[Inter2d::Compute](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_Inter2d.cxx#L1696)
when intersecting new edges; pinned MakeOffset invokes Compute in several
intersection-building stages. Hoisting does **not** reduce the quadratic number
of duplicate comparisons or their repeated restart after removal. For an exact
adaptation, perform the hoisted reads only when `i > 1`, since the first outer
iteration previously had no inner comparisons and therefore no such reads.
This also avoids adding shape-access exceptions on an otherwise unused element.
The valid-source geometry remains unchanged during the duplicate-search loop;
vertex storage/merging occurs after it. A pair-comparison counter and outer-loop
count distinguish real reuse from small lists.

`ExtentEdge` is called from
[ConnexIntByInt](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_Inter2d.cxx#L1768).
The two projection branch endpoints are tested individually for infinity. An
adaptation can retrieve the transform lazily on the first finite endpoint, so
the case with both infinite endpoints retains its prior lack of a transform
retrieval. Count requests with **two finite endpoints**: only those save a
repeated retrieval. TopLoc itself caches some transformations, so presumed cost
must be measured, especially for identity placements. Preserve projector Init
and all curve periodic/closed extension branches exactly.

### Defer header/storage changes until allocation evidence exists

The existing BOPTools_Set constructs face sets in pinned BOP::BuildRC and
BuildSolid ([sites681/747/1176](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_BOP.cxx#L681)).
That is broader reach than BuildBOP, making allocation profiling worthwhile for
many untouched solids, compounds and duplicate/coincident solid face sets.
However 7.9.3's `NCollection_Vector` is an alias for DynamicArray, not a generic
std::vector; inspect its block allocation, Assign allocator propagation and copy
semantics before adapting the storage patch. Preserve existing multiplicity,
internal-orientation expansion, hashing and equality behavior; this experiment
is not permission to deduplicate or redefine a set. Its header layout change
requires a coherent TKBO rebuild plus downstream allocation/header consumers,
and prevents mixing old/new binary objects of the class.

Pinned NCollection_List already implements move assignment, so a PaveFiller
rvalue argument overload is possible without layout change. It adds a public
overload and changes allocator transfer for an actual moved list, and existing
lvalue calls continue copying. It is not worth a kernel API addition unless a
profiled call owns a temporary list that can safely be consumed and needs no
subsequent access.

### Proposed isolated experiment

First instrument opt-in aggregate counters for eligible tolerance lookups,
duplicate comparisons and double-finite endpoint branches on existing Boolean
and shell fixtures. Select a fixture that executes the changed site, then make
a **single cxx-only** patch against the pinned kernel, rebuilding only its
toolkit under the serial compute lock. Compare validity, all output tolerances,
solid/face/entity history, request acceptance/rejection and source immutability;
then use randomized paired whole-request timings with sufficient samples.
Include a fixture with zero hits as a negative control. Avoid combining the
lookup, offset and vector changes: separate attribution is especially important
when expected gains are small. The app-level removal of repeated exact work and
the measured fixed-V D1 experiment remain stronger demonstrated opportunities.
