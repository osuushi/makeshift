# Guide points

Guide points are saved semantic references to existing geometry. They belong to
the authoritative document and participate in ordinary save/open and snapshot
Undo/Redo. Their definitions contain geometry IDs and a feature kind, never a
stored world position or an offset from an owner's center.

## Interaction

**Edit Guide Points** is an on/off toolbar toggle in both workspaces, with shortcut
**G**. It controls candidate discovery, remembered independently for sketch and 3D
workspaces. Sketch editing starts off; 3D editing starts on. Non-hidden saved guides and
their ordinary snapping remain available with editing off. This is per-window view
state, separate from each guide's eye control and document Undo. There is no modal
Guide points creation tool.
With Select active, automatic discovery uses the ordinary click target. A guide
is a candidate when its parent is hovered or directly neighbors the hovered entity
in the geometry graph, and the pointer lies within 256 CSS pixels of the guide.
A hovered face exposes its boundary-edge and junction guides; a hovered edge
exposes its own guides and those of its incident faces. Body-center guides remain
eligible from body members, and hovering a whole body exposes face guides.
Do not recursively expand through those neighbors to the rest of the body.
Sketch curves and point handles use their curve or editing-group members.
All semantic feature kinds participate, including centers.

Hover-only discovery probes ordinary geometry at each candidate's own screen
position, without changing live hover or selection. The same definition must
survive discovery, spacing and parent clearance there as well as at the current
pointer. A centroid outside its face or over unrelated geometry must not appear
only while hovering a different location and vanish on approach.

Selected geometry also exposes nearby candidates, including selected sketch
curves, editing groups and point owners. Selection uses the same immediate graph
neighborhood and also supports combined selected-face definitions. These candidates
do not require a hovered parent or a successful destination hover probe. They
still require pointer proximity within 256 CSS pixels and obey owner visibility,
saved-guide blocking, spacing and parent clearance, and disappear when selection changes or clears. This makes
otherwise inaccessible references saveable without relaxing the visual filters.

At most three candidate markers are shown, prioritized by screen distance to the pointer
after discovery and clearance filtering. Saved guides do not count toward this limit.
This is the steady-state target set: candidate marker DOM nodes are retained while
fading in or out over 100 ms, with a minimum 100 ms on-screen lifetime before
fading out. Returning targets reverse their fade without recreating the marker.
Departing markers are noninteractive; panel/widget occlusion remains immediate.
Transitions may briefly show outgoing markers alongside the three incoming targets.
Saved, candidate and destination markers are hidden immediately behind opaque visible
solid surfaces or section caps. The visibility probe follows the current display geometry,
per-screen clipping and body transparency; translucent bodies and sketch X-ray foreground
passes do not occlude markers. Occluded candidates are excluded before the three-marker cap.

Definitions at the same 3D location share one marker and the existing definition
chooser, so a circular rim center and its cap centers do not suppress one another.
Remove every candidate with a distinct point less than 32 CSS pixels away,
using the original set so collisions remove both points and do not depend on
iteration order. Points at different depths still collide when projected together.
Every visible saved guide participates in this spacing check regardless of its owner or pointer distance;
saved guides remain visible, while hidden guides and hidden owners do not block.
Already-saved definitions do not also appear as ghosts. Saved and candidate markers
are suppressed wherever their hit footprint overlaps a visible orientable control
or application panel, including parameter cards, menus, toolbars and Entities.
Transient destination circles and lock rings obey the same clearance. Saved guides
remain displayed during tool gestures regardless of whether they are reachable targets.

