# Rigid transforms without geometry copies

Source-only investigation, 2026-10-08. No transform prototype was built or run,
and production source was not edited. OCCT baseline source pin:
`a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3).

## Opportunity and conservative condition

Makeshift's [transformBodies](../../../native/kernel/transform.cpp) currently
passes `true` as `theCopyGeom` for every `BRepBuilderAPI_Transform`, including
rotation/translation. OCCT has an explicit location-only path for a direct
isometry. Test `theCopyGeom=false` exclusively for `kind="transform"`, whose
matrix is constructed from rotation and translation. Keep mirror, uniform
scale, nonuniform scale, and other affine routes unchanged.

A conservative prototype guard is `!mirror && !scale && !transform.IsNegative()
&& transform.ScaleFactor() == 1.0`. These rotation/translation constructors
should produce unit scale; if the check fails, retain `true`. Do not introduce
an application tolerance that silently accepts a small genuine scale. OCCT
already checks its own `TopLoc_Location::ScalePrec()` internally.

This could remove per-surface/per-curve copying and reduce accumulated rounding
from repeatedly transforming spline control points. It is a kernel-usage
optimization, not a preview change or mesh approximation. Expected gains remain
unmeasured; presentation and volume work may dominate the total request.

## Pinned kernel behavior

[`BRepBuilderAPI_Transform::Perform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Transform.cxx#L44)
uses the modification path if copy geometry is requested, the transform is
negative, or `abs(abs(scale)-1) > ScalePrec()`. Otherwise it stores the transform
as a location and returns `theShape.Moved(myLocation)`, then marks the operation
done. Thus `false` cannot bypass reflection/scaling handling in OCCT; the
proposed narrower application guard nonetheless leaves those established paths
completely untouched.

