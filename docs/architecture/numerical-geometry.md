# Numerical geometry

Native coordinates and distances use millimeters; volume uses cubic millimeters.
`native/kernel/geometry-policy.h` names the budgets used by boundary reconnection,
Shell/Face Offset validation and projection. These are checks for distinct tasks,
not one global precision setting or a replacement for OCCT entity tolerances.

Sketch offset checks likewise keep separate names and units: endpoint joining,
ambiguous-join distance and minimum edge length are each 1e-7 mm; minimum loop
area is 1e-7 mm²; minimum arc sweep is 1e-7 radians and semicircle recognition is
1e-10 radians. Numeric offset distance and minimum curve radius are each 1e-7 mm;
cubic tangent regularity uses 1e-10 mm. Equal literal values do not make these one
tolerance. Naming these checks does not change their values.

| Policy | Value | Purpose |
| --- | --- | --- |
| Minimum recoverable finish | 0.001 mm | Rounds below this radius and recognized bevels below this setback recover their sharp supporting intersection. This is modeling resolution, not a looser BRep validity tolerance. |
| Minimum solid volume | 1e-12 mm³ | Solid extraction and reconstructed/offset material must exceed the same floor. Reconnection and offset also require positive signed volume, retaining the orientation check. |
| Minimum topology extent | 0.001 mm | Shared certified-safe/inspect screen; detailed mesh bounds classify whole-face maximum interior distance to all perimeter loops; short edges retain a separate check. Near-threshold candidates require the same one-micron material bound; unrepairable sub-threshold results reject. Degenerate surface-pole edges are exempt. |
| Finish boundary normalization | <0.001 mm size correction | Snap only to a measured disappearing boundary, with the existing mutual 0.001 mm complete-solid material proof; applies to fillets and chamfers. |
| Boundary distance | 1e-6 mm | Reconnection fitting, offset boundary/surface agreement and minimum Shell/Offset separation. |
| Offset topology tolerance | 2e-6 mm | Bounds recorded on generated faces, edges and vertices; conservative rounded-join bounds do not enlarge the geometric distance budget. |
| Generated vertex adjustment | 0.001 mm | Maximum correction of a generated vertex onto its incident curves. Retained source vertices cannot move; the corrected geometry must still satisfy the boundary-distance budget. |
| Parameter correspondence | 1e-7 mm | Recompute spatial-curve/parameter-curve agreement on a private operand copy before offsetting. |
| Projection approximation | 0.001 mm total | 0.0005 mm fitting plus 0.0005 mm endpoint correction. Analytic arc endpoint correction must also stay within the total budget after radius/center amplification. |
| Cubic contact resolution | 0.0001 mm | Additional Boolean contact tolerance for cubic-bearing operands and collapse of microscopic temporary-profile edges at cubic junctions. |
| Collapsed projected segment | 1e-7 mm | Reject an edge whose planar image is a point. |
| Edge-on direction dot | 1e-12, dimensionless | Recognize a circle viewed along its plane and project its extrema to a segment. |
| Full circle angle | 1e-9 radians | Distinguish a complete circle from a trimmed arc. |
| Tangent crescent fillet | 0.01 mm radius | Intentional printable relief during extrusion, capped at 1% of inner radius and wall thickness; this is not a validation tolerance. |

