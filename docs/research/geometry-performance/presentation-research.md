# Exact geometry work inside presentation

Research-only audit, 2026-10-08. No builds, benchmarks or source changes performed.
The orchestrator reported a smoke profile with approximately 22 ms Boolean
calculation and 400 ms topology-and-JSON presentation in a 520 ms perforated-union
request. Those are orchestrator observations, not measurements reproduced here;
the aggregate timer does not establish which function dominates.

Source base inspected: Makeshift `7861122fb791c71692d7b48a70bfcb3a381fc95a`;
OCCT 7.9.3 `a016080bf6738d6aeae020badee4e888ad1540a5` from local pinned source.

## Main finding

`presentation.cpp::face` performs substantial exact geometry work while emitting
metadata: thickness candidate discovery and trimmed/ray visibility, tangent-chain
discovery and geometric continuity, analytic handles and recognition. Every face
also obtains an area/centroid signature. Every edge obtains a length/centroid
signature, analytic curve recognition and sampled output points. The timer named
topology-and-json combines these with numeric stream formatting and triangle
serialization; it is not a timer of JSON formatting alone.

Presentation optimizations here preserve exact accepted BRep and emit the same
metadata immediately. They neither defer computation nor replace it with meshes.

## Ranked safe application experiments

### 1. Share one loaded ray intersector across an immutable body presentation

`presentOffsetThickness` allocates a fresh `IntCurvesFace_ShapeIntersector` and
calls Load(body, 1e-7) for each eligible face with candidates. Load traverses all
body faces and constructs a per-face intersector for each. For nonanalytic faces,
the constructor builds a parametric surface polyhedron and topological tools;
analytic faces still allocate surface adaptors and classification tools.

Repeated Perform calls already reuse those prepared tools inside one source face.
Extending that lifetime to all faces of the *same unchanged body* eliminates
repeated full-body preparation. Perform resets current per-face point sequences
and shape aggregate result arrays, so serial reuse of the normal Perform path is
supported by source. The ray query tolerance and body remain identical.

**Important trap:** Load appends to `myIntersector`; it does not clear existing
entries. Load once on a newly created object. Do not reload the same object to
switch bodies or to refresh after mutation.

Suggested minimum interface: an `OffsetThicknessPresentation` context in
`offset-thickness.h`, constructed once per `present` invocation with const body
and its face index map. It owns or references an intersector unique to this body,
loads lazily on first nonempty candidate list, and exposes writing thickness for
one indexed face. Keep the context's mutating solver private and prohibit copying
or concurrent use. If preserving standalone existing test API is useful, its
wrapper creates a short-lived context; the production present path explicitly
shares one context. Avoid a global or persistent cache across requests.

Do not invalidate by pointer identity alone: geometry can mutate behind TopoDS
handles. Lifetime must begin only after operation, repair and meshing preparation
complete and end before any later geometric changes. Current present path meshes
first; create the context after that and before face output. It must not mutate
geometry or disturb output ordering, faceIndex, slope, distances or null decisions.

Expected impact: removal of repeated face-tool preparation, unknown until measured;
larger for mixed freeform/analytic bodies than all-analytic perforated stock.

### 2. Cache the exact UV sample eligibility and geometry per face

`visible` classifies the same 11 x 11 UV grid on the source for every candidate,
then classifies a target grid in the reverse pass. A face may repeat as many
different source/target pairs. Classification is deterministic on immutable face,
unchanged UV grid and 1e-7 tolerance.

Cache original-order samples where the current BRepClass_FaceClassifier returns
TopAbs_IN, together with UV coordinates and exact surface.Value points. Keep the
same ordering and every sample, with no reduction in density. This preserves
first-witness selection and the original handling of ON/OUT/UNKNOWN samples.
Cache BRepAdaptor_Surface support descriptor and parameter limits per face.

Reverse projection onto source still depends on source, target and delta and
requires its original 3D trimmed classifier. Do not treat target's IN state as
evidence that its projected point is inside source. Normal direction also depends
on source support and must use the original source cylinder/sphere/plane.

This is especially promising on faces with many trimming wires: each UV classifier
creates a BRepClass_FaceExplorer and walks pcurve edges. Repeatedly calling Perform
on the same BRepClass_FaceClassifier object alone is not enough: the convenience
Perform overload reconstructs the explorer every time.

Prefer lazy cached samples to eagerly classifying every eligible face: current
successful first ray may avoid almost all samples and eager setup can regress
simple cases. A lazy array of 121 optional classification results per face,
filled only as the original loops reach it, retains this early-exit behavior.
Geometry Value evaluation can be cached after classification rather than before.

### 3. Build face adjacency once; reuse continuity results and ordered chain search

For every face, tangentFaceChain rebuilds the complete edge-to-face ancestor map.
Every BFS-visited face then scans *all* body edges, checks whether it is incident,
and tests geometric continuity to neighbors. Output metadata may discover the same
tangent component repeatedly, repeating expensive ContinuityOfFaces calls.

Build one adjacency map and per-face incident-edge lists ordered exactly as the
current global indexed edge traversal. Perform the same BFS from each seed using
these lists. Cache ordered `(edge, sourceFace, otherFace, angleTol=1e-5)` continuity
results within this immutable context. Retain face orientation and location in
cache keys; no unordered pair assumption until symmetry is established, especially
for seam/pcurve handling. Existing blend recognition also builds adjacency and
uses continuity; sharing preparation there is a later scoped extension.

Do not simply emit a sorted connected-component list: current chain starts with
the requested face and has a deterministic BFS discovery order. Offset and chamfer
faceIndexes metadata currently reflects this order. Preserve it even if order is
not intended to matter to consumers. Multiple shared edges between the same faces,
seam duplicates and nonmanifold neighbor lists must retain current semantics.

Upstream ContinuityOfFaces evaluates up to 21 edge samples, surface derivatives,
possible point-to-pcurve projection and curvature checks. Cached results avoid
exact work, not merely map rebuilding. For sharp faces rejection often occurs
early, so measure all-edge iteration independently of continuity on perforated
stock; there may be little expensive tangent geometry there.

### 4. Test FaceClassifier's existing bounding-box option independently

The public FaceClassifier API has `theUseBndBox=false` default. Its header recommends
bounding boxes for more than ten edges and mostly spline boundaries. Test true
without changing current 1e-7 classification tolerance or default gap handling.
This is a broad-phase knob, not permission to replace trimmed classification with
support-only tests. Periodic seams, circular holes, tiny strips and ON/OUT border
cases need metadata equivalence. The recommendation is not proof that true helps
perforated analytic circular wires; rebuilding boxes per sample may cost more.

Prepared lower-level BRepClass_FaceExplorer can also be reused through its public
classifier overload, but requires checking explorer reset/segment state carefully.
Caching exact existing sample outcomes is a lower-risk first experiment. Replacing
BRepClass_FaceClassifier with BRepTopAdaptor_FClass2d/TopolTool classification is
not automatically equivalent; the latter keeps polygonal classifier preparation
and has different periodic/boundary behavior. Do not swap merely for its cache.

## Kernel opportunities after profiling

### Ray broad phase and sorting

ShapeIntersector::Perform visits every body face for every sampled ray, with no
shape-level BVH rejection. Its SortResult gathers all intersections and uses a
bubble sort. Per-face analytic intersectors call support intersection before
trimmed-point acceptance; distant hole cylinders can therefore receive many
unproductive queries.