[`TopoDS_Shape::Moved/Move`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopoDS/TopoDS_Shape.hxx#L194)
copy the shape wrapper and pre-multiply its location. They do not modify the
input wrapper, its orientation, or shared TShape geometry. The result shares
the original TShape; this is shared storage, not a deep immutable copy.
Subsequent methods that alter triangulations, tolerances, or geometry through
that TShape can affect all partners within that request. Mutability must be
assessed at the caller boundary, not inferred from a `const` shape reference.

[`BRepBuilderAPI_Transform::ModifiedShape`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Transform.cxx#L68)
returns `S.Moved(myLocation)` on the location-only path. Input face/edge wrappers
already include their cumulative parent location; applying the same leading
location should keep correspondence to result enumeration. It preserves
orientation and has the same transform composition order as moving the body.
The `Modified()` list similarly contains that moved subshape. Test located
children explicitly; no custom history remapping should be needed.

In contrast, [`BRepTools_TrsfModification::NewSurface`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_TrsfModification.cxx#L65)
conjugates the transform through a support's existing location and calls
`S->Transformed(LT)`, creating transformed geometry. `NewCurve` and `NewPoint`
likewise transform geometric data. This can shift local support coordinates
and spline poles toward large world coordinates. It does not mean every
existing root/subshape location is flattened identically; the modifier respects
existing support locations.

The constructor's fourth argument, `theCopyMesh`, defaults to false. The
modification's [`NewTriangulation`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_TrsfModification.cxx#L96)
copies/transforms triangulations only when that flag is enabled. The location
path simply shares any existing mesh and uses a new location. It does not make
a deep mesh copy even if the flag is supplied; the flag is consumed only by
the modification path.

## Makeshift boundaries and limitations

- [Presentation](../../../native/kernel/presentation.cpp) retrieves each face's
  triangulation location and explicitly transforms its nodes into world space.
  Analytic face/edge metadata, properties, bounds, signatures and chain contexts
  use OCCT adaptors or located shapes. This is compatible in principle with a
  root location, but all those outputs need regression coverage.
- `present()` invokes `BRepMesh_IncrementalMesh`, which can mutate the shared
  TShape's mesh. The result's input partner is transient within the same native
  request; do not generalize this to a future persistent shared-shape cache.
- [encode/decode and operands](../../../native/kernel/main.cpp) serialize exact
  BRep with `theWithTriangles=false` and reconstruct a shape separately for each
  body on each request. Located shape serialization is supported by
  [`TopTools_ShapeSet`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopTools/TopTools_ShapeSet.cxx#L748),
  including the location table and wrapper location. However, **there is no
  existing triangulation to reuse across ordinary Makeshift requests**, because
  it is deliberately omitted from the BRep string. Mesh-sharing speedups should
  not be claimed for this architecture.
- Input source entities are mapped through `operation.ModifiedShape()`.
  Presentation matches predecessor shapes with `IsSame`, which includes
  location. Moved-body and moved-entity locations must match exactly.
- The application-level `duplicate` flag is independent of `theCopyGeom`.
  `result.copy`, participant lists and predecessor IDs should remain unchanged.
  [kernel-result.ts](../../../src/backend/kernel-result.ts) creates fresh body,
  face and edge IDs for `copy=true`; replacement transforms recover existing
  identities. A duplicated body becomes its own serialized BRep and is decoded
  independently on the next request. Sharing ephemeral TShapes therefore does
  not itself create persistent document identity or cross-body aliasing.
- Nonuniform scaling uses `BRepBuilderAPI_GTransform` and analytic plane
  replacement; keep both unchanged. Uniform scaling and mirror must retain
  their current copy and validity/positive-volume checks.
- Recentering volume is a separate running experiment. Measure location-only
  transforms independently before combining changes, so effects are attributable.

## Required tests before integration

| Dimension | Cases and checks |
| --- | --- |
| Basic rigid transforms | Identity; pure translation; rotation with origin/off-axis pivot; rotation plus translation; inverse round trip. Verify valid solids, volume, center and tight bounds against analytic expectations. |
| Existing locations | Root location, nested located face/edge wrappers, repeated serialized moves, and located spline/cylinder. Verify `ModifiedShape` membership, orientations and predecessor IDs. |
| Geometry complexity | Box, 31-face perforated stock, nonrational cubic extrusion, rational/twisted extrusion, periodic cylinders, trimmed/notched and bent shell fixtures. |
| Large coordinates | Origins at ±1e3, ±1e6, ±1e9 with small/normal feature sizes; small rotations after large translations. Compare local-coordinate representations and independent geometric reference errors, not only candidate-versus-baseline agreement. |
| Document identity | Move versus duplicate; original unchanged after duplicate; subsequent independent face edit/Boolean/shell on each body; Undo/Redo and serialization reopen. Native equivalent output alone does not prove these model interactions. |
| Excluded routes | Mirror with/without keepOriginal, uniform scale including 1, nonuniform scale, pivoted scale. Verify byte-identical routing/configuration and existing output behavior. |
| Mutability | Compare input geometry encoding before/after transform and after meshing; check separate result/original requests. Instrument TShape partnerships to establish where storage is shared. |
| Presentation | Face/edge metadata, chain/thickness/blend references, triangle winding, world-space display nodes, edge samples and topology order. Baseline and candidate meshes can differ while both are geometrically valid; record that distinction explicitly. |
| Performance | Separate transform construction, validation, volume, meshing, topology analysis and serialization. Paired blocked timings and fresh-process RSS/HWM; preserve negative results if copies were insignificant. |

Acceptance should require exact identity/participant/copy semantics, unchanged
analytic topology, located geometry equivalence, valid downstream operations,
and appropriate geometric error bounds. Exact BRep strings will differ by
design, so byte equality is not the correctness criterion. Do not promote this
candidate merely because it preserves volume more accurately on one translated
circle fixture.

## Isolated prototype artifact and targeted next fixtures

[rigid-transform-location.patch](patches/rigid-transform-location.patch) changes
only the geometry-copy argument for explicit `kind="transform"` with positive
unit scale. It leaves the document duplicate flag, all predecessor calls,
participants, validity checks, mirror/scaling branches and presentation untouched.
The artifact has not been applied, compiled, or benchmarked.

Before timing, prepare a fixed original BRep through an independent constructor
process, then feed the exact same serialized body to baseline and candidate.
Use an analytic box, the nonrational cubic stock, the offset-circle twisted stock,
and the trimmed notched cylinder. A compact first-stage matrix is:

1. Identity, translation `[23,-17,8]`, and 37-degree rotation about an off-origin
   pivot `[5,3,-2]`, each as replacement and duplicate. Check world geometry,
   oriented topology, predecessor mappings, copy/participant flags, and that the
   original serialized input still decodes to its original shape.
2. Translation `[1e6,-1e6,2000]`, then small rotation, and inverse round trip.
   Use analytic invariants and local-coordinate checks; agreement with baseline
   alone cannot establish accuracy after the baseline transforms control points.
3. Location-sensitive route: serialize the first translated result, decode it,
   rotate it in a second request, serialize/decode again, then shell/cut it. For
   isolation, compare both executables on **the same** located input fixture;
   separately compare complete baseline-generated and candidate-generated edit
   chains to detect accumulated representation effects.
4. Plane mirror with both keepOriginal values; uniform factor 2; nonuniform
   factors `[2,1,0.5]`; and uniform factor 1. These are negative controls: their
   route remains `copyGeom=true`, even though the latter two may preserve volume.

Source mutation audit: the location-only `Moved()` branch changes wrapper
location and does not call the geometry modifier. Meshing is still explicitly
mutable: [`BRepMesh_ModelPreProcessor::Perform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepMesh/BRepMesh_ModelPreProcessor.cxx#L310)
nullifies outdated face/edge meshes. Capture input exact encoding before the
transform, after construction/validation, and after `present()` to separate
exact-geometry mutation from expected transient mesh cache mutation. Encoding
omits triangles, so an unchanged encoded string alone does not prove full
in-memory immutability. Check support handles/poles/tolerances and partner mesh
handles in a dedicated kernel fixture if a persistent shape cache is proposed.

For native full-output comparisons, ignore only BRep string contents and compare
all other output fields first at the established `1e-9` tolerance, preserving
metadata and ordering. If mesh triangulation changes, establish baseline-repeat
stability and geometrically validate triangles before deciding whether a change
is acceptable. Independently verify encoded result geometry and every mapped
entity after decode, because signature matching is approximate and not a proof
of correct location or unchanged surface geometry.
