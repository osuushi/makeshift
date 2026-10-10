# Boolean UV subdivision experiment

This opt-in native benchmark reads a Capture fixture containing an ordered,
two-body subtraction. Its volume/material verification currently assumes the
second operand is contained inside the first. It does not change the application
Boolean path or accepted geometry.

After the normal native SDK setup, enable the target in the configured build:

```sh
cmake -S native/kernel -B .build/kernel -DMAKESHIFT_KERNEL_BENCHMARKS=ON
CCACHE_DISABLE=1 cmake --build .build/kernel --target boolean-uv-benchmark --parallel 4
.build/kernel/benchmarks/boolean-uv-benchmark --self-test
.build/kernel/benchmarks/boolean-uv-benchmark /absolute/path/to/capture.json 3 > /tmp/boolean-uv.csv
```

For the trimming/bounds experiment, append `--trim-experiment` or
`--tight-experiment` after the round count. These compare the ordinary parallel
and serial Boolean paths, support-only refinement, trimming-aware refinement,
and (in the second experiment) interval bounds for torus cells.

Build `boolean-pair-profile` with the same CMake build command to inspect the
remaining depth-10 support-only candidates individually:

```sh
.build/kernel/benchmarks/boolean-pair-profile /absolute/path/to/capture.json 3 > /tmp/boolean-pairs.csv
```

This measures isolated serial `IntTools_FaceFace` calls with normal options and
with curve approximation/pcurves disabled, alternating their order each round.
The latter still performs curve/surface deviation checks; it is not a pure
intersection-stage timer. These calls do not reproduce PaveFiller's prior
edge/face seeding, shifted faces or parallel scheduling, so their times and curve
counts must not be treated as exact per-pair contributions to Boolean wall time.
Curve samples classified against trimming wires are diagnostics only. Face
numbers are local to the captured operands. For CPU stack sampling, pass a larger
round count and `--full-only`; `raw_ms=0` then denotes a skipped comparison.

The baseline uses OCCT's ordinary box filtering and exact subtraction. The
`gated-*` cases first run that original box filtering, then subdivide only faces
participating in its face/face candidate pairs. OCCT's face divider makes constant
U/V cuts on temporary copies. Preparation includes copying, subdivision,
SameParameter repair, validity checks and tolerance assessment. All resulting
faces then pass through the ordinary Boolean machinery.

The `adaptive-*` cases preserve the original topology. An experimental iterator
first runs OCCT's original box filtering, then refines only surviving face/face
pairs. Child boxes are cached per face, and only overlapping children are refined.
Analytic supports use OCCT's interval bounds; spline supports use segmented copies
and OCCT's control-hull bounds. Unsupported surfaces, failed bounds and exhausted
budgets retain the original pair. Every child bound includes the Boolean fuzzy
tolerance and the maximum input topology tolerance. No subdivision occurs for
original pairs rejected by OCCT. Other topology pair types remain unchanged.

Support-only adaptive bounds cover UV rectangles including areas outside trimming
wires. Trimming-aware cases cache boxes covering every boundary pcurve, including
both seam occurrences. A UV cell is excluded only if no boundary box overlaps it
and OCCT's UV face classifier says its center is OUT. No boundary can enter that
connected rectangle, so the classification applies to the whole cell. Boundary
and uncertain cells remain occupied; unsupported pcurves disable this rejection
for the face. Boundary boxes and cells include a UV roundoff allowance; retained
3D surface bounds still include the original contact tolerance. Classification
is cached per cell. No topology subdivision or mesh approximation is involved.

The separate tight-torus cases enclose the analytic torus expression using sine,
cosine and product intervals, with an explicit floating-point allowance. OCCT's
ordinary torus box routine uses coarse V bands that may remain loose under small
V cuts. Comparing tight bounds separately avoids attributing their effect to trims.

This remains a research experiment, not a generally certified replacement for
OCCT intersection processing. It relies on valid input faces, consistent pcurves
and OCCT's classifier and bound behavior. Its protected iterator integration is
tied to the pinned OCCT version. Production Boolean behavior is unchanged.

CSV `total_ms` includes preparation, intersection processing, result construction
and topology validation. It excludes fixture decoding, volume integration,
material probes and application measurement/presentation work. `face_face_ms`
and `refine_ms` are subsets of `filler_ms`. The adaptive implementation repeats
OCCT's initial pair enumeration when replacing the iterator; that overhead is
included. Cases rotate their starting order between rounds.

Each distinct result BRep is checked for validity, one solid, matching operand
and cavity volumes (relative tolerance 1e-8), and matching material classification
at 225 offset grid points. Identical repeated result BReps reuse that geometric
verification outside measured time. These checks are regression evidence, not a
proof of equivalence. `precision_preserved=0` marks topology tolerance growth;
such a case must not count as an acceptable optimization even if other checks
pass. The self-test compares adaptive and ordinary subtraction for disjoint,
contained, intersecting and tangent spheres, plus rational spline surfaces. A
disjoint sphere pair with overlapping original boxes exercises actual refinement
and rejection, separately from the initial broad-phase gate. Trim regressions
cover a hole, boundary cells and a small material island that misses a cell's
center/corners. Torus intersection and nested tube cases exercise periodic seams;
rotated torus interval boxes are checked against a dense surface grid.

Implementation uses OCCT APIs; no upstream implementation was copied. Relevant
source observations in the pinned version:

- [Original box candidate enumeration](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPDS/BOPDS_Iterator.cxx)
- [Face/face intersection stage](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_PaveFiller_6.cxx)
- [Curve construction and deviation checks](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntTools/IntTools_FaceFace.cxx#L608-L685)
- [Constant UV subdivision](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ShapeUpgrade/ShapeUpgrade_SplitSurfaceArea.cxx)
- [Surface bounds](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BndLib/BndLib_AddSurface.cxx)
- [Torus bounds](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BndLib/BndLib.cxx#L1560-L1752)
- [Pcurve bounds](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BndLib/BndLib_Add2dCurve.cxx)
- [UV face classification](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepClass/BRepClass_FaceClassifier.cxx#L75-L86)
- [Transformed spline copies](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAdaptor/BRepAdaptor_Surface.cxx)