A conservative finite-ray-versus-face-box BVH could cull impossible faces while
preserving original exact face intersection, whole-body occlusion and all ties.
This is a kernel patch or carefully isolated wrapper over prepared per-face
intersectors. Use exact/conservative located trimmed-face bounds with appropriate
tolerance expansion; no triangles as collision proof. Preserve failure behavior:
current aggregate IsDone fails if any queried face solver is incomplete. Silently
skipping an unready intersector changes current null output semantics.

Replacing bubble sort with stable O(n log n) sort using WParameter and original
enumeration as tie-breaker is smaller kernel work, although finite short thickness
rays may have few intersections and therefore little sorting cost. Preserve exact
ordering for equal W because existing tie handling consults every face near the
first event. Profile hit counts before investing.

### PerformNearest is not a drop-in replacement

The nearest API adaptively shrinks each next face's upper parameter bound and keeps
stateful face visit priorities. Current visible rejects ambiguity whenever another
face intersects within 1e-7 of the earliest event. A nearest-only path must retain
every possible tied blocker, not just first face. Shrinking the range may omit a
blocker slightly farther than first but within tie tolerance.

Also check stale per-face results: its conditional Perform calls can leave old
sequences on faces not visited when an interval collapses, yet SortResult reads
all faces. The normal Perform path always resets every face. Do not substitute
PerformNearest without targeted occlusion/tie/serial-query regression evidence.

### G1-only geometric continuity kernel API

Presentation only consumes whether ContinuityOfFaces >= G1, but upstream computes
higher-order curvature at sample points when possible. A separate G1 predicate
could retain all 21 derivative/orientation/projection checks and avoid curvature
work. This needs careful parity on seam edges and degeneracy/exception behavior;
reusing the existing result is safer and lower maintenance than a fork initially.

## Signatures and property calculations

signature(shape) emits surface/curve type, orientation, mass (area or length) and
centroid. It uses exact BRepGProp geometry rather than triangulation. Incoming
operand signatures are independently recomputed in main.cpp and compared with
relative/absolute 1e-7 scaling to guard topology identity. Do not stop checking
signatures or switch to triangulation, low sample density, bounds centers or new
integration tolerances as a speed optimization.

Present currently computes each unique face/edge signature once. A local signature
cache therefore has little direct value within one present call. There can be
reuse from incoming operands for genuinely retained unchanged entities, but
IsSame alone does not guarantee unchanged geometry/tolerance/pcurve and accepted
body history is not enough. Establish a request-local mutation boundary and exact
reuse provenance first; do not create a persistent identity cache in the stateless
calculator merely because signatures are slow.

Whole-body properties separately compute volume() and an adaptive VolumeProperties
for center. The volume implementation uses different integration strategies for
planar/nonplanar geometry; merging them must preserve numerical output and current
error checks. These calls are in properties-and-blends, not topology-and-json,
so they cannot explain the reported 400 ms phase directly.

## Minimum verification matrix for ray sharing/sample/chain reuse

- Existing native tests/offset-thickness.cpp exact strings: nearest inner/outer
  cylinder, coaxial nonoverlap, eccentric blocker, nearer nonoverlapping reference,
  nearest/reversed planes, shifted nonoverlap and tiny target detected by reverse
  sampling.
- Repeated same-face and different-face queries through one loaded context,
  comparing each complete metadata result against fresh baseline contexts.
- At least two separate body contexts in one process to detect accidental reuse
  and Load accumulation; lazy path with empty candidates then nonempty candidates.
- Same-distance and within-tolerance blockers, obstructed planar/cylindrical rays,
  small trimming holes, thin rim strips, periodic seams and located/rigidly
  transformed shapes. Include analytic faces in a body with freeform blockers.
- Full ordered face/edge metadata parity: thickness values/null, faceIndex/slope,
  offsetFaceIndexes, blend/chamfer fields, signatures and topology predecessor IDs.
- Original BRep unchanged and same accepted/rejected outcomes. Timing comparisons
  should isolate ray loading, sample classification, ray Perform, tangent chains,
  signature and stream output before claiming which exact geometry optimization
  caused a speedup.

## Commit-pinned upstream references

