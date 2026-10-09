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
rectangle footprint with a translucent light-green mesh showing its
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

## Future tools

Cylinder, sphere and other shape tools should follow the same principle. For each,
first identify the expert primitive flow, then design the smallest set of guided
modes and defaults that makes that flow discoverable. A shortcut is successful
when the user gets a useful shape quickly and learns how to keep editing it with
the existing modeling tools.
