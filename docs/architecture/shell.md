# Shell

Founder request, 2026-09-17: follow the current surface inward or outward, leave
selected faces open where feasible, and reject rather than publish invalid geometry.

## Geometry priorities (founder decision, 2026-09-23)

For Shell and offsets, model integrity takes priority over exact agreement with
the initially computed shape. Treat geometric approximation and boundary agreement
as separate budgets. A controlled adjustment to generated geometry is acceptable
when it produces a useful result; shared edges, vertices and incident faces must
still agree tightly and form valid geometry. Increasing a recorded tolerance alone
does not establish that agreement.

Prefer preserving analytic relationships to the current source: parallel planes,
concentric spheres and coaxial cylinders. Reconstruct shared boundaries against
all incident surfaces together; approximate connecting surfaces may be refitted.
Check deviation from the intended shape separately from boundary consistency,
solid validity and export-mesh closure. The shape-adjustment ceiling is **0.001 mm**;
boundary agreement remains 1e-6 mm with topology tolerances at most 2e-6 mm.
Current repair fits generated shared vertices to independently checked incident
curve endpoints within that budget; it does not yet refit arbitrary surfaces.

## Interaction and ownership

Select solid faces or bodies and choose **Shell / S**. A partial face selection
specifies openings; a body or complete face coverage specifies a closed hollow.
Explicit edges and non-solid targets are unavailable. Mixed whole bodies and
partial face selections across bodies use those meanings independently.
The local signed thickness field and arrow use negative inward / positive outward.
Offset surfaces meet at sharp intersections by default. If sharp construction
fails, Shell may use rounded joins to obtain a valid result.
Thickness is the normal offset of each face, so corner-to-corner distances can
exceed its magnitude. The tool retains the original surface on the other side of
the wall; it does not center thickness on the surface. The card states the number of openings or “Closed hollow”.

Drag release retains the temporary result. Enter/check or switching tools accepts
one Undo step; Escape/cross cancels and restores selection. Zero exits without an
edit. Invalid requests turn the arrow/field red, remove the invalid preview and
prevent acceptance, including through tool switching. Thickness is never clamped.
The user can correct the value directly. Native cancellation remains available.

`BodyShell` contains document-local body IDs, opening face IDs and signed thickness.
`DocumentOwner` computes against accepted current BReps and accepts all participating
bodies atomically. There is no feature recipe or second document owner. Retained
original entities retain IDs, including through verified analytic reparameterization;
parallel faces and opening rims receive new IDs.
The materialized result supports ordinary selection, movement and face edits;
Save/Open does not replay Shell. Failed inputs and reasons use ordinary history.

## Geometry and rejection

Open walls use OCCT `MakeThickSolidByJoin`. Closed hollows use `PerformByJoin`
and a checked Boolean difference. Both use intersection joins and 1e-7 mm construction
tolerance, first with local intersections, then with all-parallel intersections if construction
or validation fails. Each attempt owns a fresh deep copy. Self-intersection removal
stays disabled; surviving topology must pass the complete checks below. There is
no mesh fallback or reduced thickness. If both sharp-join attempts fail construction
or validation, retry with arc joins, first local then all-parallel intersections.
Rounded fallback may add corner fillets; it uses the same requested thickness and
full validation. This preserves supported freeform sweeps and end caps when OCCT
cannot construct valid sharp intersections (founder decision, 2026-10-11).

The reproducible OCCT setup passes 1e-7 mm to rounded edge-pipe construction,
replacing its independent 1e-4 mm default. Generated boundaries are measured
against every incident face before repair. New shared vertices may move at most
0.001 mm to meet all incident spatial curve endpoints within 1e-6 mm. Preserved
source vertices cannot move. Conservative edge/vertex metadata is tightened only
after geometric agreement is established, then the whole solid is validated.

Before strict input validation, preparation also measures boundaries on its private
copy. Conservative inherited edge/vertex bounds may be reduced only when the
existing geometry already meets the same tight checks. Input vertex positions are
never fitted during preparation, and the accepted source BRep remains unchanged.
This permits Boolean/fillet inputs with inflated metadata without admitting gaps.

Some cylindrical fillets are stored as rational splines. Before construction, Shell
can recognize these supports and their line/circle boundaries at 1e-7 mm tolerance.
It reparameterizes the faces and all affected boundary curves together, checks
surface samples and boundary endpoints, and rebuilds same-parameter pcurves.
The prepared solid must pass the full solid checks and warning-free Boolean
comparison against the source in both directions. Source topology correspondence
preserves face IDs and the requested openings; orientations come from the prepared
solid, not the modifier's local history. The accepted source BRep stays untouched.
This conversion is specific to cylindrical representations. It neither widens the
wall tolerance nor changes the requested thickness.

All bodies are first deep-copied using the preparation shared with Face Offset.
Nonanalytic bodies, including spline/Bezier and offset surfaces, have their boundary pcurves recomputed
with `BRepLib::SameParameter` at 1e-7 mm. Spatial curves and surfaces are retained;
the prepared BRep must pass the ordinary strict solid checks. This handles swept
faces whose existing parameter correspondence is coarser than their geometry.
Copied face orientations come from the complete solid, not local copy history.
Generated freeform offset pcurves are likewise recomputed before validation.
The serialized source and prepared input must remain unchanged by construction.

Before publishing, each body must have:

- Exactly one positive, consistently oriented solid with closed wall boundaries;
  multiple shells are legitimate for a sealed cavity.
- Valid BRep geometry, exact curve-on-surface checks, no detected self-interference,
  and topology tolerances no larger than 2e-6 mm. OCCT rounded joins can carry
  conservative 1.1e-6 mm vertex bounds; those are separate from the 1e-6 mm
  geometric distance tolerance.
- Unchanged serialized input geometry/topology (ignoring only the root container
  ownership flag), every retained prepared face still present, and every requested opening losing
  positive area (a rim strip is allowed).
- An identifiable parallel for each retained face, sampled against the signed
  offset surface within 1e-6 mm, plus whole-skin minimum separation
  at least the requested thickness minus that tolerance.
  Freeform correspondence samples every C2 parameter span; sampled offset normals
  must stay regular and retain orientation relative to the source. Analytic offsets
  use OCCT's exact equivalent surface; other supports use `Geom_OffsetSurface`.
- Material on the requested side: inward wall minus source, or outward wall
  intersect source, has no material above max(1e-9 mm³, source volume × 1e-10).
  Inward hollowing must actually remove volume. Verification Booleans reject warnings.

Inputs below or equal to 1e-5 mm absolute thickness reject. Analytic planar,
cylindrical, conical, spherical and ring-toroidal supports are eligible; collapsed
radii reject. Freeform supports are attempted with the same geometry, correspondence,
separation and containment checks; merely completing OCCT's offset does not suffice.
Missing correspondence, changed preserved faces, excess tolerances,
collisions, kernel failure or inability to verify also reject atomically.

These are conservative numerical acceptance checks, not a mathematical certificate
for every BRep or a claim that all feasible shells can be constructed. Some complex
surfaces and face subsets will fail. On the captured bent sweep, both open ends
work inward/outward; one inward single-opening choice and inward closed hollowing
still fail boundary validation. Outward +2 mm reaches self-interference and rejects.
The intersection fallback can close narrow regions, but requires verified face
correspondence and one valid material solid. Source observations are recorded in
[the kernel reference](../freecad/kernel-topology.md).
