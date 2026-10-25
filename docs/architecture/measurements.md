# Selection measurements

Founder request, 2026-09-20: selecting faces/edges reports separation and geometric
relationships. Maximum means largest gap, not the farthest pair of points.

The Measurements section of the movable, resizable Inspector automatically measures one or
two selected solid faces, solid edges, filled sketch regions in 3D, or whole curves
in a sketch workspace.
Filled regions behave as bounded zero-thickness faces, preserving holes and world
placement. They measure against regions, solid faces and edges using the same gap,
angle and relationship rules. A single region shows its area. Hiding bodies does
not disable visible-region measurement. Point/group-handle selections are not whole
curves. Constraints and measurements share the Inspector with gear groups and decorators.
Sections can be reordered and collapsed; the pane scrolls when viewport height is limited. The card is hidden
during editing; accepted geometry is measured again after
acceptance or Undo. Camera changes only reproject witness lines. Results are transient,
not dimensions, constraints, saved annotations or history entries.

## Quantities and conventions

- One entity: exact kernel curve length or face area; radius/diameter for circular
  curves and cylindrical faces.
- Two entities: shortest distance between the actual trimmed shapes, independently
  of facing-region gap. Intersecting shapes have zero shortest distance.
- Parallel distance: exact perpendicular separation between supporting straight
  lines, planar faces/regions, or a parallel line and plane. It is available even
  without trimmed overlap; coplanar/collinear supports report zero. Angled or curved
  pairs do not show this quantity.
- Gap corresponds to orthogonal nearest projection onto a supporting curve/surface,
  only where the projected point lies inside the selected trimmed entity. A lateral
  overhang cannot clamp to a boundary and inflate the gap. For like pairs both
  projection directions contribute, making the range independent of selection order.
  For edge/face pairs only edge-to-face projection contributes.
- Straight lines and polygonal planar faces use endpoints and the vertices of their
  projected overlap, including hole boundaries. The minimum also considers the
  exact bounded-shape minimum and plane crossings. These extrema are exact to kernel
  tolerance; this includes angled polygonal walls and partial overlaps.
- Parallel planes/lines, parallel line/plane pairs, concentric circular curves and
  coaxial cylindrical walls have constant analytic gaps when an overlap is found.
- Other curved pairs use 32 parameter intervals per boundary curve and a 16×16
  face-parameter grid, classified against exact trimming loops. These are explicitly
  approximate: sampled maximum is a lower bound and minimum may be high; small
  features or extrema may be missed. Circular/cylindrical correspondences that cross
  the selected source again are excluded, preventing remote back-side spans.
  Explanations live in the heading's (?) hover tooltip, rather than a paragraph
  in the readout; approximation marks remain beside values.
  This is not a certified clearance analysis. No resolved facing region shows
  unavailable gap, with shortest distance still available.
- Angles are the smaller unoriented supporting-line/plane angle (0–90 degrees),
  independent of the camera. Skew lines have no 2D angle. No single angle is assigned
  to general curved pairs. Parallel/perpendicular, coplanar/collinear, concentric
  circular and coaxial cylindrical relationships are shown when recognized.
- Center and axis distances are separate from gap. Distances use mm, areas mm²,
  angles degrees. Six significant display digits do not alter calculated values;
  numerical noise below 1e-7 displays as zero.

## Ownership and implementation

`measurement-input.ts` resolves stable IDs and current profile keys in the accepted
document. Region boundaries reuse extrusion's exact trimmed-face construction, solely
within the measurement query; no body or extrusion is stored. Shared sketch
curve construction feeds both projection and measurement. OCCT computes all results;
display triangles/polylines never determine the values. Queries use a separate owned
native calculator so background reads cannot cancel or mutate an editing candidate.
There is no additional document owner, acceptance path or Undo step. Errors from a
measurement do not change edit diagnostics or history.

The UI debounces selection, runs only one measurement query at once, and drops replies
whose selection/geometry no longer matches. It never installs the reply's model view.
Unchanged camera/hover updates do not serialize the BRep or rerun the kernel. The
readout and witness overlays dispose with the editor; the native process closes with
the document owner. Native calculation keeps its existing ten-second deadline.
