# Selection-driven modeling tools

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Implicit revolution axes

Revolve picks straight sketch/solid edges, cylindrical faces (including partial
cylinders), or world axes. Explicit finite edges have priority, then the nearest
visible face's exact cylinder axis, then world axes. A planar face in front of a
cylinder does not expose the cylinder through it; hidden bodies do not participate.
The evaluated axis must lie in the section plane. Hover shows the implied center
axis and direction only for a valid candidate; leaving the canvas clears it.
Changing the axis allows selecting the same reference again and restores a fresh
preview. Inputs copy the evaluated native axis; no saved axis object or dependency
on the reference body is introduced. Existing angle/height, acceptance and Undo apply.

## Selection, operations and tools (founder decision, 2026-09-17)

Selection records ordered user targets. `selection-context.ts` derives complete
body coverage, partial faces and explicit edges from accepted stable topology IDs;
it does not replace that selection or own document data. A body token and all its
faces describe equivalent coverage. Redundant targets are deduplicated, preserving
first encounter order for Boolean operands and existing face order for face tools.

An operation is a document change with concrete targets and parameters. The typed
`OperationInputs`/`Resolution` contract in `operation-selection.ts` resolves current
selection to all required inputs or an unavailable reason. Toolbar eligibility,
shortcuts and operation controllers use this same resolution. Applicability does
not promise that every parameter value will succeed; the exact kernel remains the
geometry authority. Unsupported selections never silently drop targets.

Planar Extrude and Revolve accept parallel supports with either normal orientation. The
first selected support sets the common extrusion direction; signed distance retains
its meaning when source order changes. Revolve uses that support for its section
frame and requires its selected axis to lie in the section plane. Manual and script
paths use the same parallel-normal predicate. Nonparallel planar supports remain unavailable.
Curved-face Extrude uses the bounded normal-face route described below.

A tool is the interactive parameter-gathering and preview route for an operation.
`tool-policy.ts` owns the interactive tool IDs and default preference separately
from operation eligibility. Delete is immediate and has no ongoing tool. Move can
resolve to a body transform, component reconnection or both. Existing exclusive
interaction leases, temporary candidates and DocumentOwner acceptance remain the
only edit lifecycle; there is no new command framework or document owner.

Complete bodies prefer Move, partial face-only sets prefer Offset, explicit edges
prefer Fillet and profiles prefer Extrude, provided the preferred operation is
available. Mixed coverage has no automatic default, but can offer explicit tools.
Explicit choices survive preview replies; fresh selection restores the default.

