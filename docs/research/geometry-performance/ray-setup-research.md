# Analytic face-ray setup reuse experiment

Source-only audit and patch preparation, 2026-10-08. No compilation, geometry
run or benchmark in this lane. OCCT pin
`a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3).

## Redundant setup and API semantics

Pinned [IntCurvesFace_Intersector::Perform(gp_Lin)](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L353)
creates a heap `Geom_Line`, a stack `GeomAdaptor_Curve`, then a heap copy of that
adaptor on every ready face query. The face intersector stores surface/topology
preparation, but not this per-ray line preparation. Many rays against many faces
multiply these two allocations; allocation counts/time remain to be measured.

The constructor creates a polyhedron for nonanalytic supports; ready
plane/cylinder/cone/sphere/torus faces have `myPolyhedron==nullptr`
([constructor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurvesFace/IntCurvesFace_Intersector.cxx#L125)).
The prototype restricts reuse to that no-polyhedron branch. Unready geometry
still returns before scratch acquisition. The handle-curve Perform overload
and polyhedron sampling/bounding branches remain untouched.

`Geom_Line` construction and [SetLin](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_Line.cxx#L86)
both copy `L.Position()`, without reevaluating coordinates. Adaptor
[Reset](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomAdaptor/GeomAdaptor_Curve.cxx#L167)
nulls curve, nested evaluator, spline pointer and evaluator cache and resets
parameter bounds/type. [Load](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomAdaptor/GeomAdaptor_Curve.cxx#L180)
then reconstructs type/range from the line. Merely changing a line followed by
Load of the same existing handle is insufficient as a general cache-reset
contract; the prototype always Reset/SetLin/Load in that order.

## Lifetime and reentrancy proof constraints

The inspected [IntCurveSurface_HInter header](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurveSurface/IntCurveSurface_HInter.hxx)
has no data members beyond its Intersection base. That
[base](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurveSurface/IntCurveSurface_Intersection.hxx#L102)
stores point/segment sequences and status, not the adaptor handle. Segments
store two intersection points by value; points store coordinates/parameters
and transition. The generated HInter implementation comes from
[IntCurveSurface_Inter.gxx](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntCurveSurface/IntCurveSurface_Inter.gxx):
curve handles are arguments/local algorithm objects, and AppendPoint evaluates
them into value results. `InternalCall` subsequently copies those results into
the face's point/state sequences. This supports reuse **after** HICS and its
call-local references are destroyed, not mutation during intersection.

The prototype adds one lazy thread-local line/adaptor pair, guarded as follows:

- A lease marks scratch busy for the entire operation, including classification
  and HICS destruction. Nested calls on this thread take fresh setup; different
  worker threads have separate scratch.
- Before reuse, adaptor refcount must be exactly one (the scratch owner), and
  line refcount exactly two (scratch line plus adaptor curve). These conditions
  are checked **before** constructing another local owning handle or mutation.
  An externally retained adaptor, or shallow copy retaining its underlying
  line, forces fresh setup. Nothing is reset or mutated on that fallback.
- Scratch starts with both handles null. Partially initialized inconsistent
  state after an exception forces fresh setup subsequently. Lease destruction
  still clears busy; no geometric result is fabricated after an exception.
- The lease is declared before HICS, so C++ destruction releases local HLL,
  LL/line and HICS before clearing busy. Unexpected retained handles at the
  next acquisition block mutation through the refcount check.

Refcounts do not prove safety for unsupported retained raw pointers; no such
escape was found in the pinned call chain. Do not extend this inference to
arbitrary callbacks/plugins or other kernel versions without an audit. Sharing
the same mutable face intersector concurrently/reentrantly is already outside
its existing contract; TLS protects only the new scratch ownership.

## Independent patch artifact and provenance

[patches/intcurvesface-ray-setup-reuse.patch](patches/intcurvesface-ray-setup-reuse.patch)
targets the original pinned intersector source. Full candidate:
`/tmp/intcurvesface-ray-setup-candidate.cxx`.

The full source suffix beginning at `parinf=ParMin` is byte-identical to the
original. IsDone setup/SeqPnt clearing before ray setup, HICS Perform calls,
point ordering, range tests, classifier tolerances, UV projection, transitions,
all face selection and polyhedron handling remain unchanged. The fallback
constructs the original fresh line and adaptor copy; its stack adaptor is
default-constructed then Load-ed, equivalent to the original inline constructor
which calls Load. No class header/member/layout changes occur.

~~~text
original SHA256 88e2c0b6891ef15a3eaf7d954975e2ba2c153771dd7144669cbeb4a8e98c35b2
candidate SHA256 245ef9a381e03f051a49ece160b6b5ba4adcf3572b2f2819607d91478abaa4f0
patch SHA256 1dcd8af96fc742bda45cc64835cfb9018a03a67255677ba7ca0acb20a005e974
SDK header SHA256 48bcc09fabf86eac4dc30db3125dc1dcd0c53859c6cd03a0c2ffb5235aa67810
~~~

Fresh temporary original was patched and compared byte-for-byte to the
candidate. Original source and SDK remain untouched. Full candidate 596 lines
(original 529), patch 90 lines; original gp_Lin Perform already exceeds 80 lines.
New lease methods remain short. Original OCCT notices are retained; source
distribution/build artifacts must include the pinned LGPL/exception files and
exact patch/compiler/toolkit provenance. This is research isolation, not an
installed kernel patch.

## Strong follow-up tests and performance limits

## Initial execution checkpoint

The orchestrator compiled original-source control and reuse modules with
`bash tests/geometry-performance/build-ray-setup-preloads.sh` (owns compute lock).
Both preserve SDK/source/header bytes; hashes are in
`results/ray-setup-build-hashes.txt`. The immutable application is the streaming
candidate recorded in the preceding checkpoint; modules are preloaded only into
their selected native processes, not installed in the SDK.

SDK→control and control→reuse full 28-case comparisons match all stable baseline
cases. Four closed/captured Shell cases vary within their baseline repeats;
their raw differences remain in `results/ray-setup-{control,reuse}-full-output.json`.
The same bent closed-Shell rejection remains. No automatic ordering waiver is
introduced. Thirty named regression tests in seven real model/native test files
pass in 38.6 seconds; see `results/regression-ray-setup-reuse.log`.

The public ray diagnostic tests five analytic primitives with original,
translated and rotated wrappers, twenty alternating line/range queries, and
each of three captured spline/analytic BReps. Serial and four-reader modes use
independent contexts and serial Load before the barrier. All 6,900 ordered
query rows per variant match SDK, original-source control and reuse byte-for-byte,
including all 9,510 hit records, status/range/location/UV/transition bits.
All report done, no exception; reversed/zero ranges retain the observed baseline
behavior. Full raw files: `results/ray-probe-*-{serial,threads}-{sdk,control,reuse}.jsonl`.
These tests do not exercise unsupported retained raw pointers or inject every
reentrancy/OOM scenario; safety there rests on the stated guard/fallback contract.

Untimed constructor counters confirm that the patch actually interposes:
perforated Cut 15,358→10,855 gp_Lin Geom_Line constructions; Fuse 114,317→37,219;
open perforated Shell 122,245→11,182; captured bent Shell 134→59.
All four full metadata comparisons match and thickness ray query counts stay
identical. These count all visible constructor call sites, not allocator calls;
hidden/inlined calls may bypass instrumentation. There were no nested-count
duplicates and both SDK constructor aliases resolved to the same implementation.
Raw inputs/replies/stderr: `results/ray-setup-constructor-{control,reuse}.jsonl`.
No timing inference is made from these instrumented runs. Forty randomized
paired application blocks at four threads subsequently completed separately.

1. Compile an unmodified-source preload control first and check actual ELF
   binding for this Perform overload. Compare control/SDK output bits before
   attributing candidate changes to setup reuse.
2. Alternate many distinct line origins/directions on one face and many faces:
   planes, cylinder/cone/sphere/torus, tangency/parallel rays, holes/seams,
   bounded ranges, reversed orientations and translated/located supports.
   Compare IsDone, parallel flag, point count/order, full XYZ/UV/W, transition
   and state bits. Repeat original spline/polyhedron and handle-curve cases as
   unchanged-path controls.
3. Test nested different-face calls from an instrumented HICS entry and verify
   scratch busy selects original setup. Inject an exception in the active
   call chain and ensure the next query recovers safely. Use source-only test
   hooks for retained adaptor and shallow-copy-line handles to verify no old
   handle changes when the next ray is prepared; avoid production hook APIs.
4. Test simultaneous first use and many queries on separate intersectors across
   workers. Preserve SDK thread count and stable ordered metadata/BRep outputs.
   Do not promise shared-intersector concurrency through this optimization.
5. Count analytic calls, two-object allocations, reuse and fallback reasons in
   an untimed trace. Then benchmark serialized randomized paired requests on
   metadata Fuse, perforated shell, plain extrusion and mixed spline inputs.
   No additional ray, face or classifier check is skipped.

The hypothesis removes setup allocations after one warm acquisition per worker,
but adds TLS/guard/refcount/reset operations. Analytical intersection and trimmed
classification may dominate remaining cost; only measured request latency can
establish payoff. Thread-local capacity is one pair per participating worker,
not a body-size cache. Cleanup timing/resource-allocation failures differ from
fresh allocation, so no equivalence under memory exhaustion is claimed.

## Second independent variant: avoid unused cached-path stack setup

[patches/intcurvesface-ray-setup-reuse-minimal.patch](patches/intcurvesface-ray-setup-reuse-minimal.patch)
also targets the **original** intersector source; do not apply it atop the first
patch. Full source is `/tmp/intcurvesface-ray-setup-minimal-candidate.cxx`.
The first patch and first temporary candidate were left unchanged, including
their documented SHA256 values. No compiled module was edited.

This variant retains the same TLS pair, refcount prerequisites, busy lease,
Reset/SetLin/Load and analytic-only eligibility. On a cached call it constructs
only the local owning HLL needed by HICS. On fallback it constructs fresh
`Geom_Line` and `GeomAdaptor_Curve LL(geomline)` **inside the else branch**, then
assigns `HLL = new GeomAdaptor_Curve(LL)` before those temporary owners die.
This restores the original constructor form in fallback while avoiding an
unused default adaptor and empty line-handle lifetime on the cached path.

HLL's copied adaptor owns its `myCurve` handle: destroying branch-local LL and
geomline removes their two extra references but does not destroy the line.
HLL remains alive through HICS.Perform and InternalCall; HICS has no retained
curve member and its destruction precedes lease release. The busy lease still
dies last. The inspected HICS/curve-tool implementation
does not branch on line/adaptor `GetRefCount`, and no branch-local LL address is
published. All numerical range/classification code after `parinf=ParMin` remains
byte-identical to both original and first variant. Scratch/lease code was
asserted identical to the first variant during artifact generation.

Observable caveat: a hypothetical external refcount probe sees fewer temporary
line owners on fallback (one owning adaptor rather than adaptor plus LL plus
geomline) and destruction timing changes. This is valid owning-handle lifetime,
not preservation of incidental refcounts; do not claim equal allocator/refcount
traces. Unsupported retained raw pointers cannot be justified by the lifetime
audit. Exception behavior during construction still unwinds owning handles and
the busy lease; earlier temporary destruction may change resource accounting.
No mathematical result is intentionally changed.

~~~text
minimal candidate SHA256 a932754ec76d4974bb0fedd0aaad73d16ef834a6d6e8d590503cab864f210e1d
minimal patch SHA256 bf5d6a678afb27d12e285f0aba6ca88031a5a179d315cc07f9fa162f7a44bdc0
~~~

The original hash is the same pinned hash above. Fresh original was patched
and byte-compared to the minimal candidate. Full source is 595 lines; patch
89 lines; upstream source/function size warnings remain unchanged. This was
initially a source-only proposal; the execution update below supersedes that
status without treating its lifetime audit as runtime proof.

## Execution update: first confirmation and minimal variant

The first reuse implementation completed forty randomized paired blocks on
eight application workloads at four threads. Perforated Fuse has a paired
median speedup of 1.01348, bootstrap 95% interval 1.00376–1.03321, candidate
median 437.69 ms. All other seven intervals include 1: perforated extrusion,
Cut, open Shell, cubic implicit subtraction, captured notched and bent Shell,
and the axis-conditioned twisted circle extrusion. Constructor reduction
therefore does not establish a substantial request improvement. Raw and
summary: `results/ray-setup-confirmation{.jsonl,-summary.json}`.

The minimal variant was built by `tests/geometry-performance/build-ray-setup-preloads.sh
minimal`, which owns the compute lock and leaves SDK libraries and original
source untouched. All 6,900 public-SDK ordered query rows match the SDK bit for
bit across plain primitives and three saved B-REP fixtures in serial and
independent-shape four-thread modes. These include 9,510 reported hits per
variant. The corresponding SDK, original-source control, and first reuse
outputs also match. Raw: `results/ray-probe-*-{sdk,control,reuse,minimal}.jsonl`.

The minimal application wrapper also matches original-source control on all
25 selected workload comparisons, each with a baseline repeat. The
closed bent-shell case retains the same construction error; it is not a
successful shell result. Raw: `results/ray-setup-minimal-full-output.json`.
The first reuse version passed 30 named native regression cases across seven
files; those checks were not automatically attributed to the minimal variant.

A separate forty-block three-way application run completed with source control,
first reuse, and minimal reuse. All geometry/predecessor multisets match; the
notched Shell retains baseline enumeration variability, recorded as ordered
differences rather than silently considered exact output parity. The minimal
variant resolves no speed gain on any of the eight workloads. Fuse is 0.99866
(95% interval 0.98950–1.01216); open Shell is 0.99968 (0.97518–1.02347).
The first variant's initial 1.3% Fuse effect does not reproduce: 0.99685
(0.98760–1.01019). A small 1.01684 notched-Shell effect appears for first reuse
in the second run, but was absent in the first. These are exploratory pointwise
intervals across several comparisons, not multiplicity-adjusted discoveries.
There is no consistent substantial end-to-end benefit in either implementation.
Raw and summary: `results/ray-setup-minimal-confirmation{.jsonl,-summary.json}`.

Nested reentry, retained-handle injection and exception-injection gates remain
unrun; no production kernel patch is adopted. The negative performance evidence
does not justify expanding this candidate's validation solely to adopt it.
