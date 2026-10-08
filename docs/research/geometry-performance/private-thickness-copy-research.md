# Private geometry copies for parallel exact thickness metadata

Source audit only, 2026-10-08. No implementation, compilation, benchmark or
runtime race test was performed in this lane. OCCT is pinned to
`a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3). This proposal keeps
signature, mesh, face chains and JSON emission serial and preserves the exact
thickness sampling/classification/ray algorithm.

## Decision and important restrictions

Serially constructing one `BRepBuilderAPI_Copy(original, true, false)` per
worker is a plausible way to isolate spline surfaces and most standard curve
geometry. It is **not a universal recursive deep-copy contract**. A concrete
standard exception is `Geom2d_OffsetCurve`: its copied wrapper can share the
original basis. Reject offset pcurves recursively in an initial prototype,
including offsets nested under trims; reject unreviewed dynamic subclasses.
Alternatively, separately clone and attach offset bases on private topology
serially, with representation/fidelity checks. That extension is not implemented.

The second mandatory correction is occurrence orientation: raw
`copy.ModifiedShape(originalFace)` is insufficient. Use the mapped shape with
`originalFace.Orientation()` restored before adding it to the private indexed
face map. Preserve location supplied by the modifier; do not apply location a
second time. Otherwise inward/outward slope can change on reversed faces.

## What Copy actually copies

[BRepBuilderAPI_Copy construction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Copy.cxx#L29)
uses `BRepTools_CopyModification` and `DoModif`. The
[modification](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_CopyModification.cxx#L34)
returns new surface, curve and point information for every face, edge and vertex;
`copyGeom=true` delegates surface/3D curve/pcurve copying to virtual `Copy()`.
Tolerances, edge parameters and continuity are preserved by value. Copying
surface/curve representations is per topology element rather than a guaranteed
preservation of original geometry-handle aliasing between different elements.

[Modifier rebuilding](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.cxx#L249)
constructs new faces/edges, retains their locations, and rebuilds containing
topology when children change. Vertices are made anew in `CreateNewVertices`.
Pcurves are installed on mapped edges and mapped faces, including both oriented
representations of true seams. The default modifier has `myMutableInput=false`;
parameter updates target copied vertices. `SetShapeFlags` copies flags to results.
`TopoDS_Builder::Add` freezes a child's TShape, but the geometric children in this
copy route are new. An empty nongemetric container can remain shared: do not
describe this operation as making every possible TShape in an arbitrary compound
private. Such empty containers are not evaluated by thickness.

The standard surface deep-copy paths inspected are:

- [BSpline Copy and array constructors](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BSplineSurface.cxx#L134):
  new poles, weights, knots and multiplicity arrays; derivative-resolution cache
  starts uninitialized in the new surface.
- [Bezier Copy/private constructor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BezierSurface.cxx#L465):
  despite passing handles to the constructor, it allocates and copies arrays;
  Copy at line 2046 creates that private object.
- [Rectangular trim constructors](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_RectangularTrimmedSurface.cxx#L50)
  copy basis geometry; the offset-special handling constructs new wrappers/bases.
- [Offset surface construction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_OffsetSurface.cxx#L71)
  copies the basis before rebuilding its evaluator/osculating preparation.
- [Linear extrusion](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_SurfaceOfLinearExtrusion.cxx#L58)
  and [revolution](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_SurfaceOfRevolution.cxx#L65)
  copy their basis curves and construct new evaluators. Ordinary elementary
  surfaces copy stored gp primitives into new objects.

Standard 3D BSpline/Bezier curves and their trimmed/offset wrappers similarly
copy arrays or recursively copy their bases. Standard 2D BSpline/Bezier curves
copy arrays, and [Geom2d_TrimmedCurve](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom2d/Geom2d_TrimmedCurve.cxx#L44)
calls its basis's `Copy()`.

However, [Geom2d_OffsetCurve::Copy/SetBasisCurve](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom2d/Geom2d_OffsetCurve.cxx#L43)
creates a wrapper from `basisCurve`, then assigns the untrimmed checking basis
directly, without `Copy()`. A fresh evaluator does not make that basis private.
For example a BSpline basis has a lazily written
[Resolution cache](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom2d/Geom2d_BSplineCurve_1.cxx#L703).
This is a demonstrated sharing mechanism, not a runtime demonstration that the
current thickness call graph races on every such curve. It invalidates a blanket
deep-copy safety claim nevertheless.

Makeshift's `decode` uses `BRepTools::Read` in `native/kernel/main.cpp`.
[The standard pcurve reader](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomTools/GeomTools_Curve2dSet.cxx#L675)
accepts offset curves, so "decoded standard geometry" does not remove the
exception. Public virtual `Geom_Geometry::Copy()` promises a new object, not a
proof of all subclass transitive ownership. Check exact dynamic types recursively
through swept/trimmed/offset bases if supporting arbitrary SDK-produced geometry.

## Missing pcurves, identity and ordering

[CurveOnSurface/CurveOnPlane](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L289)
can synthesize a missing planar pcurve. It returns a transient projected curve;
there is no original-edge attachment in this getter. Copy then stores a copied
version on its private edge. Building copies serially avoids concurrent use of
the original during this preparation, including potentially more expensive
projection branches. See [missing-pcurve audit](missing-pcurve-audit.md).
This does change stored representations relative to the source. It needs a serial
copy-only control before attributing any output change to parallelism.

[ModifiedShape](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.lxx#L24)
returns the map value without restoring input orientation. Rebuild sets the
mapped result orientation to `ResOr`, normally FORWARD, and applies occurrence
orientations when adding children. Restore the original face orientation explicitly.
Map original faces in original indexed order, and require each private map `Add`
to return that same index; reject null/non-face mappings or accidental collapse.
Do not use a fresh copied-body traversal as the metadata index authority.

Each worker's ray context must load its own copied body; all candidates and sampled
faces must belong to that same copy. Ray matching uses `IsSame(target)` and is
therefore invalid if even one original face leaks into a private candidate map.
Copy rebuilding preserves child insertion order, but seam/located/repeated-face
corpus comparisons must verify tie behavior rather than assume it from face count.

## Minimal execution contract and follow-up controls

Create the launcher first, then serially build one private copy/map/context for
each actual `Launcher::NbThreads()` (includes the caller). Cache ownership is per
thread index, not per scheduled face; otherwise adjacent tasks could share mutable
ray tools. Preserve lazy UV caching, all 121 sample positions/order, reverse-source
classifiers and ray checks. Preallocate per-face strings/exception slots; workers
write distinct slots and do not resize shared vectors.

[Launcher::Perform](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_ThreadPool.hxx#L201)
uses an exclusive end index, while its upper **thread** index is inclusive.
[Its implementation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_ThreadPool.cxx#L191)
blocks until workers finish. Catch per-face exceptions inside the functor and
rethrow only when that face's serial thickness emission is reached. This preserves
earlier serial signature/analytic metadata/chain failure priority more faithfully
than rethrowing all cached errors immediately after precomputation. Copy/allocation
failures and abnormal process termination still have different resource/error
behavior; do not claim universal exception parity.

Match output flags, precision and locale on each private string stream; merely
copying precision misses locale/float formatting. Width is a one-shot stream state:
the actual production caller should be checked rather than promising arbitrary
ostream equivalence. Avoid `copyfmt` callbacks/tie/pword sharing unless audited.
The cached text must include exactly the original `,"thickness":` field and be
spliced at the existing call site, after the serial analytic fields.

First compare serial-original, serial-private-copy and parallel-private-copy
outputs on perforated union/open shell, reversed/located faces, seams, bent and
notched freeform bodies. Require full ordered JSON agreement, thickness indices,
distance/slope and target descriptor agreement. Check source serialization plus
flags/tolerances/geometry handles before/after copying; serialization alone cannot
detect unencoded caches. Include an offset-pcurve fixture to prove conservative
fallback, and shared BSpline support/trim fixtures for isolation. Race-sanitizer
coverage remains desirable; deterministic output is not a thread-safety proof.

The cost includes W complete geometry copies, serial preparation and W lazy ray
loads, potentially multiplied surface arrays because Copy does not retain all
source aliasing. Cap actual workers and account for memory before benchmarking.
Small/simple bodies may lose even if the computational stage scales well.