Whole bodies and complete face coverage both expose rigid Move/Rotate, Duplicate,
Boolean, [Mirror](transforms.md#mirror-founder-approved-interaction-2026-09-20),
whole-body Delete/Cleanup, and applicable face operations. Offset expands
the coverage to its faces. Projection uses the same whole-body interpretation for
complete face coverage. Body selection does not implicitly select edges for Fillet
or Chamfer. Explicitly invoking either tool on faces converts their boundaries to selected edges and opens
the size control. Periodic seam edges, used twice in a face wire, are excluded from
that face's modeling boundaries; explicit edge targets retain kernel validation.
Mixed faces and explicit edges use raw selection encounter order,
deduplicating shared edges; Cancel preserves the resolved/expanded edge selection.
For Move/Delete, edges already covered by a whole body add no second edit.

Explicit Boolean, Duplicate, Mirror and Erode invocations expand selected solid
faces and edges to their owning bodies. Split bodies does the same for cutting
targets. Body order follows the first selected target of each body, and repeated
faces/edges contribute only one operand. Eligibility and operation inputs share
this interpretation; stale topology and mixed sketch/profile targets still reject.
Boolean operand collection and Duplicate/Erode selection show complete bodies.
Move/Delete retain partial topology edits, Shell retains selected opening faces,
and face/edge operations retain their own input interpretation.

Mixed whole-body and partial face movement transforms the complete bodies rigidly
and reconnects the partial bodies, using the same translation/pivot/rotation. Mixed
whole-body and edge movement supports translation. A request computes all results
before one acceptance; failure leaves every accepted body unchanged. Partial faces
and edges together remain unavailable. Mixed Delete removes complete bodies/sketches
and heals remaining topology atomically; a failed heal removes nothing.

Refinement expands body tokens to faces where needed. Toggle-clicking a face of a
selected body removes that face and leaves the others selected; adding the missing
face restores complete-body behavior. The raw ordered selection remains inspectable.
Marquee release consumes its synthetic click before sketch-plane entry can run.

## Selection-driven modeling tools (founder decision, 2026-09-16)

In 3D, filled sketch regions default to Extrude, partial face-only selections to
Offset, complete bodies to Move, and edge-only selections to Fillet. “Sketch planes” in this
interaction means filled regions, not whole sketch objects or empty planes.
Mixed target kinds have no automatic editing tool. Show one tool's local handles
at a time; toolbar buttons and E/O/M/F explicitly choose Extrude/Offset/Move/Fillet.
Shift+F chooses Chamfer, Shift+R chooses Revolve. Shift+U/S/I choose Union/Subtract/Intersect,
L chooses Loft. Erode is available through Tools without a keyboard shortcut. Shared
shortcut metadata supplies Tools badges and dispatch. Released finish-capable foreign
tools can switch through ordinary acceptance; Extrude retains U/S/I as local Boolean
modes, including shifted keys. Held gestures, fields, search, terminal, key repeat and
composition retain keyboard ownership. Sketch L remains Line. Focused buttons permit
CAD letter shortcuts while retaining ordinary Space/Enter activation. Shift+O/M remain
compatibility aliases. Shift bypasses geometry snaps during captured gestures; grid
snapping retains its independent toggle. Fillet's local small icon button
switches to Chamfer and back, including recalculating an active candidate.
The edge-size control uses a capsule arrow with a rounded fillet or beveled chamfer contour;
the compact panel uses distinct corner icons in fixed Fillet, Chamfer order with
an active highlight, followed by accept and cancel. The size
field stays visible above the buttons, including at zero; a valid zero preview can
be accepted and restores the original hard edges when revising a finish operation.
Acceptance is
disabled without a valid nonzero change. Cleanup is a separate standalone tool. Unfocused sizes display four significant
digits without reducing model precision. Tab/Shift+Tab cycles visible numeric
fields in both modeling and sketch controls. The operation anchor stays at the nearest
displayed edge point from the last click among selected edges. Its outward direction
is the incident faces' normal bisector, evaluated from nearby oriented presentation
triangles. Its glyph keeps that outward rigid geometry frame. Pointer size follows
the resulting surface movement: increasing size cuts inward at convex edges and
fills outward at concave edges. Nearby interior presentation samples determine
that sign; conflicting, tangent, opposing or degenerate samples offer typed size
entry. The signed drag direction is projected into the viewport and normalized;
each gesture holds its initial direction. Orbit reprojects the widget. A view
directly along the movement axis also offers typed size entry until orbit reveals
a direction. The click anchor is UI state and clears when accepted body geometry changes.
A white capsule fill and near-black outline follow the
[orientable widget guide](../design/orientable-widgets.md). Blue hover and red
geometry-limit/rejection feedback supplement the contours. Legal-size clamping
retains its valid preview and existing acceptance behavior.
If OCCT builds an edge finish with invalid topology, the kernel makes one shape
repair pass and validates the repaired solid before offering a preview. A repair
that remains invalid still rejects the edit.

Extrude and Offset share the outlined directional drawing and compact control card.
Extrude uses a lifted circular profile; Offset uses separated curved contours. Their signed
positive direction is the projected extrusion axis or material-outward face normal;
when viewed end-on, the existing upward drag fallback remains available. Each drag
holds its starting projection and scale. Distance fields remain visible at zero;
extrusion retains its draft row and fixed Boolean mode icons, followed by accept,
and cancel. Clean up is a separate selection tool. Offset defaults to absolute thickness for planar walls with a
directly reachable parallel face, or cylindrical/spherical walls with a directly
reachable concentric face in the same body. A labeled mode dropdown offers Thickness,
Radius and Offset where applicable; switching units preserves the preview. Radius
sets the absolute cylindrical/spherical radius and defaults when no thickness reference
exists. Offset is the signed material-outward change. Multiple radius targets must
share a radius and orientation response. Positive radii/thicknesses are required.
Faces with neither measurement offer Offset only. Recognized fillet
resizing retains its radius control. A zero fillet radius heals the complete
recognized blend group back to its supporting edges. Equal-setback chamfers between
planar supports, and 45-degree chamfers between a coaxial cylinder and its cap,
offer a chamfer distance control derived from current geometry. It rebuilds the
chamfer at a positive distance and heals it at zero. A tangent chamfer strip
resizes and heals together when every face has the same recognized setback;
partially recognized strips retain ordinary Offset. Normal drag travel converts
to setback distance using the supporting angle; dragging past zero stops at the
hard edge. Failed healing rejects without changing accepted geometry. Removal
retains body identity, selects affected bodies, and supports Cancel and Undo.
Unrecognized chamfers retain ordinary face Offset. Parallel non-concentric cylinders do not qualify.
The kernel sorts matching supports by normal separation, then checks exact trimmed
ray intersections from 11×11 parameter grids on both faces, excluding intervening faces.
Sampling the reference as well as the selected face recovers small recessed patches
that a coarse grid on the larger face can miss; the nearest such patch wins.
The distance is analytic; narrow facing regions can be missed by this conservative
sample search. The reference and conversion stay fixed through an edit. Multiple
selected walls must agree in thickness and signed response, and no reference may
belong to the expanded moving face set. Thickness must be positive. Existing kernel
validation and limit clamping still determine legal geometry; accepted edits and Undo
use the ordinary signed-offset operation, with no saved thickness constraint.
A complete one-face spherical shell can change radius through an exact centered
scale when the ordinary offset builder cannot process its closed shells. Only the
selected shell changes; stable topology correspondence, signed parallel-surface
checks, strict solid/interference validation and the existing volume checks apply.
Draft display rounding does not change the driving value. Ordinary completion
preserves subdivisions; neither tool probes cleanup availability. Rejected extrusion
and rejected/clamped offset requests turn their arrows red. Sketch-entry actions sit
below the card so the larger arrow cannot cover them.

Offset consumes disappearing boundaries rather than stopping at an old extrusion
rib. For inward planar movement, a connected wall fully crossed by the moving plane
can merge with an adjacent wall on the same plane or cylinder before retrimming.
Unreached subdivisions remain intact. This preparation is temporary with the
gesture; reversal restores them, and acceptance remains one Undo step. Merged walls
receive new identities while the continuing selected cap remains selected.
The captured legacy defect with a short open seam whose endpoints were merged is
healed on those same supports, checking unchanged volume and continuing surfaces.
New offsets reject vertex tolerances above 2e-6 mm. This is bounded boundary
absorption, not general removal of arbitrary curved faces or permission to cross
complete body collapse.

For a single planar face that normal offset construction cannot rebuild, Offset
may use the existing boundary reconnection machinery. The selected support must
translate by the requested signed normal distance, every unselected support must
remain fixed, and the strict solid checks still apply. This permits lifting an
interior cup floor without adopting Move's neighboring-face warping behavior.
The ordinary offset path runs first to preserve contact merging.
If those paths fail for a single outward planar offset, a swept-material Boolean
fallback can fill a cavity and absorb contacted coplanar caps. It uses the same
finite-face contact rule, removes consumed walls, and unifies the resulting cap.
Every result face must lie on an exact target plane or an unchanged analytic
plane/cylinder support; strict solid, interference and tolerance checks still apply.
Cylinder support comparison ignores reversal of its parameter axis, while retaining
the same angular, axis-line distance and radius tolerances.
Merged faces receive fresh IDs and remain selected. Contact is constructed at the
requested position, not approximated by the last successful bisection step.
Intentionally requested sub-contact steps remain exact; the 0.001 mm adjustment
budget does not mean snapping away real small features. A watertight solid with
an unintended residual ledge is still a failed operation outcome.

Offset also accepts verified nonanalytic supports, including spline bends and
existing offset surfaces. It prepares parameter correspondence on a deep copy,
uses local intersection joins to retain sharp caps, and reconstructs overly coarse
generated spatial boundaries from their pcurves. Every incident surface and curve
endpoint must agree within 1e-6 mm before conservative vertex bounds are tightened;
the final topology budget remains 2e-6 mm. Source geometry stays unchanged.
Every result face must correspond to a source face: selected supports match their
signed normal offset across C2 spans, unselected supports remain fixed, and continuing
face orientations agree. Exact BRep validity, positive volume/orientation, closed
boundaries, self-interference and minimum separation supplement the sampled checks.
This conservatively rejects unaccounted topology changes; it does not guarantee all
freeform offsets. Existing verified-limit clamping remains, and can be slow because
each trial repeats native construction and validation.

An explicit tool choice survives geometry preview replies. A fresh selection
restores its default. Switching tools completes a valid operation through its
existing one-step Undo route; an untouched operation can exit without an edit,
and invalid pending geometry remains recoverable. Numeric fields retain ordinary
text input; Enter leaves the extrusion/revolution field before tool hotkeys apply.
Extrude stays active through drag release and never becomes Offset mid-operation.

The toolbar's **Modify selection** submenu removes edges/faces, keeps only either
type, adds incident faces from selected edges or incident edges from selected faces,
selects owning bodies, selects the boundary of the selected face set, and clears.
Expansion retains existing ordered targets and adds unique stable topology IDs;
it uses published face-edge incidence, not visual proximity. Boundary selection
replaces the set with exterior/hole boundary edges, excluding shared interior edges.
Selection changes do not mutate geometry or create document Undo entries. Refinement
is unavailable during an active edit; finish or cancel it first.

## Delete faces and edges (founder decision, 2026-09-17)

Select solid faces/edges, then Delete/Backspace or **Delete** in the modeling tools.
Deletion calculates and accepts one closed-solid change immediately, with no modal
preview or confirmation. Undo restores it. During calculation other edits are
disabled and the ordinary busy indicator can appear; camera navigation remains
available. On failure, geometry and selection remain unchanged, the status shows
the reason, and the attempted operation and error remain in the unified history.
The user can revise selection and try again directly. Text fields retain ordinary
deletion. This supersedes the first modal deletion design on the same date.

Selected faces heal by extending neighboring surfaces, using current exact BRep,
not construction history. Select all relevant hole walls or pocket/boss walls and
floor/cap; fillet/chamfer faces can recover their supporting intersection. Edges
between matching supporting surfaces dissolve using scoped same-domain cleanup.
Sharp edges that require choosing a new replacement surface reject; no fitted
surface or open-shell mode is implied. Every selected face/edge must disappear;
partial healing and kernel warnings reject the entire edit. Mixed selections heal
faces first and dissolve surviving selected edges. Partial-body healing across multiple bodies is atomic, each retaining one valid
closed solid and its body identity. Complete body coverage instead removes that
body directly, including when selected through all its faces.

DocumentOwner owns accepted data and history. Immediate kernel correspondence
retains one-to-one topology IDs; splits/merges get new IDs. Unrelated subdivisions
remain protected in edge dissolution, as with explicit cleanup. After acceptance,
selection becomes the affected bodies because removed topology no longer exists.
Save/Open stores the healed BRep, which remains available for ordinary later edits.

## Boundary reconnection (2026-09-17)

The founder chose shared boundary reconnection as the only edge/face movement
path, replacing the limited feature reconstruction and constrained edge prototype.
Move/M always allows neighboring faces to warp; there is no mode switch or
operation flag. Unexpected surface results will be addressed as they arise in use.
World-axis translation and an optional edge boundary-normal handle remain available;
faces also have rotation. No edge rotation or movement of partial faces and edges together yet.

Each gesture or typed quantity is one axis operation. Release retains a temporary
preview. Enter/check accepts one Undo step; Escape/cross cancels. Tool switching
finishes only a valid request. Invalid requests show a red gizmo, retain the last
valid image and disable acceptance; typed values are never silently clamped.
Camera navigation and pivot repositioning remain available.

There is one selection/neighborhood rule:

- Selected faces and edges move rigidly, including their boundaries/endpoints.
- A face whose complete non-seam boundary moves is carried rigidly too. A top rim
  and its enclosed cap therefore express the same movement in the tested examples.
- Shared edges are reconstructed once. An unselected straight edge connects its
  new endpoints; other partially moved curves blend endpoint displacement across
  their spline poles. Boundaries whose endpoints both move retain a rigid transform.
- Faces incident to moved vertices reconnect to those boundaries. Other faces and
  the outer boundary of the affected neighborhood stay fixed. There is no automatic
  feature classification, loop selection, remote propagation or sketch dependency.

Reconstruction is driven by boundary structure, not hole/boss/chamfer labels.
Coplanar boundaries produce a plane, retaining holes as trimming loops. Boundaries
that remain on their original cylindrical support retain that cylinder and its
trim loops; projected boundary parameters preserve the original periodic branches
and both seam occurrences. This allows a neck with a threaded lower boundary to
lengthen when its cap moves axially. Projection correspondence and resulting edge/
vertex tolerances must remain within 1e-6 mm. A periodic band with two closed
boundary edges otherwise uses a ruled connection. A nonplanar single loop uses a
fitted surface. This changes accepted BRep surfaces, not just the mesh.
The kernel checks fitting error against 1e-6 mm, sews within that tolerance and
requires one valid, positive, non-self-intersecting solid. Sewing history continues
face IDs; edge continuation requires length and bidirectional sampled-distance
agreement with the constructed boundary, with a bijection and unchanged topology.
These are bounded numerical checks, not certified global error/swept-path proofs.

Only positional boundary continuity is requested. Tangency, original interior
curvature and surface fairness are not additional acceptance constraints. An
unselected curved neighbor may change substantially when refitted. Those outcomes
are subjects for founder review, not reasons to add shape-specific eligibility rules.
Zero movement returns the current geometry. A selected already-warped face still
moves rigidly; reopening does not require the operation that originally produced it.

The existing owner retains temporary preview, invalid recovery, one-step Undo and
Save/Open. Known limits: nonplanar faces with multiple boundary loops outside the
cylindrical-support/periodic-band cases, topology changes, and some unsupported/degenerate boundaries
still reject. Through-hole wall tilt currently hits the nonplanar multi-loop
limit; the removed analytic retrimming path no longer handles it. This does not
imply universal arbitrary-BRep movement support.
Hole/pocket/boss translation on planar stock uses this same path and preserves
flat attachments and unchanged outer stock boundaries in the verified examples.

## Known captured limitations

The captured 12-face deletion still exceeds the native 10-second deadline;
responsive cancellation does not mean that geometry can be healed.
Adding 1 mm to the top of the helically cut cylinder in
`tests/agent-revolve.mjs` rejects with `BRep_API: command not done`, preserving
accepted geometry. Neither case has a geometry fix established by the earlier checks.

The captured notched cylinder now shells inward/outward, but subsequently offsetting
its filleted interior floor by +0.2 mm still clamps to zero: the expanded tangent-face
chain fails the current check against joining distinct boundary endpoints. This remains a face-offset
limitation, separate from the shell's solid/boundary and export validation.

A local planar face Offset can preserve untouched geometry with inherited loose
vertex tolerances. Only vertices outside the edited boundary qualify: their
positions must remain within 1e-12 mm of the originals and their recorded bounds
must not increase. New or moved vertices keep the existing 2e-6 mm limit. This
is preservation of accepted geometry, not precision recovery; the usual support,
closed-solid, self-interference and boundary correspondence checks still apply.

## Loft

[Loft](loft.md) is an explicit tool for ordered filled regions and planar faces;
it does not replace the existing selection defaults. It can start with two or more
selected sections or with an empty selection for in-tool collection. Its local card
owns section order, correspondence and Smooth/Ruled controls, sharing the existing
Boolean targets and temporary acceptance lifecycle.

## Boolean operands

Union, Subtract and Intersect can start with no selection or geometry from one body.
Two or more owning bodies retain their ordered preview route. Selected solid
faces/edges expand to those bodies; mixed sketch/profile targets stay unavailable.
The operation itself requires at least two complete accepted bodies. While choosing
operands, viewport clicks and existing Entities rows operate on whole bodies, including enclosed
ones. Subtract clicks cycle unselected → target → cutting tool → unselected.
Choosing a new target demotes the previous target to cutting tool. Preselected
bodies start with their first body as target and the others as tools.
Union/Intersect clicks toggle membership.
Operand editing remains available throughout. Apply or Enter directly accepts
the current valid preview; there is no separate collection-completion step.
Reference planes do not intercept viewport clicks or double-clicks during operand
collection; empty-space clicks leave the Boolean tool open.
Empty/incomplete operands can exit without an edit.

Translucent blue input/target surfaces and orange cutting-tool surfaces, with
visible outlines, reveal operands through the solid result. Flipping the target
updates their roles. Entities rows use the same blue/orange colors, without
duplicating body choices or numbered input labels in the Boolean widget. The
widget contains only Boolean type, Keep/Remove, Apply and Cancel. Instruction
text, target-cycling controls, result counts and inline cleanup are absent.
A successful empty result is labeled on Apply and can be
accepted; it does not mean calculation failed. Accepted body geometry and IDs
remain authoritative; overlays and collection belong to the interaction lease.

The inline keep-originals choice displays Keep/Remove tools for Subtract and
Keep/Remove originals for Union/Intersect. Each mode remembers its last explicit
choice in local window preferences, including after Cancel; unavailable storage
falls back to that window's in-memory choice. Preference changes are outside
both document and temporary interaction Undo. Subtract always consumes its target
and optionally retains cutting tools; the other modes optionally retain all
inputs. Acceptance/cancel and document Undo/Redo retain their ordinary semantics.

## Bounded normal face extrusion (2026-10-06)

Extrude/E also accepts supported curved solid faces. It constructs material between
those exact trimmed faces and their normal offsets, closing their boundary with new
faces. It does not expand selection to Offset's tangent neighbors. Pulling one of
two coaxial cylinder bands therefore creates an annular shoulder and changes only
that band's radius. Positive signed distance adds material through automatic Union;
negative distance removes it through automatic Subtract. The existing explicit
Boolean modes and targets remain available. Radius is the default quantity when
selected cylinders/spheres share a radius and orientation; Distance is signed
material-outward travel. Switching quantity preserves the candidate.

Planar faces and sketch regions retain their existing common-direction extrusion.
Curved-face normal extrusion requires face-only selection, and hides planar draft,
twist and symmetry controls. Mixed curved faces and sketch regions reject. Native
construction copies each selected face, builds and orients a closed layer, then
runs strict solid/interference/tolerance validation before the existing Boolean
path. Offset construction and self-intersection limits can still reject curved
faces or distances; failed requests do not alter accepted geometry. Preview,
release, acceptance, tool switching, Cancel and one-step Undo use the existing
Extrusion lifecycle. Bodies continue to store materialized BRep rather than a
feature dependency on the original face.
The offset surface carries face correspondence through the Boolean, retaining
one-to-one face identity and selection. New shoulder faces receive new identities.