The volume floor alone does not establish a minimum supported feature size.
[Automatic microscopic repair](solid-cleanup.md#automatic-microscopic-topology-repair-2026-11-06)
enforces a separate topology extent on newly calculated solid results. Operations
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

Tangent-circle tessellation can omit a collinear facet, leaving a long boundary
edge opposite two shorter edges through an existing middle vertex. Export splits
that long edge at the middle vertex only when the complete opposite edge path
exists and collinearity differs by no more than arithmetic roundoff (16 machine
epsilons times the two vector lengths). No vertex moves. Ordinary missing faces,
finite gaps and inconsistent winding still fail the same closed-mesh validation.
STL conversion also retriangulates facets that become exactly collinear in
Float32, using their existing vertices, before validating the packed mesh.

Solid extraction retains the exact volume and, when volume integration needs
them, the optimal surface bounds for that final shape. Presentation reuses those
measurements; no geometry mutation may follow them. Both bounds paths use
`BRepBndLib::AddOptimal` with triangulation and shape-tolerance expansion disabled.
Planar volume integration does not need bounds, so presentation computes them once.
Closed ruled spline walls are partitioned into quarter patches on a private
measurement copy before Gauss–Kronrod integration. This prevents nearly cancelling
inner flux integrals from stalling simple tube edits; the span integration and
1e-10 relative tolerance remain unchanged. Already trimmed partial walls skip this
step. Accepted faces/edges and presentation bounds come from the original shape,
so these integration patches do not create visible or selectable seams. Linear cap
offsets reuse the result volume computed by their material validation.

Temporary profile wires also collapse sub-0.0001 mm remnants at cubic junctions
(a cubic edge or an adjoining edge). Tangent trimming can otherwise leave sliver
walls whose display facets cannot form a closed export mesh. This reconnects only
the native profile wire; accepted sketch curves/constraints remain editable and
unchanged. Analytic-only profile junctions retain their existing precision.

The founder-approved tangent-crescent relief is a separate modeling adjustment.
It rounds the two otherwise singular tips of an internally tangent pair of
circular boundaries, removing at most 1% of the original profile area. The
R10/R5 example loses about 0.00813 mm² and gains a roughly 1.24 mm opening.
This favors useful printed geometry over preserving an unprintable contact.
Source circles and ordinary finite ligaments remain exact; preview, accepted
solid and export agree on the relieved geometry. BRep and mesh validation remain
unchanged. See [materialized solids](solids.md) for scope and saved-body behavior.

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

## Microscopic finishes

Exact typed finish sizes between zero and 0.001 mm reject inline rather than
silently becoming zero. Dragging and explicit Find Nearest retain sharp recovery
below the modeling resolution.

Ordinary solid results, including inspected/reopened and STEP-imported bodies,
simplify recognized sub-0.001 mm rounds and equal-setback chamfers before either
full or deferred presentation. A cheap face/edge scan filters possible small
analytic radii and short bevel cross edges. Recognition examines only candidate
faces; ordinary results skip adjacency construction and healing entirely. All
recognized small finishes are removed in one joint defeaturing pass, without an
iterative model-wide repair loop or another frontend/kernel round trip.
Tiny straight-edged planar caps entirely bounded by those removed finishes join
the same pass, covering corners where several bevel strips meet.

The recovered result must be a valid manifold solid, retain the unselected
supporting surfaces, and actually remove the selected finish faces. Failed
healing rejects the result. Topology history and selected faces continue through
the removal; cached mass/bounds are invalidated only when geometry changes.
Opening also continues tags, guides, appearances and decorators so a removed
face does not leave an invalid saved reference. Only repaired bodies undergo
continuation; unchanged bodies retain their saved metadata. Surviving topology
identities supply the display derivatives omitted by archives before continuing
attachments on repaired bodies. The saved file changes on Save.

New sub-resolution edge sizes resolve to zero without native probes. Resizing an
existing round/bevel below the floor heals it to zero; dragging snaps to that
endpoint. Standalone cylinders, ordinary holes/walls and unrecognized surfaces
are not deleted merely for being small. Larger supported finishes retain their
geometry. This is intentionally bounded finish simplification, not arbitrary
small-face removal. New solid edits additionally pass through
[general microscopic topology repair](solid-cleanup.md#automatic-microscopic-topology-repair-2026-11-06)
for narrow residual faces and short edges that are not recognized finishes.

The normal-offset feasibility search can otherwise retain a microscopic round
when shrinking its tangent supporting faces toward the zero-radius limit:
the exact endpoint rejects, and fourteen bisections return the last valid
positive radius. This was reproduced on a simple rounded block. The reported
capture's 0.0006103515625 mm rounds have the same binary residue pattern, but its
history starts after their creation, so the exact earlier edit is unknown.

## Stationary Bézier endpoints and solid presentation

Pen corners may have a control point equal to their endpoint. Their exact
extrusion remains valid even when OCCT cannot define a first-derivative surface
normal there. Optional tangent face chains and blend recognition conservatively
leave that adjacency ungrouped on `LProp_NotDefined`; they neither modify the
solid nor bypass geometry, meshing or export validity checks. Other failures
remain errors. See the [pinned source observation](../freecad/kernel-topology.md#stationary-endpoints-and-continuity-metadata).
