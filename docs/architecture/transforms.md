# Sketch transforms

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Move, resize and rotate

Moving a selection applies one translation to every selected entity. Shared
endpoints move once. Geometry linked to unselected geometry by constraints follows
those constraints; preview shows all affected geometry. A fixed constraint either
limits the permitted movement or rejects an impossible edit, with visible feedback.
Do not silently break constraints, move only part of a requested rigid selection,
or remove a dimension to make the gesture succeed.

Other curves must be editable on delivery too: a line exposes both endpoints;
a circle exposes center and radius; an arc exposes its center, extent and radius;
an ellipse exposes center, axes and angle. Moving a connected endpoint affects its attached
geometry under the same constraints. Each tool brief specifies its creation
variant and these subsequent edits together. A curve that can only be drawn does
not complete its tool.

Rectangle handles have the same semantics after creation and after reselection:

| Handle/action | Intended result |
| --- | --- |
| Center/interior drag | Translate the whole rectangle without changing size |
| Left edge | Move that edge along its normal; hold the right edge fixed |
| Right edge | Move that edge along its normal; hold the left edge fixed |
| Top edge | Move that edge along its normal; hold the bottom edge fixed |
| Bottom edge | Move that edge along its normal; hold the top edge fixed |
| Any corner | Move that corner; hold the opposite corner fixed and edit both extents |
| Width/height field | Edit the corresponding extent using the active handle's anchor; default to the rectangle center when no handle is active |
| Rotation handle/angle | Rotate around the shown pivot, initially the selection center; allow repositioning the pivot |

“Left/top” describes the rectangle's current local frame. A rotated rectangle and
an XZ/YZ sketch behave identically. Edge motion ignores tangential pointer travel.
Crossing the anchor can flip an unconstrained rectangle; a degenerate zero-width
or zero-height candidate cannot commit. Do not implement all resizing by changing
positive width/height from a fixed lower-left origin.

These targets are temporary edit intentions. Persistent user locks remain
authoritative. A width lock prevents an edge resize until unlocked or edited;
it does not prevent translation. The UI shows why a handle is constrained.

Copy creates fresh entity/constraint IDs and copies constraints internal to the
selection. Links to unselected geometry are not duplicated implicitly. Mirror,
uniform scale and linear/circular copies use the same selection/edit lifecycle;
their pivot/axis/distance/count controls are local. An impossible transform must
not silently change locked dimensions. Exact gestures are specified per increment.

Rotation handles snap to 5° increments by default. Holding Shift refines this to
0.5°; Option/Alt does not change precision. Held previews respond to modifier
changes without pointer movement. Sketch rotation snaps the displayed orientation; world rotation
handles snap their gesture angle. Numeric entry remains exact, and Option retains
its Move duplication behavior. Move arrows snap displacement to the current grid
spacing; Shift uses one tenth of that spacing while bypassing geometry attraction.
The grid toggle still controls translation grid snapping.
Tabbing to a body or topology Move field during a held gesture gives numeric entry
ownership: typing updates the preview, and pointer travel or modifier changes cannot
replace that value. Whole-body rotation retains its preview and angle field after
pointer release so the angle can be refined before Enter/tool exit accepts it in
one Undo step; Escape cancels it. Whole-body translation still accepts on release.
Topology movement retains its combined preview.

### Option-Move duplication (founder-directed, 2026-09-21)

Holding Option/Alt during Move leaves the original geometry and transforms an
independent copy. This covers selected sketch geometry (including a subset of a
sketch), whole-sketch placement and complete bodies, including the Move widget's
rotation controls. Partial solid faces/edges retain ordinary Move behavior:
Option has no duplication effect there. Detached topology and reattachment are deferred.

The held preview responds immediately to pressing/releasing Option. Pointer release
accepts translation in one Undo step; body rotation remains editable until Enter or
tool exit accepts it. Escape cancels without creating a copy. Option-click a Move
handle to type a numeric copy transform; that click captures the copying choice.
The resulting copies become selected, retain selection order, and remain ordinary
editable geometry. Pivot-only movement never duplicates geometry. Drawing and resize
symmetry retain their existing modifier behavior.

Sketch copies get fresh curve/constraint/group IDs, retain only internal relationships
and complete rectangle groups, and never acquire implicit links to their originals.
Whole-sketch copies also get a fresh sketch ID. The existing DocumentOwner edit path
owns acceptance and history; gesture copy IDs and placement previews are temporary.

Rigid body placement returns `BodyGeometry` and a `DisplayDocument`, omitting the
source BRep from moved/copy preview bodies. Drawing, picking and mesh decorators
read that display geometry. These types cannot be passed as accepted documents or
exact kernel operands; completion transforms the authoritative source through the
existing backend operation before publication. Retained bodies may remain exact
source objects in the same display. The view is never an acceptance payload.

