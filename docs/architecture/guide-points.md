# Guide points

Guide points are saved semantic references to existing geometry. They belong to
the authoritative document and participate in ordinary save/open and snapshot
Undo/Redo. Their definitions contain geometry IDs and a feature kind, never a
stored world position or an offset from an owner's center.

## Interaction

**Guide points** is a toolbar visibility toggle in both workspaces, with shortcut
**G**. It starts on and controls saved markers, their snapping, and hover-only
candidate discovery together. This is per-window view state, separate from each
guide's eye control and document Undo. There is no modal Guide points creation tool.
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

Selected geometry also exposes candidates persistently, including selected sketch
curves, editing groups and point owners. Selection uses the same immediate graph
neighborhood and also supports combined selected-face definitions. These candidates
do not require a hovered parent, pointer proximity or a successful destination
hover probe. They still obey owner visibility, saved-guide blocking, spacing and
parent clearance, and disappear when selection changes or clears. This makes
otherwise inaccessible references saveable without relaxing the visual filters.

Definitions at the same 3D location share one marker and the existing definition
chooser, so a circular rim center and its cap centers do not suppress one another.
Remove every candidate with a distinct point less than 32 CSS pixels away,
using the original set so collisions remove both points and do not depend on
iteration order. Points at different depths still collide when projected together.
Every visible saved guide participates in this spacing check regardless of its owner or pointer distance;
saved guides remain visible, while hidden guides and hidden owners do not block.
Already-saved definitions do not also appear as ghosts.

After spacing, each ghost must leave a continuous 32 CSS pixels along every
referenced parent's largest projected dimension. Project the displayed curves,
edges and face meshes and subtract the 20-pixel hit footprints of surviving
candidates and visible saved guides. Junctions check every incident edge; face
groups check every referenced face. This prevents guides from covering small or
foreshortened parents. These discovery filters govern hover markers, not the
references available while dragging an already-saved guide.
Double-clicking a ghost saves it; double-clicking a saved marker deletes only that
guide. Overlapping saved guides offer a deletion chooser. Markers use a centered
drawn cross; selected guides use the standard selection blue. Hover highlights
the referenced parents in purple, including every parent in an overlap cluster.
Visible guides, including ghosts, own pointer hits before geometry underneath.
A ghost's single click does not select the underlying geometry or save the point;
keyboard activation saves it. Each saved point is its own Undo step.
Marker tooltips show the semantic meaning and a custom guide name when present;
generated `Guide point N` prefixes are omitted. Renaming updates the tooltip immediately.

Saved guides appear beneath their owning body or sketch, sharing the disclosure
with tagged groups. Each compact row contains the name and the standard Entities
eye icon. Double-click the name to rename it; its tooltip describes the meaning.
Hovering or selecting the row highlights the referenced geometry. Hide excludes
the guide from display and snapping. Select the guide and press Delete/Backspace
to remove only the guide. Selecting a
guide does not replace the geometry selection. A subsequent geometry selection
clears the guide selection so Delete keeps its ordinary selection meaning.

Visible saved guides are sketch snap targets, projected along the current camera
ray onto the active plane even when the source lies off that plane. Snapping
positions geometry; it does not create a persistent relationship to the guide.
Existing sketch and transform snapping remains available. Owner visibility also
controls guide visibility; hidden guides do not contribute targets.

Drag a saved guide directly to move its owning body or whole sketch. When Move
(M) is active, the actual selection takes precedence, including selected faces,
edges or sketch points/curves; dragging a guide never replaces a selected face
with its whole body. Click remains selection until the ordinary pointer movement
threshold is crossed.

Guide dragging always acquires a snap reference. The display is a vector anchored
at the starting guide, while geometry remains unchanged until release. Targets
include saved guides, the origin, ordinary geometry points, and planar faces or
visible construction/world planes. A plane target ends at the normal projection
of the starting guide, independent of where the pointer hits that plane. Points on
the moving body or sketch are valid targets too: every reference uses its accepted
position at drag start, so it never chases the moving geometry. The starting point
itself is excluded. Unsaved midpoints and other semantic points remain available.
Point targets take precedence over plane interiors. Selected sketch
geometry uses camera projection onto its continuing planar workspace.

While dragging, hold relatively still over an ambiguous location for 300 ms to
open a geometry chooser. The usual growing hold indicator shows the delay;
movement beyond 6 CSS pixels (16 for Pencil) restarts it. The chooser includes
covered point and plane alternatives, ordered by depth. Each diagram marks the
exact target point, with coordinates shown to at most three decimals. Keep holding,
drag into a diagram, and release to apply that target. Hover previews the vector
and referenced parents. Release outside the chooser or Escape cancels the drag.
The existing drag lease owns this chooser; it creates no separate edit or history.

Release on a valid target accepts one edit. Release without a target, Shift,
Escape or cancellation leaves geometry unchanged. Option/Alt copies complete
bodies/sketches and their guides. The shared rotation/scale anchor also snaps to
saved guides. Close distinct 3D guides with equally near projections do not
silently win over one another; hold to choose the intended target.

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
