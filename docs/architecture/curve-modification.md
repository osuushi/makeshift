# Curve modification and regions

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Curve modification and regions

In 3D mode, Delete/Backspace on selected filled sketch regions trims their
boundaries in one document edit. Only points inside selected regions may become
unenclosed; every unselected enclosed region remains enclosed. Removing edges
cannot enclose previously unenclosed points. Interior selections can therefore
merge adjacent bounded regions instead of opening them. For two overlapping
circles, deleting the overlap removes both internal arcs and leaves the union;
deleting one outer crescent preserves the other circle, including the overlap;
deleting that crescent together with the overlap leaves the opposite crescent.
The operation derives adjacency from analytic arrangement spans, including hole
boundaries, and opens selected components that touch the exterior while retaining
their boundaries against unselected regions. Longer source curves split at those
span limits; unrelated tails and construction geometry survive. Coincident
ordinary curves trim together. Shared cubic endpoints remain exact during
intersection subdivision, including stationary Pen corners, so deletion does not
manufacture microscopic endpoint remnants. Remnants use the existing Trim constraint/ID
remapping and constraint-removal notice. Multi-sketch, whole-entity and solid
topology selections share one atomic backend edit and Undo/Redo. Selecting a whole
sketch still removes the sketch itself.

Trim highlights the exact span to remove between intersections and commits its
geometry/constraint changes together. Holding Shift ignores endpoint-only cuts
from overlapping curves and follows unambiguous degree-two endpoint joins across
ordinary curve pieces, including projected cubic chains. Crossings, branch
junctions and open ends bound the removal; one highlighted chain is one Undo. Pressing or releasing Shift refreshes the hover immediately,
and the click uses the same cut policy. Repeated T retains the tool. Outside a
plane, T asks for an unambiguous spatial target; it never chooses XY arbitrarily.
Split, extend, offset, sketch fillet and chamfer follow the same local lifecycle.

Holding Option in Trim shows a circular brush in sketch coordinates and the top
diameter controls. The slider and numeric mm field appear only while Option is
held and hide on release or focus loss. Physical bracket/brace keys resize
it while Option is held, including macOS Option-translated characters. The circle
follows the pointer and camera scale. Every finite trim span touched by the disk
is highlighted in full, including coincident portions removed by the rewrite.
Option-click accepts those spans; Option-drag accumulates the swept disk's targets
from the original sketch and accepts them together on release, in one Undo step.
A stroke keeps its brush mode until release if Option is released early. Holding
Option and Shift together applies the brush to every touched intersection-bounded
span and follows each unambiguous degree-two chain, stopping at crossings,
branches and open ends. Shift changes refresh a stationary brush preview while
Option continues to show its circle and diameter controls.
Escape (including with Option held), focus loss and lost pointer capture discard
a held stroke. Accepted geometry stays unchanged until release and validation;
brush diameter is tool UI state, independent of document Undo. Batch targets are
resolved against surviving geometry after each removal, so several spans of one
curve never reuse stale remnant parameters or resurrect deleted portions.

T1 trims ordinary lines, circles and arcs at analytic contacts. Its cuts exclude
the region walker's artificial circle seams; a circle with fewer than two distinct
contacts is removed whole. The first surviving piece retains the curve ID, and
additional pieces get document-local IDs. Endpoint links follow the piece that
retains that endpoint; radius and center relationships can follow both arc remnants.
Direction constraints stay on one line remnant with a parallel relationship to
the other, avoiding redundant copies of every direction equation. Tangency follows
only a remnant with finite contact. Whole-edge length relationships that no longer
hold are disclosed for removal. A new cutting endpoint automatically Fuses when
exactly one other surviving curve endpoint meets it. This runs after overlapping
span removal and belongs to the same Undo step. Untouched endpoints, ambiguous
junctions and cuts meeting an edge interior do not acquire new links.

Trimming a rectangle removes its convenience group and preserves the meaningful
ordinary constraints. If an entire side disappears, its perpendicular relationship
can use the surviving opposite side, retaining the remaining right angles. The
trim click accepts the validated rewrite automatically. Removed relationships
appear in a brief bottom notice; Undo restores the original geometry and constraints.
Hover chooses the shortest span among equally close hit curves, without a chooser.
A click clears the highlighted span and every coincident portion in the active
sketch, splitting longer overlaps while preserving their outside remnants. Mere
crossings and curves in other sketches are untouched. The highlight clears after
acceptance; the entire rewrite is one Undo step. Creation of new remnant geometry
is a rewrite, not a standalone
pair action with a privileged reference. Native validation and snapshot Undo remain
the acceptance boundary.

Keep constraints referring to surviving geometry where their meaning survives.
Remove constraints attached only to deleted geometry. If a retained constraint
cannot be meaningfully mapped, explain the affected constraint before accepting
its removal; do not silently break it or invent a correspondence. Define these
rules for each curve rewrite in its short tool brief, with Undo and rejection cases.

Regions must support connected linework, line/arc mixtures, nested loops/holes,
disjoint cells, crossings and tangent contacts. Display tessellation is never the
canonical closed boundary. Coincident duplicates and tiny trim remnants need
explicit tests; they must not poison unrelated valid cells. Unsupported numerical
cases get a local diagnostic, not a silently unselectable profile.