Whole-body copies use the existing exact-kernel transform with fresh topology IDs.

### Mirror (founder-approved interaction, 2026-09-20)

Select whole sketch curves or complete bodies, then **Mirror**. Sketch mode accepts
an existing straight line or local X/Y axis; modeling accepts a planar face or
XY/XZ/YZ world plane. Pick these directly in the viewport; there are no axis/plane
buttons in the local controls. Hover shows axes as thick blue lines, straight edges
along their actual length and planar faces with a blue fill; world-plane patches
retain their hover tint. This decoration clears on leaving a candidate or the tool
and never changes source selection or accepted geometry. Straight curves take
precedence over axes where they overlap. At the origin, move along an axis to
disambiguate the crossing. Body world planes use the viewport patches.
Partial faces and points are not mirror sources. The reference
is highlighted; its signed offset and **Keep original** checkbox are local controls.
Keep original defaults on. Enter/check accepts the temporary result in one Undo
step; Escape/cross cancels. A valid result also completes when leaving through an
operation-aware selection action. Failed/invalid inputs cannot accept. Navigation
remains available during calculation; conflicting edits are excluded.

Copies receive fresh document-local curve, constraint, group and topology IDs;
replacement preserves source identities and body order. The result is ordinary
editable geometry without a live link to either source or reference. Copy selection
retains source selection order. Sketch copies retain only internal constraints and
complete rectangle groups; external links are not cloned. Reflected arcs reverse
bulge, cubic controls reflect with endpoints, signed corner angles and tangent sides
reverse. Replacement retains external constraints. Every resulting sketch must
satisfy its constraints exactly: incompatible axis locks or external links reject
without distortion or silent constraint removal. The user can change the reference,
choose copying, or explicitly edit those constraints.

DocumentOwner owns the preview, acceptance and history. Sketch reflection validates
an exact coordinate transform without asking the solver to deform it; solid
reflection uses the existing exact-kernel transform and topology correspondence.
Mirrored bodies remain separate even when they touch or overlap; Boolean is an
explicit subsequent operation. No persistent symmetry constraint is introduced.

### Move widget (founder-directed, 2026-09-21)

Move follows the founder-approved [orientable widget design language](../design/orientable-widgets.md):
white capsule forms, a single black silhouette, a sphere anchor and a smaller curved
rotation glyph. Translation arrows roll around their shafts to face the camera, preserving their edit
directions. Rotation-marker planes retain their geometric orientation. The assembly
has constant nominal CSS-pixel scale through zoom. The 2026-10-02
screen-space clearance refinement in the widget design guide supersedes fixed
positions for the shared 3D assembly: projected controls move outward to clear
each other, the anchor and box handles, while preserving geometric orientation.
Corrections settle in 100 ms and freeze under hover/press.

Sketch Move has two positive local-axis arrows and a rotation marker at the positive
45-degree position. Modeling Move has three world-axis arrows and one rotation marker
in each coordinate plane. Within 12° of either direction of a canonical axis, modeling
shows the other two translation axes and rotation about the end-on axis. Planar rotation
markers hide within 12° of edge-on, including their hit targets. The dimensions and
thresholds are reference defaults that may be tuned through visual review.
Whole-sketch **Move sketch** uses this same assembly to transform the sketch plane
without changing its local curves; a relocated anchor supplies its rotation center.
Existing edge movement remains translation-only, including its boundary-normal control.
Partial-face and edge Move retain one temporary candidate across handle gestures.
Each new gesture composes with the last valid preview; numeric changes replace only
the active gesture. Translations retain rotation and preceding translation axes,
and face rotations compose in world space about the current anchor. A zero-value
handle switch preserves prior edits. Accept/exiting applies the combined transform
as one Undo step; Escape discards the entire sequence. Rejected input remains
unacceptable until corrected or a new gesture starts from the last valid preview.

The anchor is renderer UI state, independent of accepted geometry and Undo. In sketch
mode it drags in the workspace plane. In modeling it uses the principal plane
(XY/XZ/YZ) with the largest projected unit-square area. If the top two areas differ
by at most 5% of the largest, it falls back to the plane perpendicular to the
upright canonical axis selected by camera leveling (Y-up uses XZ). The plane passes
through the anchor and stays fixed for the gesture. During dragging,
a visible point of interest within 10 CSS pixels takes precedence over free placement:
origin, topology vertices, recognized circular/rectangular planar face centers, and
sketch points. Body triangles provide occlusion only, never extra snap vertices.
Sketch snapping stays in its workspace plane. Command bypasses point snapping and does
not orbit when the gesture starts on the anchor. Free anchor placement does not grid-snap.
Escape, pointer cancellation or focus loss restores the gesture's original anchor.
Geometry movement/rotation retains its existing solver/kernel, preview and Undo behavior.

