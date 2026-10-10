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

Adaptive bounds cover UV rectangles on the supporting surfaces, including areas
outside trimming wires. They cannot reject pairs whose supports intersect only
outside the actual faces. This experiment is not a general certified replacement
for OCCT intersection processing. Its protected iterator integration is tied to
the pinned OCCT version.

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
and rejection, separately from the initial broad-phase gate.

Implementation uses OCCT APIs; no upstream implementation was copied. Relevant
source observations in the pinned version:

- [Original box candidate enumeration](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/src/BOPDS/BOPDS_Iterator.cxx)
- [Face/face intersection stage](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/src/BOPAlgo/BOPAlgo_PaveFiller_6.cxx)
- [Constant UV subdivision](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/src/ShapeUpgrade/ShapeUpgrade_SplitSurfaceArea.cxx)
- [Surface bounds](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/src/BndLib/BndLib_AddSurface.cxx)
- [Transformed spline copies](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/src/BRepAdaptor/BRepAdaptor_Surface.cxx)
