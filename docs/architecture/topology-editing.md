# Script topology inspection and support replacement

Scripts can compose edits from current geometry without a named tool for each user
request. `makeshift.topology({body})` reads the current script candidate, including earlier
operations in the same transaction. It returns stable face/edge IDs, analytic support
parameters, face area and conservative world bounds, ordered boundary-loop edge uses,
periodic seam uses and edge-to-face adjacency. No BRep bytes or display indexes escape.

Supports are plane, cylinder, cone or `other`. Other is deliberately unclassified;
it is not a fitted analytic approximation. Edges report lines or circular supports
with trimmed angular intervals in radians; other curves are unclassified. Positions
are world coordinates in mm; face areas are mm². Axial supports include an
`outward` sign (+1 outside wall, -1 cavity wall), independent of axis direction. Loop directions are relative to
the forward support face, with `reversed` on the face giving solid orientation.
A seam is one edge used twice, not two independent boundaries. Surface origins and
axes do not alone describe bounded extents: inspect the loops and their edge geometry.

`makeshift.replaceFace({body, face, surface})` supplies a replacement analytic support:

- Cylinder: `{kind:"cylinder", origin, axis, radius}`.
- Cone: `{kind:"cone", origin, axis, radius, semiAngle}`.

The axis is a unit vector. Radius is measured in the plane perpendicular to that
axis through origin. For a cone, at signed axial distance t, radius is
`radius + t * tan(semiAngle)`, with semiAngle supplied in degrees. Origins can be
anywhere on the same axis, including outside the trimmed wall. Radius at origin
must be positive; zero-angle cones are treated as cylinders. This is a surface
construction recipe, not a stored feature or a taper-specific operation.

## Current replacement domain

The source is one complete cylindrical or conical wall, with two complete circular
rims and one periodic seam. Replacement is coaxial; the two adjoining faces must
be planar and perpendicular to the axis. The kernel computes the new circles at
those stationary planes, constructs the replacement wall, rebuilds adjoining planar
boundaries, and sews the solid. Inner walls, reversed axes, translated/rotated bodies,
stepped sections and planar neighbors with holes use the same path.

Only the selected support changes; neighboring planar faces change their trimmed
boundaries to meet it. The other face supports stay fixed. Face and edge counts must
remain unchanged, with bijective correspondence through sewing; body and topology
IDs continue. Degenerate radii, crossing the cone apex, off-axis replacements,
partial/pierced walls and nonperpendicular/nonplanar neighbors reject. This increment
does not implement arbitrary surface replacement, face splitting/merging, general
NURBS construction, sheet-body insertion or independent face deletion/resewing APIs.

Shared boundary reconstruction validates individual faces, a closed one-shell solid,
positive oriented volume, self-interference and edge correspondence. It does not
silently grow tolerances to accept disconnected boundaries. Four nonrational polynomial rims, including multi-span B-splines,
can reconnect through an algebraic Coons patch before general plate filling;
this preserves the requested boundary curves but does not impose tangent continuity.
It enables local movement of reconstructed cubic faces under the same validity and
identity checks. Calculation runs on
DocumentOwner's temporary script candidate and uses the existing decorator continuation
path; incompatible attachments retain ordinary unresolved-attachment handling.
Success accepts once, failure/cancellation discards the candidate, and one Undo
restores all geometry. Read-only topology scripts and identical supports add no
navigable Undo step. The accepted result remains ordinary editable materialized geometry.

No new manual tool or gesture is introduced. Existing viewport selection, movement,
archive and history routes continue to operate on the result. The API is available
in `makeshift run` so inspection and mutation can compose against one candidate; it is
not part of the nontransactional `makeshift view` interface.