After spacing, each ghost must leave a continuous 32 CSS pixels along every
referenced parent's largest projected dimension. Project the displayed curves,
edges and face meshes and subtract the 20-pixel hit footprints of surviving
candidates and visible saved guides. Junctions check every incident edge; face
groups check every referenced face. This prevents guides from covering small or
foreshortened parents. These discovery filters govern hover markers, not the
references available while dragging an already-saved guide.
Single-clicking a ghost saves it. Coincident meanings open a chooser with the first
listed definition preselected. Each choice uses a geometry diagram showing its
referenced parents and exact point, with a short meaning label. Generated guide
numbers are omitted; custom names remain. Clicking a diagram chooses that meaning; clicking away
or moving away from both marker and panel for 500 ms accepts the default. Escape or Cancel discards
it. The panel fades over 150 ms after the away delay; reentering either area resets
the delay. Saved markers use the same selection chooser when overlapping;
double-clicking never removes them. Select guides and use Delete/Backspace to remove them.
Markers use a centered
drawn cross; selected guides use the standard selection blue. Hover highlights
the referenced parents in purple, including every parent in an overlap cluster.
Visible guides, including ghosts, own pointer hits before geometry underneath.
A ghost's click does not select the underlying geometry; keyboard activation also
saves it. Each saved point is its own Undo step.
Marker tooltips show the semantic meaning and a custom guide name when present;
generated `Guide point N` prefixes are omitted. Renaming updates the tooltip immediately.

Saved guides appear beneath their owning body or sketch, sharing the disclosure
with tagged groups. Each compact row contains the name and the standard Entities
eye icon. Double-click the name to rename it; its tooltip describes the meaning.
Hovering or selecting the row highlights the referenced geometry. Hide excludes
the guide from display and snapping. Shift-click markers or rows to toggle guides
in an ordered multiselection; ordinary click selects one. All selected markers and
rows are blue. Delete/Backspace removes the selected guides together in one Undo.
Escape clears guide selection. Three distinct non-collinear selected guides expose
Construction plane in the toolbox, also while sketching. The first point defines
the origin, the second the positive U direction, and the third the plane orientation.
Creation copies their current positions into an independent saved plane, selects
that plane in Modeling, and adds one Undo step. Invalid point counts or collinear
points disable the command with a reason. Selecting a guide does not replace the
geometry selection. A subsequent geometry selection
clears the guide selection so Delete keeps its ordinary selection meaning.

Visible saved guides are sketch snap targets, projected along the current camera
ray onto the active plane even when the source lies off that plane. Snapping
positions geometry; it does not create a persistent relationship to the guide.
Existing sketch and transform snapping remains available. Owner visibility also
controls guide visibility; hidden guides do not contribute targets.

With no active modeling tool, drag a saved guide to move its owning body or whole sketch. When Move
(M) is active, the actual selection takes precedence, including selected faces,
edges or sketch points/curves; dragging a guide never replaces a selected face
with its whole body. Click remains selection until the ordinary pointer movement
threshold is crossed.

Guide dragging always acquires a snap reference. The display is a vector anchored
at the starting guide; Move leaves geometry unchanged until release. Until a
snap is acquired, a faded arrow follows the cursor; it is only feedback and does
not permit free displacement. The enlarged arrowhead remains visible beyond the
endpoint ring. Targets include saved guides, the origin, ordinary geometry points, and normal
projections onto planar faces, visible construction planes and all three canonical
planes. Canonical destinations are available independently of the primary
grid or global grid visibility. Each canonical destination has a small soft patch
of its colored grid, aligned to that plane's world grid spacing. Sketch-only moves
still restrict projections to those remaining in the active sketch plane. Unsaved drag
destinations appear as small yellow circles without crosses. Projection destinations
also have a faint dotted gray line to the starting guide; covered destinations are dimmed
and remain available in the hold-to-choose panel.
Dragging over a destination highlights all of its potential parent curves, edges,
faces or saved planes in purple, including parents of coincident point meanings.
Canonical planes use purple emphasis on their local grid patches. Before resolving
an ambiguous endpoint, its potential parents are highlighted together; the chooser
then follows the selected destination. Moving away, Shift, cancellation or completion
clears this destination emphasis without changing the geometry selection.
A locked face-plane destination also reveals a narrow fuzzy grid stroke within
that face's plane, from the closest point on the actual face to the destination.
This partial grid makes coplanarity visible across a gap; it does not appear before
lock-on. The short reveal plays once per lock and respects reduced motion.
Leaving the target, Shift or ending the drag removes the face grid.
Each destination has the same 10 CSS pixel hit radius. The rest of a face or plane
does not acquire a snap. The destination is the normal projection of the starting
guide, including projections outside a face's trim boundary. Points on
the moving body or sketch are valid targets too: every reference uses its accepted
position at drag start, so it never chases the moving geometry. The starting point
itself is excluded. Unsaved midpoints and other semantic points remain available.
Coincident destinations share a marker and a displacement. Selected sketch
geometry uses camera projection onto its continuing planar workspace.