- [ShapeIntersector Load, Perform and nearest path](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_ShapeIntersector.cxx#L37-L150)
- [ShapeIntersector gathering and bubble sorting](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_ShapeIntersector.cxx#L176-L231)
- [Per-face intersector support/topology/polyhedron preparation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L123-L215)
- [Ray Perform resetting and analytic support query](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L353-L381)
- [Classifier bounding-box API and recommendation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepClass/BRepClass_FaceClassifier.hxx#L44-L90)
- [Classifier UV explorer reconstruction and 3D projection](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepClass/BRepClass_FaceClassifier.cxx#L66-L136)
- [Geometric continuity, derivatives/projection and curvature](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib.cxx#L2049-L2235)
- [Exact versus triangulated mass-property controls](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.hxx#L77-L155)
- [Prepared topological classifier uses FClass2d](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTopAdaptor/BRepTopAdaptor_TopolTool.cxx#L176-L200)

No upstream implementation was copied. Public-API reuse adds no new licensing
dependency; kernel modifications need reproducible adapted sources and existing
OCCT LGPL/exception notices and source access.

## Lazy sample-cache candidate implementation

The delegated candidate changes only offset-thickness.cpp/.h, extending the
orchestrator's already implemented per-body OffsetThicknessContext. Its private
SampleCache contains an oriented-shape index map and one 121-slot grid per face,
with one BRepAdaptor_Surface per cached face. Entries are evaluated only when
the original nested u/v loops reach them. Each entry stores whether classification
ran and an optional exact surface point only for TopAbs_IN. Non-IN states retain
the original skip behavior; no geometry point is evaluated for skipped samples.

Keys compare TShape, location and orientation through
TopTools_IndexedMapOfOrientedShape (default equality is TopoDS_Shape::IsEqual).
Hash collisions between orientations are harmless because equality distinguishes
them. A cached point is returned by value, so reverse-point Translate cannot
alter later samples. Both forward and reverse original 121-point order remain
unchanged. Every reverse projected-source 3D classifier, full-body ray Perform,
IsDone and tie/blocker test still runs as before. Cache lifetime ends with context.

The candidate has 161 cpp lines; all functions are under 80 lines. No build or
benchmark was run by the delegated worker. Orchestrator owns validation/builds.
Besides existing exact-string and full output comparisons, directly exercise
repeated sample(face,u,v), oppositely oriented same-TShape face, translated located
face and repeated reverse probes to detect mutation of cached points. Native
sample indices have the internal precondition u/v in [1,11], matching the sole
production caller's original loops.

Added focused native assertions in tests/offset-thickness.cpp using the public
thickness output path with one shared context. First, stock-to-tiny-reference
requires reverse sampling, then querying the tiny face and stock again checks
that projected temporary points did not move reference geometry or poison later
queries. Second, three translated instances of the same planar TShape are queried
from both ends, including reversed source orientation, checking distances, target
indices and signed slope. These are semantic metadata checks rather than cache
slot/counter assertions. Diff check passed; delegated worker did not run them.

Remaining risks: public context/sample methods rely on unchanged body geometry,
serial use and internal sample-index bounds; cache has no mutation detection.
Orientation distinction is conservative even where current face classification
and geometric sample point happen to be orientation-independent. Existing suites
still need mixed analytic/freeform blockers, coincident-ray tie cases and full
output parity, owned by orchestrator.

## Request-local tangent face chains (2026-10-08 prototype)

Added `FaceChainContext` in face-chains.h/cpp and reused one instance across the
presentation's face metadata loop, after meshing and body recognition. The legacy
`tangentFaceChain` wrapper constructs a fresh context for its other callers.
No thickness-context behavior changed. This lane performed no builds/benchmarks;
the orchestrator owns output and timing comparisons.

The context builds the same `MapShapesAndAncestors(edge, face)` map once. During
that original global edge traversal it records incident edge indices for each
IsSame face. Repeated seam ancestry contributes an edge only once to that face's
incident list. This eliminates global-edge scans for each reached face without
changing edge order or neighbor-list order. A request-local visited shape map has
the same IsSame equality as the former linear result scan; seed order and even
duplicate seeds remain intact. An unknown seed stays in the original result and
has no neighbors, as before.

Continuity answers are cached per fixed adjacency edge and **ordered** from/to
face IDs in TopTools_IndexedMapOfOrientedShape. Its default TopoDS equality is
IsEqual, retaining orientation and location. Opposite orientations and exchanged
arguments cannot share entries. Only completed `ContinuityOfFaces(..., 1e-5)`
returns are stored; an exception propagates without caching a partial answer.

Pinned source audit:

- [BRepLib::ContinuityOfFaces](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib.cxx#L2049)
  uses local oriented edge/face copies, local SurfaceProperties and a local
  curve projector. It inspects pcurves/support geometry and does not write
  topology regularity. In contrast the separate EncodeRegularity caller writes
  regularity; that caller is not being cached here. The refinement projects the
  first surface's point onto the second curve, so symmetry must not be assumed.
- [BRep_Tool::CurveOnSurface](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L289)
  selects stored curves or constructs a plane projection; this inspected path
  does not attach the generated pcurve to the source edge.
- [TopTools_ShapeMapHasher](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopTools/TopTools_ShapeMapHasher.hxx)
  uses IsSame. [Oriented indexed map](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopTools/TopTools_IndexedMapOfOrientedShape.hxx)
  uses the default hasher/equality, whose TopoDS operator compares IsEqual.

Preconditions/risks: one unchanged body, supports, locations, orientations and
pcurves during a serial context lifetime; no mutation detection and no shared
concurrent context use. Cache storage grows with actually queried ordered edge/
face pairs; nonmanifold ancestry may grow faster than manifold adjacency. It does
not cache complete connected components because query order and directed
continuity decisions are retained. Compare full offsetFaceIndexes/chamfer metadata
order on seams, reversed/located instances, multiple seeds, unknown seeds,
nonmanifold ancestry and analytic/freeform blends. Invalid geometry exceptions
should remain observable rather than become cached fabricated results.

Files remain below the 300-line limit: face-chains.cpp 75 lines, new header 16,
presentation.cpp 222 at handoff. Added functions are below 80 lines; the existing
presentation face helper's line count is unchanged. Diff whitespace check passed.

### Standalone face-chain semantics harness

Added [face-chain-parity.cpp](face-chain-parity.cpp), source-only at handoff.
It explicitly copies the previous traversal as the comparison oracle and checks
each result face with IsEqual at its original position, not membership alone.
One shared production context receives repeated, reversed, duplicate, multiple,
all, empty and unknown seeds. Fixtures cover cylinder seam ancestry, a one-edge
analytic fillet with confirmed connected tangencies, reversed and rigidly located
fillets, multiple located instances sharing TShapes, and three triangular faces
sharing a nonmanifold edge. Fixture assertions require actual seam duplication,
tangent connectivity and three-ancestor edge retention to prevent vacuous passes.
This is a metadata semantics check, not a cache-layout or timing test.

Build from the repository root using the pinned SDK path:

~~~sh
c++ -std=c++20 -I native/kernel -I .cache/release-inputs/boost -I "$SDK/include/opencascade" \
  docs/research/geometry-performance/face-chain-parity.cpp \
  native/kernel/face-chains.cpp -L "$SDK/lib" -Wl,-rpath,"$SDK/lib" \
  -lTKFillet -lTKPrim -lTKTopAlgo -lTKGeomAlgo -lTKBRep -lTKGeomBase \
  -lTKG3d -lTKG2d -lTKMath -lTKernel -o /tmp/face-chain-parity
/tmp/face-chain-parity
~~~

The orchestrator must run this under the compute lock and record actual output.
No claim of a passing run is made here. The fixture constructor is checked against
pinned headers; the source stays under 300 lines and every function under 80.

## Streaming build shell thickness discrepancy: source-only audit

The orchestrator's streaming-Cut build matched the sweep/Boolean cases but
reported shell-perforated-closed face[1].thickness.faceIndex 36 versus 31, with
the first two baseline repetitions matching. This lane did not execute requests.
The saved streaming-cuts-full-output.json contains comparison summaries only,
not target geometry or exact BRep replies; it cannot settle this discrepancy.
No production source change is proposed by this audit.

Two different kinds of ties must be distinguished:

1. Outer **candidate-face** selection in offset-thickness.cpp sorts only by
   absolute support separation. It has no secondary index key and returns the
   first candidate that visible() accepts. Two different trimmed patches on a
   coplanar/equidistant support can each have a visible region on different
   sampled rays. A changed ancestry enumeration or near-equal computed support
   distance can therefore select a different valid patch.
2. Inner **ray-hit** ties are explicitly rejected as ambiguous when any other
   face lies within tolerance=1e-7 of the first hit. This is not permission to
   choose any tied face on a coincident ray. Pinned
   [ShapeIntersector::SortResult](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_ShapeIntersector.cxx#L159)
   uses a strict greater-than bubble-sort and preserves equal-W enumeration;
   it is incorrect to attribute the change to an unstable ray sort.

The streaming helper is not invoked on the shell dispatch path. Nevertheless
binary layout, allocator state left by previous requests, internal kernel
unordered iteration and parallel shell construction can affect generated face
enumeration. These are mechanisms to investigate, not proof of the cause.
Outer std::sort itself is deterministic for identical inputs/order; lack of a
secondary key alone does not explain changed replies.

### Evidence needed before classifying or accepting the difference

Save the exact shared shell input and full baseline/candidate JSON replies,
including BRep. Do not regenerate separate fixture stocks in each executable:
use the same captured input bytes. Record binary hashes, SDK library hashes,
thread setting and request history. Current compare-output stops at its first
field difference and excludes BRep; collect **all** differences before calling
this only a target-choice tie.

Under the serial compute lock run at least 20 baseline and 20 candidate requests
with that input, retaining each full reply. Alternate binaries in paired blocks
with fixed thread configuration. Include fresh-process shell-only controls as
well as repeated same-process runs; prior sweep work can perturb allocation
state without changing this shell path. A one-worker diagnostic can isolate
parallel construction effects, but does not replace the production configuration
comparison. Two matching baseline runs are weak evidence of stability.

For every chosen target, compare distance and slope, then resolve the index to
its actual output face: type/orientation/analytic support, area/centroid signature,
predecessors, ordered incident edges and trimmed boundary geometry. Inspect
baseline faces31/36 and candidate faces31/36, and track whether an index changed
because the **same** face moved in enumeration or because a different patch was
selected. Area/centroid signatures alone are not a face-identity proof; verify
trimmed domains/edges in the serialized BRep where ambiguous.

If distinct patches are selected at the same separation, verify both supports
and distinct trimmed regions, and that each has a valid unoccluded source/target
sample under the existing first-hit/tie predicate. An optional isolated trace
build can print candidate order, full-precision delta, first successful u/v and
reverse flag, and every ray face/W within tolerance of the first hit. Such a trace
should reproduce the original decision, not change sorting or ray ranges.
There must be no nearer candidate that was inadvertently bypassed.

Classification criteria:

- Baseline alone producing both geometrically equivalent choices establishes
  preexisting output nondeterminism on the captured input. Document frequencies
  and geometry evidence; do not silently weaken the regression comparator.
- Both builds stable but different, with equivalent-distance valid choices,
  establishes an order-sensitive metadata choice across these builds. It is
  **not** proof of baseline repeat nondeterminism or automatic acceptance: the
  indexed patch can affect downstream thickness edits.
- Different distance/slope, invalid reference, changed target support/trimmed
  geometry, or additional topology/history differences remains a regression.
- If fresh-process identical-code control builds vary in the same way, isolate
  kernel representation order from the streaming calculation before attributing
  cause. Preserve this evidence with the checkpoint.

Any deterministic tie-break policy is a separate product/correctness change;
neither altering std::sort nor discarding faceIndex from parity is part of this
streaming memory experiment.

Prepared tests/geometry-performance/repeat-shell-output.mjs without executing
geometry. It captures one exact sent input and 20 full raw transport replies per
binary by default, comparing every metadata difference at the existing 1e-9
relative numeric tolerance instead of stopping at the first discrepancy. Exact
BRep string repeat/cross comparison is reported separately with lengths/hashes;
the original raw JSON lines retain the complete BRep. Each reply also resolves
source face1, chosen target and alternative faces31/36 to their full face payload
and incident edge geometry. No equal-distance equivalence is presumed.

Run after the memory experiment, under the compute lock:

~~~sh
node tests/geometry-performance/repeat-shell-output.mjs BASELINE CANDIDATE \
  docs/research/geometry-performance/results/streaming-shell-repeats.jsonl 20 reuse
node tests/geometry-performance/repeat-shell-output.mjs BASELINE CANDIDATE \
  docs/research/geometry-performance/results/streaming-shell-fresh.jsonl 20 fresh INPUT.json
~~~

The first run's input record contains sentInput, which can be saved verbatim as
INPUT.json for the fresh-process control; alternatively provide an already
captured shared input to both runs. Fixture generation, when needed, uses a
separate baseline process that closes before the comparison. Reuse starts two
fresh workers, then repeats in alternating baseline/candidate block order;
fresh starts one worker for each request. Both fix worker count at four.
Binary hashes and exact sent-input hash are recorded; SDK library provenance
must be retained by the orchestrator separately. Output is a diagnostic evidence
file, not an automatic waiver of differing target choices. Syntax check passed;
no geometry or benchmark was run by this lane. Current script length is 210 lines and
functions stay below 80.

### Initial reuse capture: orchestrator-reported observations

The orchestrator subsequently ran the 20-block reuse capture and reports marked
**baseline self-nondeterminism**, not merely a candidate-only faceIndex change.
In late baseline blocks, first-reference metadata differences counted about
23,309 and 23,298 fields; source face1's chosen opposite included indices32/34.
Candidate choices included32/36. Reported thickness distance remained0.75 and
slope1. Raw evidence is [streaming-shell-repeats.jsonl.gz](results/streaming-shell-repeats.jsonl.gz); this research lane did
not parse the large raw file while the orchestrator held the compute lock.
These observations are delegated reports pending compact geometry reconciliation,
not a claim that all differences are harmless ties.

The breadth of baseline differences makes positional faceIndex comparison
insufficient. A compact next analysis should map **both source and target**
faces between replies using type/orientation, analytic support, area/centroid,
predecessors and boundary edges, then compare trimmed regions. Do not assume
face1 itself is the same geometry across replies with reordered faces.
Normalize large coordinate/triangle arrays only for diagnosis; retain full
ordered output and raw BRep as authoritative evidence.

For each selected source/target pair, record support separation, thickness
distance/slope, plane/cylinder/sphere parameters and trimmed-boundary descriptors.
Group exact/equivalent geometric regions separately from distinct coplanar
patches with equal support separation. Signature collisions must be resolved
through actual edge curves/trims in BRep. Then check whether the candidate's
geometric pair appears in baseline repeats, and whether any fields still differ
after a justified face/edge permutation mapping.

Equal distance0.75/slope1 alone does not prove equivalent thickness targets.
If multiple different patches are valid opposites, report that metadata choice
ambiguity explicitly because later edits can target different regions.
Baseline's demonstrated positional variation explains why two initial repeats
were inadequate, but does not waive candidate geometry/history regressions.
Fresh-process controls and compact geometry analysis were outstanding at this
stage; the completed summaries below now address that diagnostic question.

Prepared summarize-shell-repeats.mjs (source-only; syntax check passed). It streams
JSONL or gzip JSONL through readline, then parses one full raw reply at a time.
It emits rounded1e-7 geometry/history multiset hashes, topology counts,
volume/bounds, per-label thickness relation variants keyed by source and target
face fingerprints, selected face1 evidence and descriptor collision warnings.
Face descriptors include orientation/signature, analytic surface payload,
predecessors and sorted incident edge descriptors with seam multiplicity.
Edge descriptors ignore orientation, canonicalize analytic endpoint order and
normal sign, and retain a hash/endpoints of rounded sampled curve points.
This can identify representation permutations conservatively without reading
huge raw arrays into the final compact report.

~~~sh
node tests/geometry-performance/summarize-shell-repeats.mjs \
  docs/research/geometry-performance/results/streaming-shell-repeats.jsonl.gz \
  docs/research/geometry-performance/results/streaming-shell-repeats-summary.json
~~~

The absolute1e-7 step is applied in each field's native geometry units, including
area/volume signatures; it is a diagnostic rounding choice, not a model tolerance.
Matching fingerprints/hashes cannot prove identical trimmed domains or exact
BRep equivalence. Within-result descriptor collisions are explicitly flagged;
separate regions indistinguishable by these descriptors require BRep inspection.
Authoritative raw files remain unchanged, exact BRep variants are separate and
the script does not declare acceptance or choose a thickness target.
No large capture was read or summary executed by this lane while compute was
reserved. The current summarizer is 253 lines and functions stay under80.

### Completed reuse and fresh-process diagnostic summaries

The orchestrator completed both 20-block captures (20 baseline plus 20 candidate
replies per process-lifetime mode). This lane read their compact summaries,
not the compressed full raw replies, and verified the following counts:

| Mode | Rounded geometry/history variants | Descriptor collisions | Source-target relation variants | Exact BRep byte-hash variants |
| --- | ---: | ---: | ---: | ---: |
| Reused workers, 40 replies | 1 | 0 | 62 | 12 |
| Fresh workers, 40 replies | 1 | 0 | 62 | 14 |

Both modes use the same captured input SHA256
`08f3a4486130b8ffa989941322e75ccf35920ac52e1301ec1ab0148dc62678be`.
All 80 replies share rounded geometry/history multiset hash
`961a09194a3f79b447d0cfa8d5759c8b819ad017aaa12ba7ed837414798bd934`.
The compact topology is one result with 62 faces, 174 edges, rounded volume
13393.4008726, bounds `[0,0,0,60,60,20]`, and predecessor body `perforated`.
Every one of the 62 fingerprint-keyed source-target relations occurs 20 times
under each label in each mode. All 62 are non-null and report distance 0.75
and slope 1.

Source face 1 has one descriptor fingerprint across every observation:
`61aca3a8084fb41d78b63af424ec951d59fd618f8e6a7a0dbba2032b1c1f24ab`.
Its chosen target also has one fingerprint:
`1c93bfbc9b3eb68d906629217a6414865879aeaff06754d3fee9868bf76d674f`.
The resolved source is the outer X=0 planar wall, area 1200, predecessor
`perforated-f3`; the target is the inner X=0.75 planar wall, area 1082.25.
The descriptors include the same four line-boundary endpoints and incident-edge
history for these faces. Reported thickness remains distance 0.75 and slope 1.
The target's positional index varies within 31–36 across the captures, while
this resolved source-target descriptor pair remains unchanged. Fresh-process
variation therefore supports representation enumeration as the source of these
particular index differences; it is not evidence here of choosing a different
geometric opposite wall.

Compact evidence:

- [Reuse summary](results/streaming-shell-repeats-summary.json) and
  [complete compressed reuse capture](results/streaming-shell-repeats.jsonl.gz).
- [Fresh-process summary](results/streaming-shell-fresh-summary.json) and
  [complete compressed fresh capture](results/streaming-shell-fresh.jsonl.gz).
- [Captured shared input](results/streaming-shell-input.json).

The reuse summary's stored `input` field retains the original `.jsonl` filename
from before compression; the actual retained raw artifact is the `.jsonl.gz`
linked above. Current capture harness length is 210 lines; streaming summarizer
length is 253 lines. No geometry, compilation, or benchmark was run for this
documentation reconciliation.

This is **diagnostic descriptor agreement**, not formal BRep identity or a
proof that every trimmed domain is equal. The absolute1e-7 rounding step is in
each field's native units, edge orientation is normalized away, sampled curve
geometry is finite, and exact serialized BRep hashes visibly vary. Zero
within-result descriptor collisions reduces one ambiguity but cannot turn the
descriptors into a mathematical identity certificate. Keep full ordered metadata,
transport replies, exact BRep variants and downstream thickness intent review.
The findings reconcile the observed face 1 index discrepancy without weakening
the original parity comparator or authorizing a new tie-break policy.

## Exact thickness ray-query reuse: source-only opportunity

Audit of current `offset-thickness.cpp::visible` and pinned OCCT 7.9.3
`a016080bf6738d6aeae020badee4e888ad1540a5`. No source change, instrumentation,
geometry request or benchmark was performed in this lane. This is reuse of exact
trimmed-body intersections during metadata presentation, not an approximate
preview or a change to the selected thickness relation.

### What an exact cache could reuse

The unchanged-body OffsetThicknessContext already loads one shape intersector
lazily, after meshing. Each candidate still calls Perform for sampled rays with
`PMin=1e-6` and `PMax=abs(delta)+1e-7`. During the forward grid pass the source
face/sample is unchanged across candidates. For planar supports, radial direction
is constant; candidates at exactly the same signed delta therefore generate
identical point/direction/bounds values, even when their trimmed target regions
are different. The reverse pass samples each target and translates its point;
these queries generally differ. Equal absolute delta alone is insufficient:
opposite signs reverse direction, and independently stored support origins can
produce different floating-point deltas even for mathematically coplanar faces.

Pinned [ShapeIntersector::Perform and SortResult](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_ShapeIntersector.cxx#L57)
perform every loaded face intersection, then collect hits in loaded-face order
and stably sort by W (swapping only strictly greater W). The current visible
loop consumes **every** hit's WParameter and Face, in that exact order: a hit
within 1e-7 of the first hit on another IsSame face invalidates visibility.
A result cache must retain all hits, including ON-boundary and coincident hits,
without deduplication, re-sorting, changed tolerances or candidate ordering.
Caching a target-dependent `hit` Boolean under a ray-only key would be wrong.

A narrow request-local method can return an owning snapshot `{done, hits}`;
for this consumer each hit needs original W bits plus a TopoDS_Face value copy.
Keep target tests in the existing loop. For a general intersector-result adapter,
copy all exposed fields: U/V/W, point, transition, state and oriented/located
face, preserving order. The [public accessors](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_ShapeIntersector.hxx#L79)
read per-face mutable result arrays; references into the tool cannot survive
another Perform. A face value retains its TShape/location/orientation identity;
do not resolve it through an index in a separately enumerated face map.

### Conservative candidate contract and state audit

Use the final constructed gp_Lin's location and direction components plus the
actual PMin/PMax as an eight-double **bitwise** key. Do not round, quantize, use
geometric IsEqual tolerances, identify differently parameterized lines, or
normalize signed zeros. The context already supplies unchanged body, Load
settings and lifetime; any future reload/body/tolerance change must clear the
cache. Nonfinite query fields should bypass caching so original error behavior
is retained. No static/global cache or shared context is needed; existing serial
presentation ownership is the scope.

Prefer caching only successful IsDone results, including successful empty hit
lists. A failed query stays eligible for a real retry, and exceptions propagate
at their original call instead of being converted into a remembered result.
Bound both entries and total stored hits/bytes, for example an initial 1024-entry
LRU plus an independent hit budget; skip oversized results. A fixed entry count
alone is not a memory bound when a ray crosses many faces. Charge lookup,
snapshot copies and eviction work to request time. Return a reference/view that
stays valid through the immediate hit loop, not across cache insertions.

Pinned [face Intersector construction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L123)
creates private surface/topology adaptors and optional private polyhedron.
[Perform](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L353)
clears its hit sequences and uses private analytic or polyhedron intersection
state; private bounding data may be initialized lazily. Its
[InternalCall](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L218)
reads face/edge tolerances, classifies trimmed UV points and adjusts transition
for reversed faces. These inspected routines contain no BRep_Builder operation
or source-topology modification. The
[topology tool's Classify](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTopAdaptor/BRepTopAdaptor_TopolTool.cxx#L176)
lazily creates a private FClass2d with the first tolerance, then reuses it.
Successful miss processing has already performed this initialization for the
loaded tool; skipping an identical successful query is not skipping its first
initialization. This is source evidence for the narrow candidate, not a general
claim that all transitive OCCT geometry adaptors/global state are immutable or
that repeated queries are universally deterministic. Validate alternating-hit
and eviction controls before asserting unchanged observable behavior.

### Why PerformNearest is not a substitute

Pinned [PerformNearest](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_ShapeIntersector.cxx#L69)
shrinks the maximum parameter after finding a closer hit, and uses adaptive
face-order bookkeeping on later calls. Faces queried earlier can retain hits
beyond the eventual nearest distance; later faces see a shorter interval. Even
if exact equal-W hits on later faces survive the endpoint-inclusive filter,
near-coincident other-face hits **above** the nearest W but within the current
1e-7 tie budget can be pruned. The visible loop intentionally uses those to
reject ambiguity. It is therefore not a drop-in replacement preserving this
all-hit tie contract. A new nearest-plus-tie-band algorithm would require its
own proof and tests and is outside this narrow reuse proposal.

### Likely workloads, counters and acceptance

There is no measured duplicate count or speedup yet. Simple boxes generally
have one useful opposite candidate and return at the first visible sample, so
an exact ray cache may add cost with few hits. Closed perforated shell fixtures
have many faces but usually unique coaxial cylinder pairs/opposite walls;
face count alone does not establish repetition. Stronger hypotheses are Boolean
split or fragmented coplanar target faces at the same signed offset: several
failed small patches can exhaust the same forward source grid before reaching
the matching patch. Existing cylindrical/spherical candidates can repeat only
when final line/bounds also match exactly; do not infer this from equal radii.

First instrument query count, exact duplicate count, successful duplicate hits,
forward/reverse counts, source/candidate/signed-delta groups, hits copied, cache
bytes/evictions and actual intersection time. Opt-in tracing must preserve
normal production overhead. Compare no-cache/cache with the same body/candidate
order, all original grid points/predicates, and ray all-hit sequences on misses
and repeated queries. Include split coplanar faces, coincident boundaries,
seams, reversed/located shapes, empty hits, failed queries, alternating bounds,
eviction and high-hit rays. Retain source encoding checks and complete output
metadata, resolving any preexisting shell enumeration variation separately.
Only then use randomized serial paired whole-request timings plus peak memory;
reject a latency claim from counts alone or from dropping coincident hits.

### Counts-only preload prepared, not executed

[trace-thickness-rays.cpp](../../../tests/geometry-performance/trace-thickness-rays.cpp)
interposes pinned TKTopAlgo exported `ShapeIntersector::Load` and gp_Lin Perform
through RTLD_NEXT. The source forwards original Load/Perform unchanged; it does
not replay intersections or cache results. Exact keys use the eight final query
component bit patterns above, preserving signed zero. Load completion starts a
new owner generation and reports/resets any old generation at the same address.
The Makeshift context always Loads a fresh tool before Perform, so pointer
reuse is separated by that new generation. This does not prove a generic caller
performed Load before using a recycled address; no destructor is interposed.
Concurrent reload/query on the same original tool is not supported by this
instrumentation or the existing mutable intersector.

Per-generation records report query attempts, finite-query attempts, exact
repeated queries and stored unique finite keys. The set caps at 8192 keys per
owner and 64 retained owners; once capped, stored-unique and repeat counts are
lower bounds, and `notStoredDueToCap` counts untracked key occurrences, **not**
a number of distinct untracked keys. Owner eviction flushes its record; later
queries without another Load contribute to `unknownOwnerQueries`. Reset/eviction
and exit records together are needed to total a process. Failed/throwing Perform
attempts are counted too; successful-repeat frequency still needs separate
IsDone instrumentation before implementing successful-result-only caching.

The two symbol spellings were checked by a lightweight nm read of the pinned
SDK's `libTKTopAlgo.so.7.9.3`. No build or preload execution occurred. This is an
untimed diagnostic: mutex/hash allocation/interposition and stderr reporting
change elapsed time and memory. It must not be enabled during performance
comparisons. Compilation/run remain orchestrator-owned under the compute lock;
the source header includes the isolated shared-object build command.

## Parallel exact per-face metadata: source-only CPU proposal

The orchestrator's untimed ray diagnostic reports Fuse 2080 queries / 1 exact
repeat, open perforated shell 1285 / 0, and captured notched case 277 / 26.
These do not justify implementing an exact query cache for the dominant tested
workloads. No cache implementation is proposed from these counts. Parallel
execution of independent exact face metadata is a different CPU opportunity;
no implementation/build/benchmark was performed here.

### Narrow ordered execution design

Keep meshing and its validation, encode, volume/center/bounds, topology mapping,
blend/chamfer recognition and edge metadata serial. Meshing must finish before
workers access any triangulation. Construct the same indexed face map once;
preallocate one output slot and one exception slot per face. Each worker formats
a **complete face object**, including predecessors, signature, selected flag and
existing face() payload, into its own ostringstream. All mathematical operations,
all grid/ray predicates, candidate enumeration and sort/tie policy remain the
same. After workers join, append the strings in original face-index order and
then run the old edge loop. No worker writes the shared output stream.

Match the known caller's format explicitly: numeric flags, precision 17 and
locale from the existing output stream, plus fill state if used. Do not accept
the default ostringstream precision (6) or invent a new number formatter.
origins() keeps its existing sorted ID set and IsSame correspondence; result
predecessors/selectedFaces and recognition arrays are immutable inputs. Faces,
edges and adjacency index maps retain their exact original traversal order.
Each task writes only its own string/exception slot in an already-sized vector;
there is no vector growth while tasks are active. Parallel string construction
increases retained output memory; charge it to the request and consider bounded
face batches only as a separate measured tradeoff.

**Contexts must be per worker, not merely per output slot.** OffsetThicknessContext
owns mutable sample maps and one mutable all-face ray intersector; FaceChainContext
owns mutable ordered continuity caches. Build one of each per launcher worker,
reuse across that worker's assigned faces, and never share them concurrently.
Private worker contexts retain exact per-query ordering but reduce cross-face
cache sharing and duplicate body-wide adjacency / ray-tool construction. This
can erase speed gains or multiply peak memory. Constructing a full context per
face would particularly discard the already measured reuse benefit.

Pinned [OSD_ThreadPool::Launcher](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_ThreadPool.hxx#L199)
provides `Perform(begin,end,functor(threadIndex,faceIndex))` and a guaranteed
bounded worker-index range, suitable for private context slots sized using that
launcher's NbThreads(). Prefer this to OSD_Parallel::For for this candidate:
[pinned For](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_Parallel.hxx#L343)
discards threadIndex through its wrapper and can select an external threading
backend. Direct default-pool Launcher observes the current Makeshift thread
budget and avoids adding independent std::threads or changing the backend
globally. The [pool contract](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_ThreadPool.hxx#L28)
says reserving available workers makes nested users of that same pool run
sequentially when no pool workers remain. Keep outer meshing/Boolean stages
completed; do not start face jobs inside their worker tasks. This is not a
promise against oversubscription by some other library/OpenMP/TBB backend.
Force serial for one configured thread and small face counts; determine any
cutoff from measurements rather than treating all faces as uniform work.

Catch each face's C++/OCCT exception into its slot and replay the first failure
in original face order after join. Native Launcher alone forwards worker
Standard_Failure with its own scheduling priority and does not implement the
existing serial face-error contract. Earlier serial properties/recognition
errors retain priority and the edge loop begins only after successful face
results. Allocation, cancellation, signals, additional work before a replayed
failure and process-global side effects remain scheduling limitations, as for
the streaming Cut experiment. A successful output-parity run does not test
those failure paths.

### Concrete shared geometry hazard: private contexts are insufficient

Pinned [GeomAdaptor_Surface](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomAdaptor/GeomAdaptor_Surface.hxx#L345)
has mutable per-adaptor BSplSLib cache state. Fresh independently constructed
adaptors keep these caches private; do not copy an already-populated adaptor by
implicit member copying into multiple workers. Its
[ShallowCopy](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomAdaptor/GeomAdaptor_Surface.cxx#L118)
intentionally does not copy that cache and shallow-copies nested evaluators.
However its underlying Geom handles still refer to shared support objects.

Pinned [Geom_BSplineSurface::Resolution](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BSplineSurface_1.cxx#L2201)
lazily writes `umaxderivinv`, `vmaxderivinv` and `maxderivinvok` without a mutex.
[Geom_BSplineCurve::Resolution](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BSplineCurve_1.cxx#L704)
and [Geom_BezierCurve::Resolution](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BezierCurve.cxx#L663)
similarly initialize derivative-inverse fields; Bezier surface
[Resolution](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BezierSurface.cxx#L1986)
also initializes cached inverse derivatives. GeomAdaptor surface U/VResolution
and curve Resolution call these methods. Ray Intersector::InternalCall evaluates
U/VResolution for face/edge tolerances, so even each worker's **private ray tool**
can concurrently initialize the same untouched body's shared spline support.
Prior meshing may have initialized some of these fields, but is not a universal
source proof that all reachable caches are warm. Same-result writes are still
a C++ data race. This is a specific blocker to a blanket read-only-body claim.

Serial exact warmup of every reachable spline/Bezier support and basis/trimmed/
offset/revolution/extrusion curve/surface, including pcurves and geometry called
by continuity/classification, might remove these lazy writes after a join/start
happens-before boundary. It needs a complete transitive geometry audit and must
account for copies created inside algorithms; calling each face adaptor's
U/VResolution once is not automatically complete. Deep private support copies
are another option, with mapping/identity and setup costs, not a free safety fix.
Do not implement blanket parallelism on arbitrary BReps from this audit alone.

### Safest first experiment and remaining source boundaries

An initial sufficient **whole-body** guard can allow elementary analytic face
supports and analytic 3D/pcurve supports only, with no shared spline/Bezier or
nested offset/freeform geometry. Every worker's ray tool traverses **all** body
faces and its continuity chain can traverse neighbors, so an analytic current
face alone is an insufficient guard. Unknown support/wrapper types fall back
to the existing serial presentation. A complete guard must inspect stored
pcurves, not just BRepAdaptor_Curve::GetType on 3D edges. This deliberately
excludes cubic/freeform fixtures until their lazy/cache access paths are solved.

Source observations supporting this limited experiment: BRep_Tool::Triangulation
returns existing mesh handles; nodes/triangles are read after meshing;
ContinuityOfFaces builds local SurfaceProperties/GeomLProp/extrema objects and
reads support/pcurve handles without a BRep_Builder mutation; ray intersection
and classifiers keep their own sequences and local classification state.
Relevant pinned sources are
[BRep_Tool](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L109),
[ContinuityOfFaces](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib.cxx#L2049),
[BRepGProp::SurfaceProperties](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L211)
and [math Gauss tables](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math.cxx#L30)
(the ordinary surface signature path uses local properties/Gauss work and
constant tabulated values). This is not an exhaustive transitive thread-safety
certificate: offset/evaluator/osculating supports, missing planar pcurves,
Geom2d resolution, custom geometry subclasses and global algorithm state remain
audit boundaries. Kernel fork changes must also preserve these contracts.

Acceptance must cover exact ordered replies/encoding/origins at threads1/2/4,
shared support handles across adjacent and separately located faces, reversed
orientation, contact/coincident ambiguity, worker-context reuse, multiple body
results, source encoding and error precedence. Use a race detector where
available; output parity alone does not establish absence of races. Measure
construction overhead, per-worker context memory, load imbalance and serial
phase fraction along with paired end-to-end timings. This performs the same
exact CPU geometry work sooner; it is not a preview or display-only substitute.

### Follow-up: analytic-only guard and topology mutation audit

Further pinned-source inspection does **not** find a BRepTools::Update call in
this candidate's restricted ray/classification/adaptor paths. In particular,
[BRepAdaptor_Surface::Initialize](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAdaptor/BRepAdaptor_Surface.cxx#L76)
calls UVBounds for restriction, while
[BRepTools::UVBounds / AddUVBounds](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools.cxx#L59)
construct local boxes, locally change a copied face's orientation and read
pcurves/support bounds. They do not call UpdateFaceUVPoints or set Checked.
This distinction matters: the **separate**
[BRepTools::Update(face)](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools.cxx#L378)
does change UV endpoint data and the shared face Checked flag. Do not add Update
inside workers as a supposed harmless warmup, or assume UVBounds performs it.

[FaceClassifier::Perform](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepClass/BRepClass_FaceClassifier.cxx#L60)
uses local FaceExplorer and Extrema_ExtPS objects; the 3D-point overload reads
UVBounds then initializes/executes local extrema. FaceExplorer's computed face
bounds and probing state belong to that explorer. FClass2d constructs private
polygon classifiers and uses local BRepTools_WireExplorer state. The inspected
BRepClass and WireExplorer implementations contain no shared topology update or
Checked/Free mutation in these routes. ShapeIntersector Load constructs private
per-face adaptors, tools and optional polyhedra as already documented.

[CurveOnSurface](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L289)
returns the stored pcurve representation (including the orientation-dependent
seam branch). If none is stored on a plane,
[CurveOnPlane](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L356)
projects into newly constructed geometry; it does **not** attach that curve to
the edge. Nonetheless the first guard should reject missing stored pcurves to
avoid extending this audit to the projection route. UVBounds' analytic pcurve
bounding uses local
[BndLib_Add2dCurve](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BndLib/BndLib_Add2dCurve.cxx#L321)
computations rather than initializing spline resolution fields.

A concrete conservative first guard, evaluated serially after all preparation:

1. Every body's face support must be an **exact standard dynamic type** Plane,
   CylindricalSurface, ConicalSurface, SphericalSurface or ToroidalSurface,
   optionally beneath standard RectangularTrimmedSurface wrappers. Recursively
   unwrap with a finite depth cap; reject OffsetSurface, spline/Bezier,
   revolution/extrusion wrappers, unknown classes and custom subclasses. Merely
   testing GetType/IsKind can admit a subclass with unreviewed mutable behavior.
2. Every body edge's non-null 3D support must likewise be exact standard Line,
   Circle, Ellipse, Hyperbola or Parabola, optionally standard TrimmedCurve
   wrappers. The first candidate may reject degenerate/null-3D edges entirely;
   allowing cone/sphere pole degeneracies needs separate baseline coverage.
3. For **every face-edge incidence**, retrieve stored pcurves with
   `theIsStored`, examining both edge orientations so seam alternatives are
   covered. Require non-null stored exact standard Geom2d Line/Circle/Ellipse/
   Hyperbola/Parabola, optionally standard Geom2d_TrimmedCurve wrappers. Enumerate
   any additional edge curve-on-surface representations that reachable
   algorithms might consult; unreviewed representations fail closed. A serial
   guard must not call a topology builder to synthesize missing representations.
4. Original mesh validation must already have completed; triangulation node and
   triangle arrays are populated and remain untouched until join. Keep recognize
   blends/chamfers and every topology-changing operation before workers. Locations
   and support handles remain fixed; concurrent external document mutation is
   excluded by existing request ownership, not solved by this proposal.

These elementary support/conic objects expose geometry calculations on stored
gp values without the spline/Bezier derivative-resolution lazy fields. Standard
trimmed wrappers forward to those audited bases. Each independently constructed
adaptor's working state remains private. Shared
[TopLoc_Location::Transformation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopLoc/TopLoc_Location.cxx#L52)
reads an already stored transformation;
[ItemLocation construction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopLoc/TopLoc_ItemLocation.cxx#L26)
computes it eagerly. Mesh
[Node/Triangle accessors](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Poly/Poly_Triangulation.hxx#L142)
read arrays; this path does not use/update CachedMinMax or deferred mesh loading.
Read-only topology maps and support handles still require private algorithm
objects, as outlined above.

This narrows the demonstrated shared-lazy-write hazard away from eligible
supports, and no additional topology mutation was found in the inspected
analytic ray/UVBounds/classifier paths. It remains a proposed experiment contract,
not a universal thread-safety assertion for all transitive intersection/extrema
routines. First count actual guard eligibility on the expensive perforated
Fuse/Shell outputs: elementary-looking geometry may still carry spline pcurves
or unsupported representations and legitimately fall back. Eligibility setup,
private context construction and ordered buffering remain part of measured
request cost. Preserve the stable stream-format and first-face exception ordinal
rules above; adding threads cannot justify changing tie or predecessor behavior.

## Exact-query counter execution

The orchestrator compiled `trace-thickness-rays.cpp` as an isolated counts-only
preload and ran ten generated/captured cases with fresh native processes at one
thread. The first harness attempt used SIGTERM shutdown and got no destructor
report; it was corrected to close stdin and wait for normal EOF exit. That
initial configuration-only artifact is retained as `results/thickness-ray-counts-initial-no-destructor.jsonl`.

The completed `results/thickness-ray-counts.jsonl` preserves inputs, baseline and
traced full replies, all counters and stderr. No key/owner cap or unknown-owner
query occurred. Perforated extrusion/symmetric extrusion: six queries each,
zero repeats. Cut: 142, zero repeats. Fuse: 2,080, one repeat. Closed perforated
Shell: 62, zero; open perforated Shell: 1,285, zero. Notched closed: 208, two
repeats; captured notched: 277, 26 repeats. Bent closed: no loaded intersector
(retained operation result/error); captured bent: four, zero repeats.
These count attempts, not a guarantee of reusable successful results. Exact
query caching cannot remove meaningful work from the expensive perforated
Fuse on this evidence; no cache implementation is justified there.

Seven baseline/traced metadata comparisons match; three closed/captured Shell
outputs differ in face enumeration/predecessors and are preserved explicitly.
This diagnostic does not waive those differences or establish their cause.
Previous baseline-repeat investigations document related nondeterminism, but
this run did not independently repeat every differing case. Timings and memory
under the trace are invalid performance measurements.

The next separate kernel hypothesis is avoiding per-face/per-ray allocation of
Geom_Line and GeomAdaptor_Curve in IntCurvesFace_Intersector. Analytic support
ray tests currently construct both even when their setup can be reused safely;
source/lifetime/reentrancy proof and measurements are pending.

## Private-copy thickness-only parallel prototype (source artifact)

Artifact [patches/parallel-private-thickness.patch](patches/parallel-private-thickness.patch)
is against Makeshift HEAD `27a797dcdc147fe40546d8635bc630a396d127ea`.
Source-only working copies are in `/tmp/makeshift-parallel-private-thickness/`;
no production native file was edited or build/run performed in this lane.
A git apply --check passed against the current unchanged native files. The patch
adds 128-line parallel-thickness.cpp / 18-line header and a separate 122-line
geometry-ownership guard / 15-line header; presentation.cpp becomes 225 lines,
and new functions remain below 80 lines. CMake lists both new implementation
files. No kernel/header ABI change or replacement SDK is involved.

Only the exact **thickness payload** is prepared ahead of serial presentation.
The original face metadata still emits predecessors, signatures, selected flags,
mesh triangles, analytic handles, continuity chains, blends and chamfers on the
original result. Worker tasks invoke unchanged presentOffsetThickness using
private copied shapes/supports and format only its existing
`,"thickness":...` fragment. Cached fragments or deferred per-face exceptions
are consumed exactly where that original call occurred inside the ordered face
loop. Edges and geometry result encoding remain serial and unchanged.

Three same-binary modes use `MAKESHIFT_KERNEL_PRIVATE_THICKNESS`:

- Absent, off or unknown value: original serial path.
- `serial`: one deep-private context, computed serially in original face order,
  separating copy/representation and setup cost from CPU concurrency.
- `parallel` or `1`: available default-pool Launcher workers, each with its own
  deep copy, face map, sample cache and intersector.

All experimental modes require at least 16 faces; parallel additionally requires
at least two pool workers, including the caller. This cutoff is a conservative
prototype scope, not a measured optimal threshold. The direct default-pool
Launcher follows the existing configured thread budget. Optional
`MAKESHIFT_KERNEL_PRIVATE_THICKNESS_TRACE=1` emits active mode/worker count or a
setup fallback reason from the orchestrator thread; use only for untimed
eligibility diagnostics. Off/serial/parallel timing must leave tracing disabled.

### Geometry isolation guard, including the 2D offset blocker

CopyGeom=true alone was **insufficient** as a safety contract. The independent
[shell audit](private-thickness-copy-research.md) found pinned
Geom2d_OffsetCurve::Copy/SetBasisCurve can reuse an untrimmed basis curve, including
mutable spline Resolution fields. The source prototype therefore rejects any
stored Geom2d_OffsetCurve, including one under standard trimmed wrappers, and
unknown geometry subclasses. It does not revive the analytic-only guard: known
BSpline/Bezier supports are allowed only after ownership verification.

Before launching queries, a serial guard collects geometry handle addresses
from every original face surface and **every stored edge representation**:
3D curves, all curve-on-surface roots, first/second seam pcurves, regularity
surfaces and polygon-on-surface supports. It recursively follows standard
trimmed/offset surface and 3D curve bases, extrusion/revolution basis curves,
and 2D trimmed bases. Exact standard dynamic types permit analytic conics,
BSpline/Bezier leaves and these reviewed wrappers; unknown types, excessive
nesting and unsupported representations fail closed. Each worker copy's entire
collected set must be disjoint from the original and every earlier worker's
set before it is accepted. Shared roots/bases within one worker are allowed
because that worker executes serially. Setup or ownership failures discard
prepared state and return to the unchanged original serial path.

The guard checks **object handle graphs**, not arbitrary internal array storage
or all private evaluator fields. Standard spline/Bezier Copy constructors
allocate/copy data arrays; standard trimmed/3D offset/extrusion/revolution and
surface offset constructors clone bases and construct private evaluator/
osculating state, as documented in the shell audit. That source evidence is
required alongside runtime pointer disjointness. Unknown custom Copy semantics
are rejected, and this is not a global proof that all OCCT intersection routines
are race-free. No original geometry is accessed by worker tasks: original maps
and support collection/copying happen serially before queries, and caller stream
flags/precision/locale/fill are captured **serially** into immutable formatting
values. Workers use independent ostringstream objects without copying callbacks,
ties or invoking shared caller stream accessors.

### Mapping, seams and numerical parity boundaries

Pinned
[CopyModification](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_CopyModification.cxx#L35)
NewSurface/NewCurve/NewCurve2d copy supports, preserve tolerances and supply
unchanged orientation-reversal flags. The
[modifier rebuild](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.cxx#L254)
retains locations, natural restriction, ranges and seam alternatives. Its
[ModifiedShape map](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.lxx#L27)
looks up IsSame topology and can return a canonically FORWARD face. The prototype
therefore explicitly restores **each original indexed face orientation**, retains
the mapped location, checks location equality and membership in the copied
body, and requires copied-body face count plus indexed insertion count to match.
It inserts mapped faces in original face-map order, not new-copy traversal order.

OffsetThicknessContext samples are keyed by those private oriented faces, and
its ray tool loads that same private body. IsSame target tests therefore compare
private-to-private identities; no original face is compared against a copied ray
hit. Returned target indexes still come from the map populated in original index
order. Body root locations, seams and reversed face normals need runtime checks
because this source mapping audit is not numeric output verification.

CopyMesh=false removes geometric-face display meshes on private copies; workers
perform exact support/trimmed intersection and do not consume original display
triangles. Copying may generate/install a missing planar pcurve **on the copy**,
and constructors can normalize/rebuild parameter data even while preserving
mathematical geometry. These representation differences can alter UVBounds,
classifier boundary results or last-bit numerical values. The `serial` private
mode is therefore a necessary correctness control before assessing parallel
mode. Failures of exact metadata parity cannot be dismissed as harmless copying;
retain raw replies, tolerance-sensitive cases and the old source geometry.

### Error schedule, cost and acceptance

Every face task catches its own failure into a preallocated exception_ptr slot.
Original face predecessors/signature/mesh/analytic work executes before replay
at that face's old thickness position; earlier serial face failures still win.
A worker's prior face failure does not suppress later tasks. Copies/setup failures
fall back serially; no new setup error is surfaced in place of an old later face
error. Signals, allocation exhaustion, extra work before replay, and generic
process-global/cancellation side effects remain scheduling limitations.

Serial copies and guard walks, duplicate all-face ray initialization/sample
caches, retained fragment strings, and copied support memory are charged to the
request. Parallelism may lose the old cross-face cache sharing and load balance;
no speedup or acceptable memory footprint is established by this patch.
Require off/serial/parallel exact full metadata and source encodings on the shared
28-case corpus, focused seams/locations/reversals/missing pcurves/offset2D
fallback, and regression suites. Use untimed trace to prove each candidate
actually activated instead of silently falling back. Include per-face exception
ordinal tests, copied-body identity checks and race detection where available.
Only after serial private representation parity should randomized paired
same-binary mode timings and memory measurements assess the CPU benefit.
