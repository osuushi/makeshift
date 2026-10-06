# Periodic cylinder

`periodic-face-fillet.json` retains exact BRep and topology IDs/signatures from the
founder's `makeshift-fixture-2026-10-06T03-28-08-927Z.json` capture. The short inner
cylindrical wall has two circular rims and a doubled seam occurrence. Ordinary Open
regenerates presentation; the UI regression checks face-to-Fillet/Chamfer conversion,
numeric focus, real preview, explicit rim equivalence and Cancel/Undo/Redo.
Sketches, meshes and history are omitted; this is user-created Makeshift geometry.

`threaded-flange-move.json` retains one exact body, topology IDs/signatures and the
three-face +2 mm Z movement from the founder's `2026-09-19T22-25-11-439Z-84f23788`
capture. The rounded flange adjoins a cylindrical neck with a threaded lower
boundary. Meshes, unrelated bodies and history are omitted; Open regenerates
presentation. It checks support-preserving reconnection, unchanged threads,
volume, transformed placement and movement lifecycle. This is user-created Freac geometry.

`collapsed-offset-wall.json` retains exact BRep and topology IDs/signatures from
the founder's `2026-09-17T23-07-25-208Z-9fc6ef8a` capture. An offset stopped just
above a circular rib, leaving a 0.00048828125 mm wall and merged seam endpoints.
It checks recovery of both caps, correct radius/height/volume, fresh merged-wall
identity, continued edits and Undo/Open. Sketches and meshes are omitted; ordinary
Open regenerates presentation. This is user-created Freac geometry.

`hole-in-cylinder.json` retains the exact body, topology signatures/IDs and requested
11 mm Y movement from the founder's 2026-09-17T02:54:55 fixture. Meshes and source
sketches are omitted; production Open regenerates presentation. It tests a radius-5
through-hole in a radius-44.86606874731851, height-48 cylinder, including exterior
preservation and boundary rejection. This is user-created Freac geometry.

`periodic-cylinder.json` is Freac-generated test data: an OCCT 7.9.3 cylinder of
radius 10 mm and height 5 mm. It retains exact BRep plus topology IDs/signatures;
loading through DocumentOwner regenerates meshes and face-edge occurrences.
No external CAD file or upstream source was copied. Its side is one periodic face
with a seam used twice, independently of Freac's sketch-to-solid conversion.

`periodic-cylinder.cpp` regenerates the raw presentation using Freac's serializer.
After the normal native build, compile it with the configured OCCT/Boost includes,
link the geometry/presentation/transform/booleans/edge-finishes objects (not main.cpp.o), and the
same OCCT libraries used by freac-kernel. For the JSON fixture, retain `brep`, give
the body ID `periodic-cylinder`, and retain each face/edge `signature` with IDs
`faces-0`, `edges-0`, etc. Presentation and face-edge references are intentionally
omitted so the regression verifies their regeneration through the production path.

`reverse-hole-cut.json` retains the exact body, topology IDs/signatures, sketches
and reverse extrusion from the founder's `2026-09-20T04-04-59-447Z-c8a262ea` capture.
A radius-12 transverse hole touches the cylinder/lower-fillet boundary; its +45 mm
half is already cut and the -65 mm completion originally returned invalid periodic
wires. Presentation/history are omitted and ordinary Open regenerates them.
Regressions cover cut lengths, both extrusion modes, material probes, identity,
standalone subtraction, transformed placement and editing/Undo/archive lifecycle.
This is user-created Freac geometry.

`filleted-export.json` retains the exact body and topology IDs/signatures from the
founder's `2026-09-21T14-13-09-271Z-eb7ed86d` capture. Native remeshing produces six
facets with repeated vertices around its fillets. Export omits collapsed facets
and requires the remaining mesh to be closed and consistently oriented. Sketches,
history and cached presentation are omitted; this is user-created Freac geometry.

`plane-cut-bent-shell.json` retains the exact hollow bend, topology IDs/signatures,
sketches and final YZ split request from the founder's
`2026-09-22T03-33-05-026Z-184f9daf` capture. Cached presentation and history are
omitted; ordinary Open regenerates the body view. Ordinary adaptive volume
integration falsely rejected the split. Regressions cover all world planes,
rigid placement, cancellation, history, archive and subsequent movement.
This is user-created Freac geometry.

