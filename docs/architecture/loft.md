# Loft

Founder-approved interaction, 2026-10-01. [Architecture index](../architecture.md).

## Ordered sections and preview

In Modeling, select two or more filled sketch regions or planar solid faces in
order, then choose Loft from Tools. Alternatively, clear selection, choose Loft,
and click sections in order. Each section is one region/face; whole sketches,
bodies, edges and nonplanar faces are unavailable. Duplicate sections are ignored
while collecting and rejected by the operation API. Section planes may differ in
position and orientation. No automatic spatial sorting changes the user's order.

A compact local card lists the sections, with up/down, remove and previous/next
alignment controls. Numbered outlines show their order over the preview. Add
sections enables collection; Done adding exits it. Collection picks accepted
source geometry rather than generated preview faces. Clicking an already-used
source can reach another eligible overlapping target. Camera navigation remains
available. The card offers Smooth/Ruled and the existing New/Union/Subtract/Intersect
modes and visible-body target controls. Automatic mode uses the existing sweep
rules: positive-volume overlap defaults to subtraction, attachment to union.

Section edits and mode changes recompute a temporary candidate from original
accepted inputs. A failed calculation preserves the last valid image, identifies
that image as stale and disables acceptance. Removing sections down to fewer than
two clears the displayed candidate. Enter ends collection first; Enter/check then
accepts a valid loft. Escape/cross cancels. Switching tools completes only a valid
loft after collection has ended; an empty/incomplete collection can exit without
an edit. Buttons disable during calculation, with cancel and navigation available.

## Geometry and alignment

OCCT constructs a capped solid through the ordered exact outer boundaries.
Smooth interpolates the sections; Ruled connects successive sections with ruled
surfaces. Lines, arcs, circles and cubic boundaries reach the kernel through the
ordinary source evaluator. Different edge counts use OCCT boundary compatibility.
Source wires are copied before correspondence preparation.

Automatic correspondence establishes consistent orientation and seams. Alignment
arrows advance or retreat one edge on each compatible section boundary; Auto
alignment resets every section. Periodic single-edge boundaries receive quarter
seams before correspondence so circles also permit adjustment. These controls
change correspondence, not section placement or shape; arbitrary continuous seam
placement and tangent/curvature matching to neighboring faces are not included.

Holes require the same count in every section. Normalized hole centers in the
copied section frames determine successive correspondence. Ties or competing
nearest matches reject explicitly. Each matched hole is lofted and subtracted;
holes escaping the outer solid or intersecting one another reject. This is a
conservative matching rule, not a guarantee that every valid arrangement can be
resolved. Guide rails, point terminals and open surface lofts remain outside scope.
Closed BRep validity, positive volume/orientation and self-interference checks run
before publication. The outer and each hole solid are checked during construction.
The final result is checked again after hole subtraction; a loft without holes
retains the already-checked outer solid. Presentation meshes do not define the
solid or its sections.

## Ownership and later editing

The dedicated `Loft` input stores ordered `LiftSource` references, `ruled`, optional
integer `alignment` steps, Boolean mode/targets and UI-visible target eligibility.
`loftInput` evaluates sources; the native calculator constructs geometry;
DocumentOwner accepts one ordinary Undo step. The accepted body stores materialized
BRep and stable document-local topology, with no source dependency or loft recipe.

Moving, editing or deleting source sketches does not regenerate the body. Ordinary
body transforms and applicable face/edge edits operate on its current geometry.
Save/Open stores that geometry. Acceptance applies the existing fully-used sketch
visibility rule; preview, cancellation and failures do not hide sources. Undo/Redo
restores automatic visibility in the same step. Partially-used sketches stay visible.

The typed agent API uses the same operation: `makeshift.loft({sources, ruled:false,
mode:"new"})`. `alignment`, when supplied, has one signed integer seam step per
section. Inputs require 2–256 distinct sections; unsupported source or hole
arrangements fail atomically.
