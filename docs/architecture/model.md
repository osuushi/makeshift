# Document model and ownership

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## One document and a small set of responsibilities

Use a shared, strict TypeScript sketch model. The backend owns the accepted
document, temporary solved candidate and snapshot Undo; the renderer receives a
read-only view. Native components calculate geometry without owning a document.
No Electron or Node types enter the sketch model or interaction modules.

| Responsibility | Owns | Does not own |
| --- | --- | --- |
| Document editing | Geometry, constraints, groups, edit acceptance, Undo/Redo | Pointer events, native handles, network protocol |
| Interaction | Selection, active plane/tool, drag intent, numeric field drafts | A second geometry database or separate mutation path per tool |
| Sketch geometry | Curve evaluation, intersections, snapping queries, derived regions | DOM, history, solid-tool behavior |
| Solver adapter | Candidate coordinates and constraint diagnosis from explicit inputs | Document identity, saving, UI state, Undo |
| Presentation | Outlines, fills, handles, dimension placement and hit candidates | Canonical dimensions or persistent geometry identity |
| Host | Files, app lifetime and native component calls if required | Sketch semantics |

These begin as modules, not six services or packages. Ordinary typed edit functions
are sufficient. Moving selected geometry and editing a dimension both use the
document's edit path; they do not require a generic command-bus framework.
The composition root only constructs and connects these responsibilities.
The sketch schema and simple ID/document assembly live in `document.ts` without
importing validation or editing modules. `point-math.ts` supplies elementary
coordinate arithmetic, and `point-reference.ts` resolves current endpoint/center
references without loading point-edit controllers. Callers that accept geometry
use the explicit `sketch-validation.ts` entry point. Curves, constraints and groups
require nonempty string IDs, unique within their kind in one sketch; curve and
constraint references remain sketch-scoped. Rectangle groups require four distinct
segment members. Whole-document validation remains the publication boundary.

Electron and Three.js remain selected. Native component reuse starts from the
existing C++20 build; it does not make C++ the owner of application policy or settle
every future backend choice. Do not reopen the desktop-shell or frontend-framework
choice. The short solver/curve integration decision is described below.

## Drawing benches

A drawing contains one or more named benches in tab order. Each bench has a
stable ID and owns its sketches, bodies, reference planes and related metadata.
All tabs use the same tools. The document owner exposes the active bench to
modeling, inspection and export, and serializes edits across the drawing.

Add opens a blank bench. Double-click a tab or press F2 to edit its name.
Switching is available between edits and restores the bench's camera, sketch
workspace and visibility for the open session. Selection clears on switch.
Each bench retains its own geometry and selection Undo/Redo history. Creating
and naming tabs are drawing organization actions outside that history.

The clipboard transfers supported sketch geometry and solids as editable copies
with fresh IDs. Pasting is one step in the destination bench's history.

### Smart objects

**Insert bench…** in the right-hand **Smart objects** pane adds a live placement
of a source bench to the current bench. The pane groups the available smart-object
actions and shows the source name during in-place editing.
Each placement has its own ID and affine transform. Placements can nest and share
sources. Acceptance, Undo, Redo, and Open all check that the links are acyclic.
Select placements in the viewport or under **Smart objects** in Entities. The
ordinary Move, Rotate, Scale and Mirror controls apply to the selected placements,
including a selection of links and whole solids. Option-Move or Duplicate creates
a second link. Delete removes the selected link with the rest of the selection.

**Edit in place** opens the source in its own coordinates with surrounding
geometry dimmed for context. Source edits and Undo update every linked placement.
**Done editing in place** returns one level. **Open source bench** switches to the
source tab. Context geometry is for visual reference while editing.

**Make smart object** moves selected bodies, sketches, sketch curves or regions,
planes, and links into a new bench and opens its tab. The new origin is the center
of the selected geometry's bounds in the original bench axes. The source camera
uses the new coordinates and keeps the selection framed. The linked placement
keeps the original geometry's position in the parent bench. Undo restores the
parent's geometry and keeps the source tab available. Select a whole body to include
it in the conversion.

Geometry edits on placements ask to **Make independent**. Confirming replaces
each link with editable geometry at its placement in one Undo step. Stretched or
sheared sketches keep compatible constraints and approximate transformed circular
curves with tolerance-bounded cubics. The linked viewport and export show base
geometry. Decorator previews remain available when editing the source.

## Entity panel organization