`section-filleted-junction.json` retains the exact body and XZ plane from the
founder's `2026-09-23T11-12-49-403Z-90454deb` capture. Native splitting succeeded,
but independently evaluated arc/spline endpoints differed by about 2.12e-7 mm,
leaving the sketch section open. Topology IDs/signatures are retained; meshes,
source sketches and history are omitted. Tests cover section copying, subsequent
extrusion, Undo/Redo and the ordinary section pointer route. This is user-created
Freac geometry.

`offset-cubic-section.json` retains the copied sketch from the founder's
`2026-09-23T11-39-28-568Z-83c4a37a` capture. Its closed boundary contains eight
cubic Béziers, nine lines and two arcs; the previous offset tool excluded all
cubics. Bodies and history are omitted. Tests cover signed closed-loop offsets,
conversion distance, rejection, pointer/numeric editing, Undo and Save/Open.
This is user-created Freac geometry.

- `offset-cup-floor.json`, `offset-split-arcs.json`, and `shell-notched-cylinder.json`
  retain the founder's 2026-09-23 Capture fixture geometry and selection from
  22:04:12, 22:07:24 and 22:11:51 UTC respectively. Derived meshes and UI history
  are omitted; exact BReps, topology signatures/IDs, sketches and constraints remain.
  They reproduce a blocked floor lift, pinched arc-loop offset and notched shell.

- `offset-coplanar-contact.json` retains the exact body, sketches and topology
  from the founder's `2026-09-23T23-19-15-622Z-c5bcb124` capture, with floor/rim
  IDs and without derived meshes/history. The cavity floor stopped at
  z23.9990234375 below a z24 rim. Tests require exact contact and wall removal,
  continued large offsets, intentional small steps, rotation and subsequent edits.

- `shell-conservative-vertices.json` retains the exact body, sketches and topology
  from the founder's `2026-09-23T23-33-47-358Z-709f4297` capture, without derived
  meshes/history. Four inherited vertices have 1e-4 mm recorded bounds despite
  tight geometry. Tests require inward/outward shells, unchanged source geometry,
  exact cap/radius offsets, closed mesh exports, rotation and document history.

- `offset-decimal-contact.json` retains the body, sketches and topology from the
  founder's `2026-09-23T23-49-11-406Z-5074dfde` capture. Derived meshes/history
  are omitted. Its floor-to-rim distance is 9.78 mm; continuing beyond contact
  reverses a reconstructed cylinder's parameter axis. Tests require full requested
  travel, exact merging, preserved deliberate tiny shelves and closed exports.

- `offset-move-tilted-plate.json` retains the first two exact bodies and topology
  IDs/signatures from the founder's `2026-09-27T02-37-31-535Z-7a17bfe7` capture.
  Sketches, unrelated perforated stock, derived meshes and UI history are omitted.
  The capsule plate is rotated about 0.073° from the world axes; moving its hole
  or end along world X makes the surrounding perforated faces nonplanar. The boss
  sits on a spline-sided base carrying preexisting loose vertex tolerances.

- `projection-tilted-plane.json` retains the R20 XY circle and saved 30° plane
  at z26 from the founder's `2026-10-01T21-23-07-094Z-477b95d6` capture.
  History and transient UI state are omitted. The ordinary projection route checks
  plane picking, the expected ellipse, independent editing and document history.

`extrude-projected-cylinder.json` retains the projected/trimmed sketch, original
radius-16 tilted cylinder and 40 mm extrusion request from the founder's
`2026-10-02T12-06-41-325Z-dafff561` pre-extrusion capture. Cached presentation and
history are omitted. Without cubic Boolean contact resolution, the automatic join
passes basic BRep validation but loses large faces during meshing and returns an
incorrect volume. Regressions exercise Auto, Union, Subtract, Intersect and New
against independent cylinder/silhouette volume calculations, signed mesh volume
and closed/oriented mesh export, plus acceptance, Undo/Redo, Open, standalone
Union and rigid editing. `extrude-incomplete-cylinder.json`
retains the exact broken body and topology identities from the matching
`2026-10-02T12-06-33-981Z-3b86b0d2` post-extrusion capture. It ensures incomplete
historic geometry still rejects atomically on Open; it is not silently repaired
from a lost operation recipe. Both captures are user-created Freac geometry.
