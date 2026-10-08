# Analytic metadata eligibility diagnostic

`tests/geometry-performance/analytic-metadata-eligibility.cpp` is an original,
serial public-SDK diagnostic for saved exact BRep fixtures. It implements the
conservative support filter proposed in
[presentation-research.md](presentation-research.md), without implementing
parallel metadata construction. Source inspected against OCCT 7.9.3 baseline
`a016080bf6738d6aeae020badee4e888ad1540a5`; the unpacked source directory is not
a Git repository. No upstream implementation is copied into the diagnostic.

## Coverage

The diagnostic requires exact standard dynamic types, rather than `IsKind` or
an adaptor's geometry category. Standard rectangular surface trims and 2D/3D
curve trims are recursively unwrapped with a 16-level cap. Allowed supports are
Plane/Cylinder/Cone/Sphere/Torus and Line/Circle/Ellipse/Hyperbola/Parabola in
the respective geometry classes. Unknown subclasses, offsets, freeform bases,
null supports, and null selected 3D curves fail closed. Degenerate edges receive
the same non-null 3D requirement, intentionally excluding ordinary pole edges.

Every unique located edge's complete public `BRep_TEdge::Curves()` list is
examined. This includes additional 3D supports, both stored seam pcurves,
their surface supports, continuity representations' two surfaces, and surfaces
attached to polygon representations. Exact standard polygon-only mesh
representations are accepted without examining polygon contents. Unknown
representation subclasses fail closed before calling BRep_Tool's selectors.
The exact standard TEdge/TFace types are checked before those accessors too.

Every face-edge incidence of an otherwise eligible edge/support is checked
with both FORWARD and REVERSED edge wrappers. The
[face accessor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L289)
adjusts edge orientation for reversed faces, and its
[surface accessor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L315)
selects PCurve2 for the reversed seam branch. Before invoking that accessor,
the diagnostic verifies a stored matching standard curve-on-surface
representation using the same relative support location. Missing stored
representations are rejected without entering the
[plane projection fallback](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L356).
The accessor's `theIsStored` flag remains an additional check. No builder,
mesher, topology Update, or pcurve synthesis is invoked.

JSONL records include whole-body eligibility, unique located face/edge counts,
eligible subsets, degeneracies, actual oriented incidence query counts,
stored curve counts, outer dynamic-type histograms and failure reason counts.
Rejected edges/supports skip incidence retrieval; that count is therefore
not necessarily twice the total topology incidence count. A face is eligible
only if its support and all incident edges (including each edge's additional
stored representations) pass. Whole-body eligibility also rejects unsupported
free-standing edges and empty face/edge sets. Unsupported geometry is a normal
diagnostic result; unreadable/null input returns a process failure.

## Limits and next use

This is a support-type eligibility count, not a thread-safety certificate or
a benchmark. It does not validate the BRep, parameter ranges, finite transforms,
mesh arrays, normals, triangulation availability, or the entire transitive
metadata algorithm. Vertex point representations are not audited because
the proposed filter concerns face and edge evaluation routes; any parallel
route consulting additional vertex representations needs separate coverage.
The histogram names the outer trim type even when its basis causes rejection.
Real fixture eligibility and compilation remain unverified until main runs it.

The prospective worker phase must still follow completed serial meshing and
topology preparation, keep supports/locations/mesh arrays immutable until join,
and use independent algorithm contexts while preserving ordered output and
exception precedence. In particular,
[BRepTools::Update(face)](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools.cxx#L378)
mutates shared endpoint/Checked data and is not a worker warmup. Read-only
eligibility alone does not authorize parallel use of an unreviewed route.

The compile/link command is in the source header. Main should run serially under
the global compute lock on the captured perforated Fuse/open Shell/bent BReps;
no source, library or saved fixture is modified by this diagnostic.
