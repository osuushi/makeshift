# Guide points

Guide points are saved semantic references to existing geometry. They belong to
the authoritative document and participate in ordinary save/open and snapshot
Undo/Redo. Their definitions contain geometry IDs and a feature kind, never a
stored world position or an offset from an owner's center.

## Interaction

Select a body, face, edge, sketch, region or sketch curve and invoke **Guide points**.
The tool displays candidates; clicking one saves it. Nearby candidates share a
chooser that names each definition and highlights its source on hover. Done,
Enter or Escape exits the picker; each saved point is already its own Undo step.
With Select active, automatic discovery uses the ordinary click target. A guide
is a candidate when its parent is hovered or directly neighbors the hovered entity
in the geometry graph, and the pointer lies within 256 CSS pixels of the guide.
A hovered face exposes its boundary-edge and junction guides; a hovered edge
exposes its own guides and those of its incident faces. Body-center guides remain
eligible from body members, and hovering a whole body exposes face guides.
Do not recursively expand through those neighbors to the rest of the body.
Sketch curves and point handles use their curve or editing-group members.
All semantic feature kinds participate, including centers.

Remove every candidate with another candidate less than 32 CSS pixels away,
using the original set so collisions remove both points and do not depend on
iteration order. Co-located definitions also collide. Every visible saved guide
participates in this spacing check regardless of its owner or pointer distance;
saved guides remain visible, while hidden guides and hidden owners do not block.
Already-saved definitions do not also appear as ghosts.

After spacing, each ghost must leave a continuous 32 CSS pixels along every
referenced parent's largest projected dimension. Project the displayed curves,
edges and face meshes and subtract the 20-pixel hit footprints of surviving
candidates and visible saved guides. Junctions check every incident edge; face
groups check every referenced face. This prevents guides from covering small or
foreshortened parents. These discovery filters do not restrict the explicit Guide
points picker, which retains all candidates and its overlap chooser.
Double-clicking a ghost saves it.
Visible guides, including ghosts, own pointer hits before geometry underneath.
A ghost's single click does not select the underlying geometry or save the point;
keyboard activation saves it. The explicit Guide points tool saves on one click.

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

In 3D Transform/Move (M), drag a saved guide to translate its owning body or sketch.
If its owner is already among the selected whole entities, the selection moves
together. The free movement plane is the existing camera-facing transform plane;
snapping to a target uses its exact 3D location, including a different depth.
Shift bypasses point attraction; Option/Alt copies the moved owners and their
guides. Release accepts one edit, Escape cancels. The shared rotation/scale anchor
also snaps to saved guides. Close distinct 3D guides with equally near projections
do not silently win over one another; hide a competing guide to disambiguate.

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
