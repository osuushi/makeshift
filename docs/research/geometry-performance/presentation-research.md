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
