# Mass integration conditioning by value-only placement changes

Source-only experiment, 2026-10-08; no compilation or execution in this lane.
The orchestrator's prior thin-box result motivates this experiment: translated
Z integration had about 1.7e-6 actual relative mass error despite an estimated
error around 1.4e-11. Those figures are a reported result, not a run of this
new harness.

[quadrature-recenter.cpp](quadrature-recenter.cpp) compares the original BRep
with two TopoDS value copies: inverse root location and translation by the
negative exact bounding-box center. All generated root transforms here are
translations; inverse-root mode removes that placement without transforming
underlying supports. Both variants use Shape::Moved and retain the same root
TShape and orientation. No BRepBuilderAPI_Transform, deep copy, remeshing,
support rewrite or geometry approximation occurs.

For each placement variant, the harness runs XYZ plane normals in both signs,
with zero, low-minus-one and mirrored-low-minus-one supplied planes. The latter
retains the diagnostic reference convention used by the primitives experiment.
VolumePropertiesGK options and requested eps=1e-10 are unchanged; analytic
references measure **actual** error separately from the API's estimated error.
Each variant gets serial exact BRep validation. Source encoding before/after,
location and orientation are compared exactly; a deterministic FNV-1a checksum
is printed as a compact diagnostic, but acceptance uses full byte equality.

Fixtures reuse local box/cylinder/sphere/thin-box dimensions from
tests/geometry-performance/quadrature-primitives.cpp, without editing that file.
They include origin, moderate placement and (1e6,-2e6,3e6). A nested-child
translation separates root-only removal from global recentering. An additional
box built directly at world coordinates exposes the limit of removing a root
placement when support coordinates already carry a large offset.

## Why this could correct the thin-box counterexample

Changing only GProp_GProps' supplied system point is insufficient: the public
mass routines choose their own accumulation references internally. Translating
the **input value used solely for mass calculation** changes the world-space
points evaluated by the integrator instead. Large world translations can erase
small coordinate differences before quadrature error estimation sees them.
Removing such translation before evaluation can reduce that roundoff while
retaining local thin dimensions. A reported tiny GK discrepancy is not an
enclosure of errors introduced by world-point evaluation/subtraction.

Pinned placement semantics are visible in
[TopoDS_Shape::Moved/Move](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopoDS/TopoDS_Shape.hxx)
and the reference/integration behavior in
[BRepGProp](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx).
This is a conditioning experiment, not a change to the kernel's quadrature
stopping rule.

## Limits and required acceptance

- Root removal leaves nested child placements intact. Bounding-box translation
  acts on the whole value, but combining nested transforms still uses floating
  point arithmetic; inspect actual results rather than assume complete removal.
- Intrinsic world-coordinate supports may already have lost thin dimensions at
  construction. Recenter cannot reconstruct precision absent from stored input,
  and evaluation may still compute a large local point before applying location.
- These fixtures use rigid translations. General scaled/mirrored locations need
  explicit volume-Jacobian and orientation semantics; do not invert arbitrary
  application root transforms as a production optimization.
- Only scalar mass is consumed. Center of mass and inertia need transformation
  back to the original coordinate frame. History, returned BRep, rendering and
  entity signatures must retain the original input value.
- Placement/reference changes alter arithmetic and may alter quadrature samples.
  Bit identity is not the acceptance condition for mass, although source BRep
  immutability is. Require analytic error targets and broader fixture outcomes.
- Printed timing covers GK only, excluding bounding-box recenter setup and
  validation. It establishes no end-to-end speedup. Repeated samples are ordered
  rather than randomized; use paired randomized orchestration for performance.

Initial outcome to inspect: does inverse-root placement bring the far local
thin-box Z error back below 1e-10 for all reference/sign combinations, and does
bounding-box recenter do the same for nested translated geometry? Keep failures
visible. The harness intentionally prints error/validity outcomes instead of
asserting a guessed accuracy guarantee. Test parameterized thresholds and
minimum-solid-volume classification on a wider freeform/Boolean corpus before
any adoption; improved primitive conditioning alone is insufficient.

## Build and run

Run under the orchestrator's compute lock:

~~~sh
c++ -O2 -std=c++20 -I .cache/kernel/sdk/include/opencascade \
  docs/research/geometry-performance/quadrature-recenter.cpp \
  -L .cache/kernel/sdk/lib -Wl,-rpath,"$PWD/.cache/kernel/sdk/lib" \
  -lTKPrim -lTKTopAlgo -lTKBRep -lTKGeomBase -lTKG3d -lTKG2d \
  -lTKMath -lTKernel -o /tmp/quadrature-recenter
/tmp/quadrature-recenter thin-box 1
/tmp/quadrature-recenter all 1
~~~

The source is below 300 lines; functions stay below 80. Store JSONL output in
the research results directory and record toolkit/source provenance. This note
contains no passing-run claim.
