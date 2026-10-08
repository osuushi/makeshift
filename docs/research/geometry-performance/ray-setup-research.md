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
