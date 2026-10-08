# Missing planar pcurves: selector and projection audit

The initial main-run eligibility results in
`results/analytic-eligibility-initial.jsonl` report 40 rejected face-edge
incidences for perforated Fuse and 29 for open perforated Shell, despite all
their edges passing the stored-support checks. This rejection is deliberately
conservative. It is not evidence of a projection race or malformed geometry.
The eligibility guard is unchanged by this follow-up.

## Matching logic

No mismatch was found in the diagnostic's source logic. Its preflight uses the
raw `BRep_Tool::Surface(face,location)` handle and exactly
`location.Predivided(edge.Location())`, the same expression as the
[SDK selector](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L315).
The standard
[representation predicate](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_CurveOnSurface.cxx#L69)
compares surface handle identity and relative location identity. The
[face overload](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L289)
reverses the local edge for a reversed face, affecting only which seam pcurve
is returned after a match. Explicitly trying both edge orientations covers
both branches. These orientation changes cannot make an existing matching
representation disappear.

`tests/geometry-performance/missing-pcurve-probe.cpp` independently compares
that preflight with the actual SDK getter for both orientations of every
incidence. It emits missing/mismatched incidences with surface/basis/3D curve
types, returned pcurve/basis type and `theIsStored`. It also compares complete
triangle-free BRep serialization before/after and stored representation counts.
The initial guard counts a missing representation once per topology incidence;
this follow-up counts actual oriented SDK calls, normally twice as many.
Compilation and fixture runs remain for main. Serialization equality would
detect serialized mutations, not certify absence of unencoded caches or races.

## Plane fallback ownership

The inspected pinned
[CurveOnPlane](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.cxx#L356)
accepts a Plane, or one rectangular trim directly around a Plane. It returns
null for a nonplane or missing 3D curve. It reads stored geometry/location,
constructs local projection/adaptor objects, and returns a generated pcurve;
there is no edge builder, ChangeCurves, attachment, or topology Update in it.
Location transformation uses
[Geom_Geometry::Transformed](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_Geometry.cxx#L134),
which copies before transforming. Even with identity location, the subsequently
created
[Geom_TrimmedCurve](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_TrimmedCurve.cxx#L54)
copies the basis. Reversal/trim changes occur on that private basis.

[ProjectOnPlane](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomProjLib/GeomProjLib.cxx#L313)
reads the shared plane's stored gp position and creates fresh projected standard
conics on analytic branches. Its input curve/adaptor already belongs to the
private copied geometry. The second
[ProjectedCurve plane branch](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ProjLib/ProjLib_ProjectedCurve.cxx#L389)
passes gp primitive values into a private ProjLib_Plane. Finally
[MakeCurve](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom2dAdaptor/Geom2dAdaptor.cxx#L33)
creates fresh standard 2D conics, optionally a private trimmed wrapper.
For exact standard plane/conic inputs and successful analytic branches, no
shared geometry or topology mutation was found in this projection chain.

However, **analytic inputs alone do not ensure an analytic projection path**.
A line nearly normal to the plane becomes a
[degenerate spline](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ProjLib/ProjLib_ProjectOnPlane.cxx#L566).
Circle/ellipse projection can take a
[spline approximation branch](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ProjLib/ProjLib_ProjectOnPlane.cxx#L796)
for degeneracy or unsupported preserved parametrization. The second projection
also has an
[approximation fallback](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ProjLib/ProjLib_ProjectedCurve.cxx#L711).
Those results are private, but extending thread-safety claims to their entire
approximation dependency graph needs additional inspection. A postprojection
conic type check cannot prove those branches were never executed.

## Conservative candidate, still unimplemented

A guarded plane-only missing-pcurve allowance is plausible after confirming
the SDK results: exact Plane (or one exact standard plane trim), all existing
stored supports and selected 3D supports passing the original exact-type guard,
and a serial preparation route producing a non-null exact conic pcurve in
private worker-owned metadata. Keeping that private result for each context
avoids asking the worker to rerun an unreviewed projection chain. Attaching
the generated curve to shared topology would change the ownership contract
and is not part of this proposal. Alternatively, a proof that the specific
coplanar line/circle projections take only the audited analytic branches could
justify evaluating them independently in workers; it requires more than the
outer dynamic-type test.

Neither option changes production metadata, the current eligibility guard,
or authorizes parallelism. Bent and notched fixtures still independently fail
their freeform/offset support checks regardless of any planar allowance.
