# Curved editing and constraint controls

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Agreed curved editing and constraint controls (2026-09-14)

Founder-approved behavior for the next sketch increments:

- A selected standalone straight edge offers two faint bowed guides, one on each
  side. Drag either to convert it into the unique circular arc through its fixed
  endpoints and the mouse point. Collinearity shows the straight state. Click a
  guide to enter radius on that side: new arcs default to minor; existing arcs
  preserve their side and minor/major branch. Radius below half the chord is
  invalid. Numeric editing does not implicitly lock a dimension. Release accepts
  a valid drag; Escape cancels. This replaces a standalone arc drawing gesture.
- Corner rounding starts with two meeting lines/arcs (line–line, line–arc or
  arc–arc). Shorten their finite domains on their existing supporting lines or
  circles and insert a tangent arc. Local radius supports dragging and typing.
  Consuming one original curve pins that arc endpoint to the curve's far endpoint
  and releases its tangency; rounding continues along the other curve. Both
  original curves may disappear even when unequal, leaving one arc between their
  far endpoints. Further radius changes adjust that arc's curvature. Other outline
  edges are neither shortened nor extended. Transfer far-end point attachments.
  After consumption, reselection uses ordinary arc editing; Undo restores supports.
  At a junction,
  explicitly select the pair. Fillet radius editing moves tangency endpoints;
  ordinary bow/radius editing holds arc endpoints fixed.
  Fillet is available directly at a selected two-curve corner, including rectangle
  corners, or for two explicitly selected meeting curves. Show a faint shallow
  fillet arc inside the corner, with a forgiving hit area along the curved stroke.
  Drag that guide to adjust radius or click it to type locally; no idle text button
  or radius field. Showing the guide does not change geometry. It creates
  ordinary trimmed curves and an arc, with tangent/coincident relationships only
  for surviving supports. Candidate circle centers come from intersections of
  offset supports or radius circles around pinned endpoints. Finite-domain and
  traversal checks select the local rounding branch; no sampled geometry or
  rectangle-specific representation defines the result.
  An arc with this unambiguous relationship pattern offers fillet-style radius
  editing after reselection; there is no separate fillet shape or duplicate center.
  Removing the relationships restores ordinary arc editing. The existing support
  intersection defines the zero-radius hard corner. Dragging to zero
  or entering zero extends the surviving supports to that corner, removes the
  fillet arc and its relationships, and joins the recovered endpoints. A radius
  lock on the removed arc disappears with it; Undo restores the entire fillet.
  Zero during initial corner rounding keeps the original corner. Consumed supports
  have no ancestry to recover; their resulting arc retains ordinary arc editing.
  Radius drags use the grid's current spacing when grid snapping is enabled. The validated rewrite accepts on drag release or numeric Enter; a bottom notice
  reports removed relationships and Undo restores them. Surviving support directions and other branches
  of a point-link hub remain intact. Escape or clicking away cancels the draft.
  Multiple relationships added by one rewrite do not use the first-added pair's
  reference anchor; that policy belongs to an individual pair-constraint action.
- Trim highlights the exact removable span between endpoints and actual
  intersections. Nearby points do not cut. A circle with zero or one distinct
  intersection offers whole-circle deletion. New trim endpoints do not
  automatically join cutting geometry. Preserve meaningful surviving constraints;
  report lost relationships in a bottom notice after automatic acceptance, with Undo.
  Never assign an original whole-edge length to each remnant.
- Point disambiguation uses incident-edge diagrams, hover highlighting and
  multiselection; selecting a point colors a gradient along its incident edges.
  Explicit Fuse/Unfuse edits coincidence relationships. Selection alone does not
  create constraints. Drawing attachments now follow the confirmed rule below.
