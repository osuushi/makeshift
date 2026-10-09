# Product interaction requirements

Detailed product requirements, not implementation status. [Architecture overview](../architecture.md).
The 2026-09-16 cubic/projection decision supersedes earlier spline exclusions.
The current user request determines active work; these requirements do not authorize a work queue.

## Interaction

Light mode is the founder's default. Geometry needs clear outlines in idle,
hover and selected states. Dark mode may be offered as an option later.

R chooses the rectangle tool; it must not choose a plane, align the camera or
enter sketch mode. The user explicitly enters an available plane/workspace.
Extrusion is a 3D operation and is unavailable in planar sketch view; E must
not silently exit sketch mode to make it available.

[Guided 3D tools](3d-tools.md) compose ordinary primitives. Cube explicitly returns
to Modeling, places a centered rectangle on the primary canonical plane, then
hands off to symmetric Extrude. Within Cube placement, Shift locks a square.

Show rectangle dimensions during dragging, alongside their corresponding edges.
Each number is an independent spatial control, not a multi-field floating panel.
Tab cycles between them. Default snapping includes grid, existing points and
edges, centers and alignment guides. Hover highlights an acquisition target without
selecting it: a click selects, while a drawing drag snaps its start there.
Shift temporarily disables geometry attraction during geometry gestures, including guides. Grid
snapping is independent, initially on, and controlled by a toolbar toggle. Whole-object
translation snaps the displacement to the grid so arbitrary grab positions preserve
alignment; an acquired geometry target overrides that grid displacement. The displayed
snap cue, preview and committed point must agree. All active tool quantities and
handles are local to geometry, including extrusion, regardless of how activated.

Founder decision, 2026-09-21: Option/Alt controls symmetry instead of snap bypass.
Line/rectangle creation is centered on the press point; rectangle edge/corner
resizing preserves the original center. Width, height and length remain full
dimensions. Modifier changes recompute from the original gesture rather than
accumulating edits. Circles are already centered. Symmetry is gesture intent, not
a persistent constraint. Shift-click selection and Shift-hover inspection remain
available, as does Command-drag orbit navigation.

Symmetric extrusion keeps the source profile on its middle plane. Its signed
distance measures total cap-to-cap depth. The mode remains available during numeric
continuation after release. Each half is swept from the source; total twist is split
between opposite caps. Draft offset measures each cap's wall displacement from the
middle profile, and angle/offset conversion uses half-depth. Nonzero symmetric
draft therefore has a change of wall slope at the middle. These remain ordinary
temporary extrusion inputs, accepted in one Undo on completing the tool.

Sketch mode must feel like the same world as 3D view. Start new projects with a
clear world-origin indicator, consistent X/Y/Z axes and predictable camera
orientation. Show coordinate planes as faint infinite grids so the shared frame
of reference remains legible through sketch entry and orbiting back to 3D.
Highlight the active plane without replacing or relocating that world. Adapt grid
density to zoom; keep coordinates, units and snapping consistent. Face-supported
local origins must remain distinguishable from the world origin. Ordinary
navigator entry and viewport entry must agree; a second editor must not take over.

Quantities belong alongside geometry and corresponding interactive arrows or
handles. A movable tool chooser is acceptable. Fixed stacked parameter/tool bars,
duplicate XY/XZ/YZ buttons, and the FreeCAD Tasks pattern are rejected.

E activates extrusion; a selected 3D face should offer an initial zero-distance
extrusion interaction where that operation is appropriate. Dragging in either
direction defines an extrusion. Its Boolean operation is a separate choice,
rather than assigning add/remove behavior to the drag direction itself.

When the extrusion has a non-zero-volume intersection with any body, default to
subtraction. Touching alone is not that condition. Put the Boolean selector in
the extrusion widget next to the mouse, beside the length field. The available
choices are union, subtraction, intersection and new body. During extrusion,
quick U/S/I/N key presses select those respective modes. An explicit selection
must remain authoritative while the user continues adjusting the extrusion.

The founder prefers union for obvious bridges between bodies; refining that
automatic default is deferred. XOR is also deferred and may be composed from
other operations. These are Makeshift requirements based on the founder's intended
workflow, not a verified description of another application's implementation.

Extrude includes Draft with an Angle (°)/Offset (mm) dropdown. Switching the
measurement converts using the current extrusion length and preserves the shape.
Offset is the per-wall change at the far end; positive expands material and
narrows holes, negative contracts material. Changing length holds the selected
angle or offset fixed. The source boundary stays fixed. Draft shares extrusion's
preview, cancellation, completion, cleanup and one Undo step.

Dragging and inline numeric input are peers. In extrusion, both adjust the current
candidate until the operation is completed and exited. Confirming a quantity is
distinct from accepting the whole operation. Specify the precise Enter/exit/cancel
gestures with the extrusion design. Boolean shortcuts must coexist with inline
quantity editing and tool continuity; errors retain a recoverable mode.

Solid operations must account for multiple selected profiles/faces and multiple
resulting bodies. A subtraction that divides a body in half is a valid modeling
use case, not an error merely because the result contains two solids. Plan exact
selection and result behavior with each solid tool. Planar faces remain eligible
for sketching after Boolean operations; eligibility depends on geometric planarity,
not the construction recipe of their body.

Founder correction, 2026-09-14: extrusion needs an active operation that remains
adjustable until exit, even though it should feel as unobtrusive as possible.
An extrusion may cut a body into several parts. Keep those results temporary
through drag release and further adjustments; completing and exiting extrusion
accepts the valid result in one Undo step. Explicit cancel restores the original
geometry. Do not silently accept on application focus loss or replace the active
operation with offset-face after the first drag. Keep the controls local and the
camera usable. This supersedes earlier extrusion-release/handoff guidance.

Sketch drawing still creates geometry on gesture completion. Direct face editing
remains a separate later tool available on accepted body geometry. Revolve also
gets an explicit adjustment/completion design. Completion semantics belong to each
tool; visual continuity does not require identical commit timing.

After drawing, typing edits the shown default dimension immediately. Tab cycles
relevant inline fields: line length, rectangle width/height, circle radius.
Enter accepts the active valid edit regardless of incidental widget focus.
Future face editing should choose a meaningful measurement using geometry
(distance to opposite face, radius or offset), with visible context.

Undo/redo must preserve usable editing and input state. Losing focus, deleting a
source, changing tools, reopening a document and delayed backend replies must not
leave a dead editor. Kernel failures must be explained without losing valid work.

### Trackpad navigation

Two-finger scrolling pans. Command-drag orbits using a smoothed turntable with an outer roll ring.
Two-finger click-and-drag (secondary-button drag) pans.
Pinching zooms about the pointer. Pan and zoom retain the current sketch plane;
orbit exits sketch mode. Camera edits never alter document geometry or Undo.
Middle-button drag remains a mouse pan fallback. The founder selected
secondary-button pan after the three-finger DOM input experiment; no native
trackpad integration or Shift-scroll fallback is needed for this mapping.
