# Numerical geometry

Native coordinates and distances use millimeters; volume uses cubic millimeters.
`native/kernel/geometry-policy.h` names the budgets used by boundary reconnection,
Shell/Face Offset validation and projection. These are checks for distinct tasks,
not one global precision setting or a replacement for OCCT entity tolerances.

| Policy | Value | Purpose |
| --- | --- | --- |
| Minimum solid volume | 1e-12 mm³ | Solid extraction and reconstructed/offset material must exceed the same floor. Reconnection and offset also require positive signed volume, retaining the orientation check. |
| Boundary distance | 1e-6 mm | Reconnection fitting, offset boundary/surface agreement and minimum Shell/Offset separation. |
| Offset topology tolerance | 2e-6 mm | Bounds recorded on generated faces, edges and vertices; conservative rounded-join bounds do not enlarge the geometric distance budget. |
| Generated vertex adjustment | 0.001 mm | Maximum correction of a generated vertex onto its incident curves. Retained source vertices cannot move; the corrected geometry must still satisfy the boundary-distance budget. |
| Parameter correspondence | 1e-7 mm | Recompute spatial-curve/parameter-curve agreement on a private operand copy before offsetting. |
| Projection approximation | 0.001 mm total | 0.0005 mm fitting plus 0.0005 mm endpoint correction. Analytic arc endpoint correction must also stay within the total budget after radius/center amplification. |
| Cubic contact resolution | 0.0001 mm | Additional Boolean contact tolerance for cubic-bearing operands and collapse of microscopic temporary-profile edges at cubic junctions. |
| Collapsed projected segment | 1e-7 mm | Reject an edge whose planar image is a point. |
| Edge-on direction dot | 1e-12, dimensionless | Recognize a circle viewed along its plane and project its extrema to a segment. |
| Full circle angle | 1e-9 radians | Distinguish a complete circle from a trimmed arc. |

The volume floor does not establish a minimum supported feature size. Operations
also enforce valid BReps, closed shells, noncollapsed boundaries and their own
feasibility checks. A valid small solid must not fail reconnection merely because
that path applies an unrelated, larger volume floor. Large coordinate magnitudes
likewise do not relax distance checks. Projection rejects curves outside its error
budget rather than silently accepting a coarser approximation.

Presentation requires a nonempty triangulation for every exact face. OCCT can
finish a meshing call while leaving individual faces unmeshed, even after basic
BRep validation passes. Such a result rejects before publication; an incomplete
surface display cannot stand in for a successful geometry operation. This check
also applies when regenerating presentation during Open. It does not prove that
a fully meshed shape is free of self-intersections.

Temporary profile wires also collapse sub-0.0001 mm remnants at cubic junctions
(a cubic edge or an adjoining edge). Tangent trimming can otherwise leave sliver
walls whose display facets cannot form a closed export mesh. This reconnects only
the native profile wire; accepted sketch curves/constraints remain editable and
unchanged. Analytic-only profile junctions retain their existing precision.

For Boolean operands containing non-rational cubic Bézier or cubic B-spline
boundary curves, use an additional 0.0001 mm contact tolerance. The founder
approved extending the flexible cubic approximation budget to these joins on
2026-10-02. This resolves microscopic oscillation of approximated projections
about their analytic source surfaces without increasing tolerance on analytic-only
operand pairs. It is a fixed contact-resolution allowance, not an adaptive retry
that keeps loosening precision until an operation succeeds. Sub-tolerance gaps or
slivers in cubic-bearing operand pairs can merge. Accepted source sketches/bodies
remain untouched; Boolean history maps the resulting topology as usual.

Overlap detection and Union/Subtract/Intersect use the same allowance, including
standalone Booleans on saved/reopened bodies. Auto therefore chooses Subtract
when the corrected overlap calculation finds shared material. Basic validity and
complete face meshing remain required; the tolerance does not waive either check.

New body fillets request 1e-7 fitting tolerances for the spatial and parameter
curves and blend approximation. This makes subsequent precision-checked offsets
possible at sphere/plane and sphere/cylinder junctions without relaxing their
1e-6 mm boundary budget. These are construction targets, not a claim that every
fillet meets the offset budget; offset operations still measure their input and
reject coarse older or imported geometry.

## Stationary Bézier endpoints and solid presentation

Pen corners may have a control point equal to their endpoint. Their exact
extrusion remains valid even when OCCT cannot define a first-derivative surface
normal there. Optional tangent face chains and blend recognition conservatively
leave that adjacency ungrouped on `LProp_NotDefined`; they neither modify the
solid nor bypass geometry, meshing or export validity checks. Other failures
remain errors. See the [pinned source observation](../freecad/kernel-topology.md#stationary-endpoints-and-continuity-metadata).