### Transform (founder-directed, 2026-09-22)

**Transform (M)** combines the former Move and Scale tools. The existing capsule
arrows, rotation markers and movable sphere anchor remain, with a bounding box
for resizing. Move, rotate, resize and scale are search aliases for Transform.
The earlier Move widget and Option-copy contracts above continue to govern its
movement controls.

In idle Modeling, Enter invokes the same Transform action for one or more selected
whole-body targets. Fresh body selection already exposes Transform by default;
Enter restores it after another idle tool choice without starting a geometry edit.
Sketch and planar-face Enter retain their existing workspace-entry behavior.
Numeric fields, editable text, native button/select actions, modal acceptance,
captured drags and calculations retain ownership of Enter. Held-key repeats and
modified Enter do not activate this alias. Movement/scaling, cancellation and Undo
continue through the existing controls and document owner.

Selected points still move as points; bounding-box scaling
currently requires whole curves, whole sketches, bodies, faces or edges.

Sketch boxes follow local workspace X/Y; modeling boxes use world X/Y/Z.
Whole-body bounds use kernel surface extrema, independent of display tessellation
and rational spline control points, including after nonuniform scaling.
Edge midpoint handles change the axes perpendicular to that edge; corners change the
available extents independently. Modeling also exposes single-axis face-center
handles. End-on directions retain their existing extent. Handles keep constant
CSS-pixel size while the box itself follows geometry. The shared sphere chooses
the rotation anchor and Option-resize anchor, and retains existing Move
placement/snapping behavior. It stays fixed during a scale preview even when the
selected geometry's bounds change.
A handle coincident with the anchor has no scaling leverage and is hidden.
Projected handles that overlap the sphere or rotation glyphs are also hidden
so those controls remain reachable; moving the anchor or view exposes them again.
To keep controls reachable, the shared 3D assembly separates both arrows and
rotation markers from projected box handles and from each other. The planar sketch
overlay extends translation arrows along their existing axis when a box handle
overlaps their nominal position. The numeric card
clears the combined box, arrows and anchor. This is the narrow exception to the
earlier fixed-position Move assembly; arrow orientation and size remain unchanged.

By default, dragging a box edge or corner keeps its opposite side or corner
fixed. Option/Alt instead resizes symmetrically about the sphere anchor. Shift
makes scaling uniform across the available axes, including axes not directly
dragged by an edge handle; without Option, their lower bounds remain fixed.
Shift also bypasses point attraction and snaps the handle’s first-axis scale factor to 0.1
increments, applying the same multiplier to every axis to preserve proportions
after an earlier nonuniform preview. Nonuniform scaling retains destination grid snapping; numeric scale
entry remains exact. Held modifiers update the preview during
the drag. The scale card stays hidden until a resize handle is used; clicking a handle
opens exact entry without requiring a drag. It hides again on acceptance or cancellation.
In sketch Move, Tab reveals and focuses X translation, Y translation, then rotation
in a cycle (Shift-Tab reverses it). Only the active Move field is shown; rotation
is revealed by its widget or its turn in the Tab cycle and updates during dragging.
Local X/Y/Z factors allow exact entry and use the box's lower bound
on each changed axis; **Uniform scale** links the factors. Positive finite
factors are required; collapsed or reflected scale candidates cannot accept.
Grid snapping quantizes handle destinations. Scaling release retains a temporary
preview; Enter/check accepts one Undo step, Escape/cross cancels. The Move arrows
and sphere remain visible while scaling. Starting an anchor or arrow gesture
accepts a valid scale preview, then hands that pointer gesture to the Move
control. Command-dragging inside the box moves the selection in one plane: the
active sketch plane in sketch mode, and the same camera-facing principal plane
with near-tie upright fallback used by free anchor movement in 3D. It also accepts a valid
scale preview before movement. The move creates its own Undo step. Movement keeps
its established gesture completion rules. Identity and rejected edits preserve
Redo. Multiple whole sketches can move or rotate together, including Option-copy,
in one Undo step.

While scale completion is pending, the buffered Move press retains its latest
coordinates and modifiers. Pointer cancellation, window focus loss or controller
disposal abandons that press; completed scale geometry remains accepted. A normal
pointer release retains the gesture endpoint for replay. Leaving a numeric field
does not count as losing window focus.