The document optionally stores `entityPresentation`: stable entity IDs with names
in panel order. Bodies, sketches and saved planes remain separate groups. Missing
entries use their existing generated labels and appear after saved entries.
Rename and insertion-before-ID reordering are direct document edits, saved with the archive and
included in snapshot Undo/Redo. Reordering never changes geometry array order or
selection. Double-click replaces the row label with a name field; Enter or blur
accepts and Escape cancels. Dragging a row previews an insertion marker within its
group and accepts one Undo step on release. Escape, lost capture and a drop outside
the group cancel. The panel scrolls near its edges during a drag. There is no row
menu or up/down control. Select + Enter enters a sketch (revealing it if hidden)
or a saved plane's workspace. Metadata
for removed IDs is ignored and pruned on the next organization edit. One-to-one
geometry continuations retain their names through their stable IDs.

## Sketch data model

Named face/edge selections appear as collapsible children of bodies. Their
[tagged-group contract](tagged-groups.md) defines modal membership editing,
independent metadata ownership and continuation through topology edits.

| Data | Meaning and lifetime |
| --- | --- |
| Document | Units, sketches, materialized bodies, saved planes and attached metadata; one accepted state |
| Sketch | A plane frame, curves, constraints and optional editing groups; a continuing workspace |
| Plane frame | Origin plus orthonormal U/V axes; sketch coordinates are always local 2D coordinates |
| Curve | Stable document-local ID, typed geometric definition, construction flag |
| Constraint | Stable ID, kind, references to curves/features and optional dimensional value |
| Editing group | Member curve IDs and optional convenience metadata such as “intact rectangle” |
| Region | Derived closed loops of curve spans, including holes; recomputed from current geometry |
| Selection | Transient references to curve/features, groups or current regions; separate from document data |

Delivered curve definitions cover a segment, circle, circular arc and cubic
Bézier. Ellipses produced by projection or nonuniform scaling use controlled cubic
approximation; the document has no ellipse or general NURBS entity. Store actual
curve parameters, not their display polyline. A feature
reference names an entity and a meaningful part, such as endpoint, center or
axis endpoint. Do not use solver indexes or render-array positions as IDs.
Define each concrete payload alongside its first implementation; no schema generator.

A rectangle is four line segments with closed corners, parallel opposite sides
and perpendicular adjacent sides. An editing group exposes convenient center,
edge and corner handles. Width, height and angle are derived from that geometry;
there is no separate authoritative rectangle origin/width/height record. Its
shape constraints do not pin it to XY axes or a world origin. It can translate
and rotate unless the user adds constraints that prevent those movements.

Rectangle creation, individual line creation and a future polygon tool therefore
produce the same kind of editable curves. Trim can break a rectangle group while
leaving ordinary editable geometry; it does not require another document format.
Groups never override constraints or silently repair geometry into their old shape.

Drawing another crossing curve recomputes current regions without deleting or
rewriting the original curve definitions. A region can contain partial spans and
inner loops. A region handle is a current derived selection, not a persistent
object ID. After an edit that changes intersections, rebuild the fills and clear
affected region selection; retain surviving curve selection by ID. This needs no
public document revision number.

Closure feedback uses current curve arrangements. `curve-spans.ts`
splits curve parameter domains at actual intersections and coincident endpoints;
`regions.ts` walks directed spans into bounded faces. Tangent directions and
curvature order connections, and analytic signed area distinguishes bounded faces.
Display chords never decide whether curves connect. Model geometry and IDs remain
unchanged. Endpoint merging uses the existing 1e-7 mm coincidence tolerance.

`region-fill.ts` caches these boundaries with the displayed document and samples
them for triangulation at the current zoom. It draws translucent tint with stencil
union so nested/overlapping cells do not darken. A portion of a circle in a boundary
is a circular arc span with start/end angles. Arc entities provide a bounded
parameter domain and filtered intersections to the same walker. Modeling selects
current regions with hole containment from `profiles.ts`. Extrude, Revolve and
other solid tools consume those current boundaries or selected topology; accepted
bodies retain exact geometry independently of the source sketch.

Name numerical policies by units and purpose: intersection and coincidence
distances, approximation error, orientation and degenerate volume serve distinct
contracts. Share values only where their semantics match. Screen-space hit/snap
distances remain separate; zoom must not change geometric validity. Test actual
small/large geometry before changing a model-space threshold.