While dragging, hold relatively still over an ambiguous location for 300 ms to
open a geometry chooser. The usual growing hold indicator shows the delay;
movement beyond 6 CSS pixels (16 for Pencil) restarts it. The chooser includes
covered point and plane alternatives, with the current snap first and remaining
choices ordered by depth. It preselects the current snap (or the first choice if
none was acquired), keeping the arrow visible. Each diagram marks the
exact target point, with coordinates shown to at most three decimals. Keep holding,
drag into a diagram, and release to apply that target. Hover selects the diagram
and previews its vector and parents; moving off a diagram retains the choice.
Release uses the selected target, including at the original point or outside the
panel. Leaving both the trigger point and panel for 500 ms starts a 150 ms fade,
then returns to ordinary dragging at the current cursor. Reentering either area
resets dismissal. Escape cancels the drag.
The existing drag lease owns this chooser; it creates no separate edit or history.

For Move, release on a valid target accepts one edit. Release without a target, Shift,
Escape or cancellation leaves geometry unchanged. Option/Alt copies complete
bodies/sketches and their guides. The shared rotation/scale anchor also snaps to
saved guides. Close distinct 3D guides with equally near projections do not
silently win over one another; hold to choose the intended target.

## Offset and Extrude constraints

The active modeling tool, including the selection's default tool, owns a guide
drag. A selected face normally supplies Offset; a selected profile supplies Extrude.
These tools solve their distance parameter from the guide's permitted trajectory.
The handle must lie on a selected source's supporting plane or cylindrical surface;
it may lie beyond the trimmed face, including on a cylinder's axial extension.
The guide is a virtual handle and does not change its owning geometry independently.
Unsupported tools or handles never fall back to moving the guide's owner.
Markers that cannot start the current tool are gray, using the same source
eligibility as dragging. They remain selectable for guide management. Overlapping
markers follow the selected meaning, or remain available if any meaning can start
the tool. During a drag, remaining markers show destination availability instead;
a guide that cannot start the tool can still be a valid destination.

Exact point coincidence is offered only when the destination lies on the permitted
trajectory. Off-axis references may instead supply a separately labeled Height or
Radius destination on that trajectory. Plane references use its intersection with
the permitted trajectory, rather than a sideways projection. Parallel planes,
collapsed radii and otherwise unsolvable relationships are omitted from both
markers and hit testing. Unreachable saved guides disappear during the gesture.
References remain frozen at their accepted positions. Kernel rejection or a
clamped parameter removes the destination; lock feedback appears only after a
successful preview. Height and radius alignment reveal a local planar or curved
grid connecting the reference to the solved destination.
Virtual destinations remain reachable through the selected sketch's automatic
cutaway; explicit section cuts still filter them. Reachable saved markers remain
direct snap targets through bodies, consistent with their visible markers and Move.
Body occlusion still dims unsaved destinations and requires the target chooser.

The gesture borrows the existing tool interaction and previews its geometry.
Release retains the temporary Offset/Extrude value; ordinary tool completion
accepts one document Undo step. Escape, Shift-release or release without a target
restores the parameter from before the gesture, or cancels a newly started tool.
Symmetric planar extrusion solves total cap-to-cap depth. Guide solving currently
excludes nonzero draft/twist and blend/chamfer resizing. Persistent relationships
are not created.