Sketch-to-sketch projection initially makes an explicit independent copy of the
projected curves, using source/target frames. A dynamic linked projection is a
separate product decision; do not build a dependency engine to deliver copying.

Projection sources retain document-local body/sketch/region/face/edge/curve
references. Filled regions behave as faces: project their trimmed outer and hole
loops, rather than the whole curves owning those spans. Face sets resolve their
wire boundaries against the accepted document using `model/face-boundary.ts`;
shared internal edges and periodic seams are omitted. Explicit edges remain
sources even when internal to a face set. Whole bodies project their feature
curves plus exact apparent contours; selected curved faces also include their
apparent contours. This supplies cylinder sides and spherical outlines without
requiring stored wires. Hidden as well as visible curves remain useful references.
Collapsed implicit body/face edges and degenerate pole edges are omitted; an
explicitly chosen edge that projects to a point rejects.

Target-normal projection casts perpendicular to the destination. Source-normal
projection casts perpendicular to the selected planar support, and is available
only for planar sources sharing a normal. Bodies, spatial edges and curved faces
have no inferred source normal. Rays parallel to the target reject with a local
explanation. Compact direction buttons show the chosen mode. Target frames come
from the active sketch, XY/XZ/YZ, a saved construction plane or a planar body face.
In Modeling, preselect sources and invoke Project, then click the destination's
visible patch or planar face. Without preselection, hover and click a first source:
curves show an outline, and filled faces/regions show a fill. Selected source faces
retain their filled highlight. Shift-click adds/removes sources; inside an active
sketch ordinary clicks toggle sources and its frame stays the destination.
Entities can toggle whole bodies/sketches without closing Project, including
geometry occluded in the viewport. Its hover highlights the corresponding source.
Plane hover and click share the same nearest-reference picker, including tilted
saved planes. Enter/check accepts, Escape/cross cancels and restores selection.
Direction and accept/cancel controls stay above the bottom status. Projection
errors sit above them with a fixed gap. Reuse a visible coplanar sketch or preview
a new sketch, then create it on acceptance. Hidden sketches are ignored when
resolving the destination, including canonical planes. The renderer passes an
explicit destination ID so preview and acceptance agree without exposing viewport
visibility to the backend. `backend/projection.ts` and the native kernel produce the usual
temporary candidate; acceptance is one Undo, without a persistent source link.
Before fitting spatial rims, split them at exact contour-endpoint contacts. Those
contacts become cubic endpoints and ordinary coincidence links, keeping side/rim
junctions closed for filled regions and extrusion. Region walking retains its
existing tolerance; accepted older copies remain ordinary editable curves.
Analytic primitives survive where natural; other curves become editable cubic
pieces with a 0.001 mm approximation budget.

Corner fillet hints retain their world-space radius while the same corner is
selected, so zooming in enlarges a crowded hint. Initial sizing provides clearance
from the corner and a visible arc radius, bounded by the available supports.
Dragging targets the closest point on the finite rounding arc, including its
endpoints, rather than projecting the cursor onto the corner bisector. Curved and
consumed supports use a sampled radius search with local refinement; grid snapping
compares nearby permitted radii by arc distance. Creation and existing-fillet radius
drags share this calculation. Explicit numeric radii still validate exactly, and
acceptance remains one ordinary sketch edit.

Clicking or dragging the sketch fillet guide accepts on pointer release and selects
the new arc for ordinary editing. Clicking away or pressing Escape afterward leaves
the accepted arc intact; Undo restores the corner. Held gestures remain cancellable.
The explicit Fillet sketch corner menu command retains numeric entry before acceptance.

Sketch offset accepts a single analytic edge or one closed loop, including mixed
cubic/line/arc loops copied from solid sections. Closed loops containing cubics
use native planar intersection-join offsets; positive distances expand the loop.
The result returns independent ordinary curves through the existing 0.001 mm
bounded cubic conversion and shared-vertex endpoint correction. Source geometry
and constraints remain unchanged; new joined endpoints receive coincidence links.
Preview remains temporary, Enter/drag release accepts one Undo step, and Escape
cancels. Closed analytic loops also use this native route when their direct offset
cannot join. A narrow neck may disappear, leaving several independent closed
sections, including complete circles. An omitted circular closing span may be
reconstructed only from a unique exact offset source support through both ends.
An entirely omitted convex circular support may survive as an independent island
when its circumference lies inside the original loop, has the requested boundary
clearance, and neither intersects nor nests with another surviving section.
Open, crossing or wholly collapsed results still reject atomically.
Open cubic offsets remain unavailable and the tool explains the closed-loop
requirement. No persistent offset dependency or general NURBS editing is introduced.

Released numeric sketch Fillet/Offset previews and valid Projection previews use
their ordinary acceptance path before a deliberate mode/action switch. Opening or
browsing Tools only borrows focus. Invalid numeric text, unfinished Projection
targets and rejected acceptance retain the owner and latest draft with a local
error; the requested action does not run. Captured drags retain their guards,
including the existing invalid fillet pointer-release cancellation.
Their existing document Undo/Redo path still cancels the temporary preview before
navigating accepted history; adding mode-switch finishers does not introduce local
preview checkpoints or accept geometry during Undo.