DocumentOwner applies the exact requested affine coordinates and validates the
existing constraints; it does not ask the solver to deform the selection to fit.
Incompatible locks or external relationships reject visibly without silent removal.
For whole sketches, transform the world geometry and construct an orthonormal plane
frame; local coordinates absorb the nonuniform stretch or shear. Independent
construction planes remain unchanged.

Circles and arcs remain analytic under a similarity transform in their own plane.
Otherwise they become ordinary cubic Bézier segments with a maximum final-space
position error of **0.001 mm**, bounded using cubic Hermite interpolation.
Subdivision is independent of zoom and refuses more than 4096 segments per curve.
Original arc endpoints remain exact; endpoint relationships transfer to the first
and last pieces. Adjacent pieces are fused, including the closing circle join.
The first piece retains the original curve ID, other pieces receive distinct
stable document-local IDs, and all resulting pieces remain selected after acceptance.
Construction status is retained. Constraints that require the old circular edge or
center reject the conversion with an explanation. Undo restores primitives and links.

Whole solids use the exact kernel affine transform; no sketch Bézier approximation
is applied to their authoritative BRep. Faces/edges use boundary reconnection with
unchanged validity, tolerance and topology correspondence checks. Rational rims use
matching parameterizations when rebuilding ruled walls. Curve-length matching and
reported volume use accurate integration for rational geometry. Unsupported
reconnections remain recoverable errors.

### Planar movement shadows (founder trial, 2026-09-23)

In modeling, Command-hover inside a Transform box previews the selected geometry's
soft, translucent filled shadow on the fixed world plane parallel to the camera-selected
movement plane. Only this plane's shadow, label and perpendicular anchor-to-projection
guide are shown. The choice stays fixed throughout the drag. During the drag,
only the current preview casts shadows; no starting-position footprint is retained.
Release, cancellation and loss of focus clear the guides. Hovering or dragging
the anchor shows the same projection context; repositioning the anchor changes its
guides without pretending that the geometry has moved. Active sketch workspaces retain
their existing planar feedback.

When selected surfaces touch or cross the receiver, the projection is replaced by
a blue contact glow from their intersection with that plane. Presentation triangles
provide section segments, coplanar contact faces and tangent edge/point contacts.
Rounded screen-space strokes dilate the section boundary by 16 pixels before a
3-pixel Gaussian blur; its size stays constant through zoom. The foreground mask
also clips this glow after blur, including its portion inside the body. This is a
visual mesh section, not an exact kernel section; contact uses a 1e-7 world-unit
tolerance. Curve-only selections retain their projected feedback.

These are display-only silhouettes from presentation triangles, and softened projected
curves for sketch/edge selections, not exact sections or model geometry. Silhouettes are
filled as a union, preserving concave boundaries and projected openings, then blurred
in screen space for constant softness through zoom. Visible preview solids occlude
each shadow only where they lie between the camera and its receiving plane.
Triangles crossing a plane are clipped to their foreground portion; hidden solids
do not occlude. The depth mask is applied after blur so soft edges cannot spill onto
foreground surfaces. This uses the same presentation triangles as the solid view;
labels and anchor guides remain overlay annotations. World
planes remain fixed at the origin; an offscreen projection can consequently be outside
the viewport. No extra camera view, persistent object or Undo entry is introduced.

Boundary reconnection can fit nonplanar faces with holes. Outer edges constrain
its boundary; each inner wire constrains the same support and then trims a hole.
The spatial curves remain authoritative. Projected hole parameters, all resulting
curve/surface distances and edge tolerances must pass 1e-6 mm checks before the
existing closed-solid, self-interference and topology-correspondence checks.
This permits world-axis movement on a slightly tilted perforated plate without
silently projecting the requested movement into its original plane. Surface
fitting remains bounded and may reject larger or more complex deformations.
Even a small out-of-plane component can make this path take several seconds per
preview; movement contained in the face plane retains the much faster planar
reconstruction. Local-plane movement controls and fitting performance remain
separate follow-up work.
Unselected straight or cubic connectors between tangent curved rims preserve
those endpoint tangent directions while reconnecting moved ends. They can become
ordinary cubic edges; when the current endpoints and tangents line up again,
reconnection restores a straight edge. This uses current geometry, without a
stored feature recipe or a new persistent tangency relationship. Selected faces
and their boundaries still undergo the exact requested rigid transform.

Four-edge reconnections first use a ruled surface when all four resulting
boundaries match the requested curves one-to-one, retaining the requested analytic
edges when trimming that support. Otherwise surface fitting
remains available. Generated fitted boundaries must meet their incident surfaces
within 1e-6 mm; vertex bounds are reduced to at most 2e-6 mm only after checking
actual endpoint agreement, before sewing. This prevents conservative or inaccurate
fill tolerances from merging nearby endpoints on a subsequent edit.
