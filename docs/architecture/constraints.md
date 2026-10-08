# Dimensions, constraints and snapping

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Dimensions, constraints and snapping

Numbers sit beside the edges, radii, distances or angles they describe. Show live
values during dragging; typing edits the active quantity, and Tab cycles relevant
quantities. Position updates must not overwrite unfinished field text. Enter
accepts a valid numeric edit; Escape restores the last accepted value. Invalid
text or unsatisfiable values do not modify geometry or add Undo entries.

Proposed distinction: an unlocked dimension is a measurement and an edit target;
typing changes the geometry once. An explicit local lock makes it a persistent
driving constraint. This prevents every drawing gesture from accidentally fixing
its coordinates and dimensions. Show locks and constraint relationships on the
relevant geometry; do not hide a fully constrained model behind apparently free
drag handles. Numeric blur accepts a valid changed value once; invalid text
reverts on dismissal with a local explanation. Undo discards draft text first
so blur cannot create an extra edit while undoing.

C1 implements explicit length locks for lines and rectangle width/height, and
radius locks for circles/arcs. Purple outlines indicate user numeric constraints;
selection stays blue and hover stays amber. A single selected curve (or rectangle
editing group) shows a lower-left constraint list. Hover
highlights the participating curve; click removes the lock, with Undo. Intact
rectangles' intrinsic shape relationships remain part of rectangle editing and
are not exposed as individually removable constraints in this slice. Their
conversion/remapping controls belong to subsequent geometric/casting tickets.

Required geometric constraints: coincident, horizontal/vertical, parallel,
perpendicular, tangent, concentric, equal, midpoint, symmetry and fixed geometry.
Required quantities: length, distance, angle, radius and diameter. Constraints
are selectable, removable and undoable; diagnosis identifies offending geometry.
An underconstrained sketch is valid. Redundancy/conflict is not silently accepted
because a numerical solver reported success.

Snap to endpoints, midpoints, centers, intersections, nearest positions on edges
and alignment guides; add tangent inference with curved tools. Shift bypasses
geometry snapping. Grid snapping is a separate, initially enabled toolbar toggle:
Shift leaves it enabled, and disabling the grid leaves geometry attraction active.
Pen anchor/handle gestures additionally use Shift for 45° direction locking.
Existing cubic handle edits use the same direction lock; Option/Alt-drag breaks
joined-end tangency while retaining coincidence. See [Pen paths](curve-editing.md#pen-paths).
Pointer rotation snaps to 5° by default and 0.5° with Shift. Move arrows use
one tenth of the grid spacing with Shift; see [transform precision](transforms.md).
Option retains symmetric sizing/creation and Move duplication. Shift-click
selection and Shift-hover inspection retain their meanings outside a captured
geometry gesture.
Use visible screen-space acquisition distances with stable
priority; the cue, preview and accepted location agree. Explicit numeric input
takes precedence over snapping. A snap alone does not create an invisible
persistent constraint. Offer inferred constraints visibly when that behavior is
introduced. Construction curves participate in snapping/constraints but not fills.
