# 3D tools: rails through primitives

3D tools make common actions easier and help people learn the expert modeling
flow. They guide users through ordinary editable primitives with intuitive defaults
and as little hidden behavior as possible. They do not introduce opaque shape
objects, separate geometry ownership, or an alternative modeling system. Adding a
useful primitive is acceptable when the expert flow needs it.

A guided tool has a small tree of interaction modes. Its responsibility ends as
soon as it can hand the user to an existing tool with meaningful inputs. Each
step should expose the operations an experienced user would choose, easing people
into thinking in sketches, regions and constructive solid geometry.

## Cube proof of concept

Choose **Cube** in Tools. In Modeling, a square follows the pointer with one corner on
the hovered visible construction plane or planar solid face, falling back to
the current primary canonical plane. Its default side is a rounded decimal
millimeter quantity: an integer times a power of ten, chosen near one eighth of
the viewport's shorter dimension by projected bounding extent. Orbit and zoom
recompute the plane and size before placement; a held gesture keeps its plane and
starting size fixed, including when dragging beyond the hovered support.

Click to create the square sketch. Click and drag from one corner to the opposite
corner; hold Option to center the rectangle on the press point and extrude
symmetrically about its plane. Option can change during hover or sizing; its state
on release carries into Extrude. Hold Shift to lock a square. A bottom hint advertises dragging,
and dimensions alongside the preview expose its size. This uses the ordinary
rectangle footprint with a light-green mesh and darker green contours showing its
extrusion during hover and sizing. The mesh has depth equal to the rectangle's
minor dimension and creates no document geometry. The sketch uses the ordinary
rectangle primitive: four segments, rectangle constraints and a convenience group.
A fresh sketch keeps the new region independent of nearby existing profiles.

On release, select that region and enter ordinary **Extrude**, prefilled with
**Symmetric** matching Option on release, **Union** selected even for intersecting material, and
depth equal to the rectangle's minor dimension.
Cube mode ends here. A simple click followed by clicking away finishes a cube;
dragging instead produces a rectangular prism. The regular extrusion arrow,
distance field, draft, twist and Boolean controls remain available. Extrusion
stays temporary until normal completion; cancel retains the accepted sketch.
Sketch creation and extrusion acceptance are ordinary separate Undo steps.

The sketch remains in the document. On successful extrusion completion, the
existing visibility rule hides it when every region was used. It can be shown,
reopened, moved and dimensionally edited as an ordinary rectangle sketch.

## Circular tools (founder decision, 2026-10-09)

**Cylinder**, **Sphere**, **Cone** and **Drill** use a circle centered on the initial
click. Drag from that center to set its radius, or click to use the displayed default
diameter. The footprint is always centered; Option has no placement behavior.
Opaque shaded placement meshes have darker green silhouettes and visible edges
to distinguish their front and back; Drill retains its subtractive pink fill.
The support and default size follow Cube's rules, except Drill requires a visible
planar body face. Hover previews and diameter labels create no document geometry.
A held gesture keeps its initial support. Each completed placement accepts a fresh
ordinary sketch, then hands off to the existing editable modeling tool. Canceling
that tool retains the sketch; solid acceptance is a separate Undo step.

Cylinder enters **Extrude** with outward depth equal to the circle's diameter,
**Union** selected and Symmetric off. Cone uses the same depth and operation,
with inward Draft offset equal to its radius. Its exact circular apex has no
finite top face. Ordinary Extrude still exposes distance, symmetry, draft, twist
and Boolean mode; changing those controls is a regular extrusion edit.

Sphere adds an ordinary diameter segment in the circle's sketch. Its direction
chooses the sketch grid axis pointing most away from the camera. Ties, including
a head-on view, use local V. That diameter creates two half-disk regions. The
guide selects one region and enters **Revolve** with the diameter's axis, 360°,
zero height and **Union**. Enter accepts a ball; angle, height, axis and Boolean
controls remain available. Both source curves remain ordinary editable geometry.

Drill has a drill icon and accepts a circle only on a planar body face. It enters
**Extrude**, with **Subtract**, Symmetric off and a negative distance along the
face's outward normal. Depth conservatively projects the selected body's exact
axis-aligned bounds onto that normal, plus a small clearance, so it clears the
whole body rather than stopping at the first cavity. Oblique bounds can give
extra travel. Other visible bodies intersected within that travel can also be cut
through the ordinary Boolean target rules; hidden bodies are excluded. Depth and
targets remain editable in Extrude. No persistent drill recipe or body dependency
is added.

Placement previews render opaque into a separate depth buffer, then blend over the
viewport at 50% opacity. Their front surfaces occlude their own back surfaces, while
the underlying model remains visible. Drill retains a pink fill; its coplanar entry
cap never competes with the body face for depth. Preview geometry stays exact.