- Offset creates independent geometry, preserving the source. Start with an edge
  or unambiguous closed loop; drag toward a side or enter distance. Sharp joins
  initially. Preview the whole result and reject collapsed/ambiguous results;
  do not silently choose branches. Persistent offset relationships are deferred.
  Closed-loop copies use ordinary lines/arcs with independent IDs and no copied
  source constraints. Positive distance is outward regardless of traversal order.
  Sharp joins intersect adjacent supporting lines/circles; reject distances where
  those supports cannot meet, rather than inserting an unrequested connector.
- Multiple-edge transforms offer plane-axis translation arrows and a rotation
  ring with repositionable pivot. Drag, or click a handle and enter a number.
  Constraints stay authoritative; reject impossible rigid motion visibly rather
  than deforming a requested rigid selection.
- For initial pair-constraint application (including Parallel/Equal Length,
  Coincident, Concentric and Tangent), the first selected entity is the subject
  to adjust; the second selected entity is the reference to preserve.
  Drawing leaves the new edge selected, so drawing then adding an existing edge
  to selection naturally modifies the new edge. Preserve actual selection order;
  sorted IDs or storage order do not establish these roles. This anchoring applies
  only when creating the relationship, not a permanent driver/follower dependency:
  subsequent edits can drive the relationship from either side. Existing locks
  remain authoritative; a conflict must not silently reverse the roles.
- Constraint participation has a distinct geometry color. Only a singly selected
  entity, or a selected pair sharing a constraint, lists it in the lower-left
  Existing constraints section. Hover highlights participants; click removes it
  with Undo. Applicable missing relationships appear in Available constraints;
  adding one moves it to Existing. No floating relationship buttons or removal
  badges. Numeric dimensions and point disambiguation retain their own controls.
  The panel can become hideable later. Selection/hover remain distinguishable
  from participation color. Deliver this inspection/removal path with constraints.

Rectangle-side bowing (A2) uses the same two guides and fixed endpoints. A click
on a side away from its midpoint handle selects that side; midpoint/corner drags
retain rectangle resizing. Bow acceptance removes the rectangle convenience group
and retains ordinary endpoint links and remaining straight-side relationships.
A bowed side's parallel/perpendicular relationship can transfer to the opposite
straight side when that still expresses the same support direction. Incompatible
relationships, including the bowed side's length lock, are removed automatically
on drag release or numeric Enter, with a bottom notice and Undo. Bowing a remaining
straight side also removes incompatible line-only constraints. A selected ordinary
line midpoint shows the same bow guides.
The whole draft remains cancellable; one Undo restores the rectangle and its
original relationships. The resulting arc uses ordinary radius/endpoint editing.
Selected ordinary and rectangle corners offer the local fillet affordance.

Multi-bow direction uses the following precedence. Parallel (including collinear)
selected segments bow in the same physical direction, regardless of endpoint order
or region membership. Otherwise every full selected segment must bound exactly
one closed region; bow directions then match inward/outward relative to each
region, which need not be the same region. Internal dividing edges, partially
bounded edges and open nonparallel selections have no multi-bow guides. Single
edges retain their two guides. Hovering a guide darkens the corresponding guide
and handle on every affected edge before drawing. Direction and eligibility use
the analytic directed region spans, independent of display tessellation.

Dragging any eligible guide or clicking it to enter a radius creates separate arcs
with a shared radius and fixed endpoints. The radius must accommodate every
selected chord; an invalid value changes nothing. Rectangle sides use the same
automatic casting rules.
Reselecting multiple arcs allows another shared-radius edit, preserving each
existing arc's side and minor/major branch during numeric editing. This applies
one edit value, without adding an implicit persistent equal-radius constraint.
Escape restores the whole selection; acceptance creates one Undo step. Where a
bow handle overlaps a translation arrow, the bow handle takes that position;
explicit Move/M hides bow guides and exposes every translation arrow.

Known limitation: reversing a cubic handle into a neighboring tangent cubic can
hit the intersection complexity guard. Dense projected junctions may place that
handle within the endpoint's hit area; use explicit Move/M to move the selected
junction. Handle reversal at that contact still needs a geometry fix.
