# Curve creation and editing

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Creation and immediate editing

Press-drag-release creates independent lines, rectangles and center-radius
circles. The selected drawing tool stays active after release. These tools have no polyline
continuation or click-to-place session: subsequent input selects/edits existing
geometry or starts a fresh drag. R/L/C explicitly arms creation over existing geometry.
The press stays pending until it resolves to a full click or a drag beyond the
movement threshold. Creation never steals a click intended to select a point.
This supersedes the earlier connected-line gesture. Arc conversion uses the
explicit bow affordances below without changing line creation precedence.

After a valid completion, the shape exists and is selected for editing. Leaving
the tool or changing focus preserves it. A zero-size or invalid gesture creates
nothing and adds no Undo entry. Creating another shape does not steal or rewrite
the prior shape's numeric fields.

### Pen paths

P or Tools → Pen starts click-to-place drawing in the active planar workspace.
Click places a corner anchor; press-drag creates mirrored incoming/outgoing cubic
handles at a smooth anchor. Two corner anchors create an ordinary segment. Any
span with a handle creates an ordinary cubic Bézier. Pen owns anchor clicks,
including clicks on existing geometry; V returns to ordinary selection/editing.
The first anchor is temporary and creates no sketch or Undo entry on its own.

Each completed span is accepted through the document owner, with its endpoint
coincidence and smooth-junction tangency constraints, in one Undo step. Successive
spans remain fused when moved. Tangency couples the joined handle directions;
their lengths stay independently editable. Grid placement creates no relationship.
Unambiguous endpoint and analytic-edge snaps apply the existing drawing attachment
policy. Centers, intersections, ambiguous junctions and body features remain
placement references rather than persistent cross-document relationships.

Shift bypasses geometry attraction and constrains the next-anchor or handle
direction to multiples of 45°. Grid snapping retains its independent Tools toggle,
which can change during a path. Handles use grid/geometry snapping without Shift;
their Shift direction lock uses the pointer with grid increments along the locked
direction when grid snapping is enabled. Option/Alt-drag makes a corner
with an independent outgoing handle. Clicking the current last anchor retracts
its outgoing handle; dragging it redirects the outgoing handle independently.

Clicking the first anchor closes the path and preserves applicable tangency at
the closing join. Enter, double-click or switching tools ends an open path.
Enter during span acceptance finishes after that acceptance completes. Escape or
pointer cancellation discards pending input and retains completed spans. Document
Undo ends the temporary continuation and undoes the last completed span.

After finishing, existing point/curve selection, movement, deletion, trim and
cubic handle controls apply. Shift-dragging an existing cubic handle locks its
direction to 45°; Option/Alt-dragging removes its joined-end tangency constraint
while retaining endpoint coincidence. These edits are undoable. General spline
editing and automatic anchor insertion/removal are outside this first pen tool.

### Circle interaction

C or Circle arms center-radius creation without choosing a plane. A valid drag
release creates one analytic circle and one Undo entry, retaining the tool.
Clicking its center selects it and switches to Select. Center or interior drag
moves the circle; the center is the grid/snap anchor even when grabbing its interior.
Dragging the circumference changes radius while holding the center fixed.
For a mixed selection, dragging a selected circumference translates the selection;
select the circle alone for radius editing.

The radius field sits outside the circumference along the last radius-drag direction.
It updates during drawing/resizing; typing, Tab, Enter and blur follow the existing
local-field behavior. Escape during a held drag discards the candidate, while
leaving a completed edit keeps it. Collapse/nonpositive radius rejects without
changing accepted geometry or Undo. A circle alone has no orientation field or
rotation handle; mixed selection supports rigid rotation of its center.

`curve-geometry.ts` supplies analytic bounds, closest points, center/quadrant snaps
and display samples; `curve-intersections.ts` computes segment/circle and
circle/circle intersections. Picking and snaps do not use tessellated chords.
Circles share selection, transforms, coincident-center co-dragging, Delete/Clear,
backend acceptance and Undo with existing curves. Co-dragging adds no constraint.

Circle outlines and region triangulation use derived, zoom-dependent chords (target
sagitta 0.3 pixels, capped at 2048 segments per full circle at extreme zoom). These
never enter the stored document or establish connectivity. Analytic directed spans
establish region boundaries before sampling, including circle/line exterior regions.
Selectable regions, hole containment, general curved constraints and model-operation
use of boundaries remain later increments.

### Arc interaction and representation

Draw a line, then drag either faint bow guide; or click a guide and type Radius.
The guide and its midpoint handle are both acquisition targets. New numeric arcs
use the chosen side/minor branch; drag passes through the advertised snapped point.
Shift bypasses geometry snaps and grid snapping remains independent. The endpoints
are fixed for bow/radius editing. Zero curvature returns to a segment. Release
accepts, Escape cancels, and the curve ID survives conversion and Undo/Redo.

An arc stores endpoints A/B and signed bulge, tan(sweep/4). Center/radius/angles are
derived in `arc-geometry.ts`. At exactly a semicircle, an optional branch hint
remembers a previously major radius-edit branch; this is editing intent, not a
second geometry representation. Endpoint dragging preserves bulge (angular extent)
while moving the requested endpoint. Center/ordinary edge dragging translates;
mixed transforms preserve geometry. A selected arc exposes endpoints, center,
a bow handle and the local radius. Numeric radius edits preserve side/branch and
reject values smaller than half the chord.

Bowing supports ordinary lines/arcs and rectangle sides. Conversion removes
incompatible line-only constraints automatically and preserves meaningful endpoint
links. Radius-locked arcs retain their locks during radius edits. A bottom notice
reports removed relationships; Undo restores the full pre-edit geometry. Explicit
point coincidence, concentricity and joined-endpoint tangency use the same solver.
Arc domains participate in analytic intersections, bounds, closest points,
center/end/midpoint/quadrant snaps and filled boundaries.
