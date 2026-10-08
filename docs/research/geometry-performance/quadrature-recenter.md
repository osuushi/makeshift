# Mass integration conditioning by value-only placement changes

Experiment, 2026-10-08. This lane created source and audited the orchestrator's
subsequent output; compilation/execution belonged to the orchestrator under the
compute lock. The translated thin-box conditioning defect motivated the run.
See the measured results below; they remain experimental.

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

Initial questions were whether inverse-root placement brings the far local
thin-box Z error below 1e-10 for all reference/sign combinations and whether
bounding-box recenter does the same for nested translated geometry. The measured
corpus below answers both affirmatively. The harness prints error/validity outcomes instead of
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
does not itself execute the harness.

## Confirmed primitive results

Audited [quadrature-recenter-confirmed.jsonl](results/quadrature-recenter-confirmed.jsonl):
2,282 records comprise 2,268 mass observations and 14 original-source checks.
Every source's full encoding, root location and orientation remained unchanged,
and every mass observation's serial exact BRep validity check passed. Three
blocks repeat each axis/reference/sign configuration. Counts below are observed
configurations including repetitions, not independent trials or statistical
confidence bounds.

Accuracy against the intended analytic dimensions, at relative eps=1e-10:

| Primitive | Original passes | Inverse root passes | Box-center passes | Observations per variant |
| --- | ---: | ---: | ---: | ---: |
| Box | 150 | 162 | 162 | 162 |
| Thin box, including nested/intrinsic cases | 174 | 198 | 216 | 270 |
| Cylinder | 144 | 162 | 162 | 162 |
| Sphere | 162 | 162 | 162 | 162 |
| Total | 630 | 684 | 702 | 756 |

Per-axis configuration pass counts:

| Axis | Original | Inverse root | Box-center | Observations per variant |
| --- | ---: | ---: | ---: | ---: |
| X | 234 | 234 | 234 | 252 |
| Y | 228 | 234 | 234 | 252 |
| Z | 168 | 216 | 234 | 252 |

All 702 box-center observations for local-support primitives, including the
nested-child case, meet the intended analytic target. The remaining 54
box-center observations belong to the intrinsic world-support control. That
control needs a reference for the **constructed BRep**, not just intended input
dimensions, before attributing discrepancies to integration.

The following table isolates the thin-box mirrored-low-minus-one plane with
positive normal; each displayed relative error repeated identically in all
three blocks:

| Placement | Axis | Original error | Inverse root error | Box-center error |
| --- | --- | ---: | ---: | ---: |
| Far local support | X | 2.6833e-16 | 2.6833e-16 | 2.6833e-16 |
| Far local support | Y | 2.6833e-16 | 2.6833e-16 | 2.6833e-16 |
| Far local support | Z | 1.6987306843e-6 | 4.4364934766e-12 | 4.4364934766e-12 |
| Nested far child | X | 2.6833e-16 | 2.6833e-16 | 2.6833e-16 |
| Nested far child | Y | 2.6833e-16 | 2.6833e-16 | 2.6833e-16 |
| Nested far child | Z | 1.6987306843e-6 | 1.6987306843e-6 | 4.4364934766e-12 |
| Intrinsic world support | X | 1.6987323763e-6 | 1.6987323763e-6 | 1.6987323763e-6 |
| Intrinsic world support | Y | 1.6987323761e-6 | 1.6987323761e-6 | 1.6987323761e-6 |
| Intrinsic world support | Z | 1.6987306843e-6 | 1.6987306843e-6 | 1.6987306843e-6 |

The far local-support Z estimate remained about 1.3957e-11 before and after
recentering, while actual error improved by roughly five orders of magnitude.
Thus the returned estimate did not detect this placement-conditioning error.
Inverse root removal alone cannot fix the nested child's remaining large
placement; a whole-value box-center translation did fix this measured case.
Different supplied references can be worse: the nested original reaches
1.8551e-5 relative discrepancy, so the selected mirrored-plane table is not a
worst-case bound.

For the intrinsic-support control, ordinary double arithmetic gives
(3e6 + 1e-4) - 3e6 = 0.00009999983012676239, a relative difference of
1.6987323761e-6 from the intended thickness. Its independently stored global cap
planes plausibly embody this construction roundoff. Agreement of XYZ after
recentering near that value supports this explanation, but does not establish
the exact volume of the stored BRep. Recenter cannot restore an intended
dimension lost during construction. Do **not** label every nominal-reference
miss in this control a kernel integration defect.

### Performance observations and validity limits

Across the mixed primitive configurations, raw median GK times were 0.031718 ms
original, 0.0339565 ms inverse root and 0.0340515 ms box-center. Largest recorded
times were 123.402284, 8.329728 and 13.452756 ms respectively. These aggregate
samples mix distinct references, geometry and repetition order, with substantial
outliers; they are **not paired speedup estimates**. They exclude bounding-box
setup/validation and do not justify a performance claim. The clear result is
conditioning on this primitive corpus.

No evidence here establishes a general relative-error enclosure, freeform or
Boolean accuracy, minimum-volume classification stability, behavior near
application acceptance thresholds, or correctness for arbitrary transformed
inertia/centroids. Exact validity and unchanged source encoding establish useful
topology/immutability controls, but neither certifies the numeric mass.

### Smallest next application experiment

Keep production behavior unchanged initially. Add an opt-in mass-only experiment
that computes a second volume on a TopoDS value translated by a body-wide center,
using the existing GK settings/reference policy and consuming only scalar mass.
Preserve the accepted source/result BRep and original geometry/history metadata.
Use a cheap, measured center source if exact AddOptimal repeats expensive work;
do not infer an end-to-end optimization from uncharged setup.

Collect ordinary/current versus conditioned masses on existing freeform,
Boolean, thin/sliver and heavily located fixtures, plus nested placements.
Check minimumSolidVolume and intersection-volume branch outcomes explicitly.
Only after analytic/independent references and application acceptance comparisons
support a coherent rule should the scalar returned by the experimental path
replace the current result. Intrinsic-support cases remain a distinct reference
problem; a broad precision or tolerance policy change is outside this candidate.