## Snapping ordinary tool handles

With Edit Guide Points on, dragging an ordinary Offset, Extrude or Fillet handle
also exposes reachable reference points. Offset/Extrude fit their supporting plane
or cylinder through the actual target, including off-axis references; the handle
itself need not meet that point. Their existing source-support restrictions above
still apply. A locked planar or cylindrical fit reveals the same local surface
grid used by guide dragging. Fillet fits the newly rounded surface through the
point, rather than placing its tangency boundary there. Chamfer's shared size
handle follows the same surface rule.

Fillet/Chamfer targets use a read-only native calculation against generated faces.
The bounded scalar search follows the feasible size range from zero and verifies
point-to-trimmed-face distance within 0.000001 mm. Unchanged source faces cannot
satisfy this check. Failed or unreachable fits are omitted. Target discovery can
show a small “Finding targets…” indicator while native calculations run; ordinary
dragging remains available throughout.

References stay at their accepted positions for the gesture. The ordinary tool
owns free dragging, preview and Undo; snapping only supplies its parameter.
Shift bypasses target snaps, and turning Edit Guide Points off disables generated
tool targets. Covered unsaved points use hold-to-choose, including when only one covered choice exists.
Native preview success is required for lock feedback; rejected or clamped values
lose their target. Release retains the temporary tool result and removes target
feedback. Completion accepts it with the tool's existing single document Undo.

## Definitions and geometry

Supported definitions are:

- Sketch segment, arc and cubic endpoints and half-length midpoints; circle and
  arc circle centers.
- Body edge endpoints and half-length midpoints, circle/arc circle centers, and
  unambiguous junctions of incident edges.
- Face surface-area centroids, world-axis bounding-box centers, and centers of
  planar faces with concentric circular boundaries; coplanar face groups support
  the same definitions when they remain geometrically meaningful.
- Whole-body world-axis bounding-box centers.

Closed edges have no arbitrary seam endpoint or midpoint candidate. OCCT supplies
edge landmarks by arc-length integration and face surface bounds independently of
display tessellation. Face centroids use exact surface properties, including
holes. Sketch cubic midpoints use bounded numerical arc-length integration.
During a client-only rigid preview, face bounds transform their existing bounding
box; acceptance recomputes exact world-axis surface bounds in the kernel.

## Continuation

Body edits consume the existing immediate topology correspondence. Surviving
references keep their guide identity; whole-owner copies get independent guide
identities. A split face becomes a coplanar face group when possible. Its centroid
is weighted by descendant area; its bounds cover the group. Noncoplanar splits
and edge splits choose the first compatible descendant in operation order.
Split endpoints must retain the original endpoint rather than jump to the cut.
Junctions require compatible incident descendants with one shared endpoint.
Destroyed or no-longer-meaningful definitions are removed in the same geometry
edit, so Undo restores them with the geometry. There is no nearest-geometry guess.

Sketch Trim and region deletion supply immediate curve replacement IDs. Endpoint
guides follow the fragment retaining that endpoint; other features choose a
compatible descendant. Nonuniform arc scaling retains the final endpoint on the
last generated cubic; circle centers disappear when the geometry becomes
noncircular. Sketch merging remaps curve IDs and guide ownership; whole-sketch
copying makes independent references. Ordinary edits reevaluate the same feature
on the current curve.

Free guide placement, a show-all modifier, construction axes, and persistent
guide-driven constraints are outside this version. Physical iPad/Pencil hover and
double-tap behavior still require device acceptance.

Implementation: `src/guides/` owns definitions, evaluation, continuation, markers
and rows; document edits own persistence/history; existing sketch snapping and
Transform controllers consume the resolved points. Focused model tests cover
native split/cleanup/destruction/copy, sketch rewrites, projection and archive
round trips. Focused guide UI fixtures exercise real pointer dispatch, overlap
choice, projected sketch creation, widget clearance, 3D movement, automatic hover
scope and guide precedence over underlying geometry.
