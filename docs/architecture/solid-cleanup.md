# Explicit solid cleanup

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.

## Automatic microscopic topology repair (2026-11-06)

Solid modeling and STEP-import results pass one shared microscopic-topology gate
before ordinary or deferred presentation. The face criterion is whole-face width:

`width(F) = 2 * max(p in F) min(q in boundary(F)) distance(p, q)`.

The boundary is the union of **all** physical perimeter loops, including holes.
Internal triangulation edges and periodic seams are not perimeter. A narrow local
neck or gap between holes does not make an otherwise wide face degenerate.
Closed faces with no physical perimeter use the same no-collapse result after
coarse mesh validation, without unnecessarily building the detailed mesh.
Faces at or below 0.001 mm require repair; independent short-edge checks remain.
The comparison retains the existing 1e-9 mm roundoff allowance at the threshold.

The cheap screen clears only proven wide interiors. Complete analytic boundaries
can certify convex straight-sided polygons, disks, nested circular loops and
complete cylindrical bands. Their lower bounds include entity tolerances and
placement-dependent floating-point error. For other faces, a coarse mesh proposes
interior locations: a location must be inside the exact trimmed face, and its
exact surface-to-perimeter distance must exceed the candidate radius plus a
numerical margin. A small box, area/perimeter ratio, or failed sample never clears
a face. Unsupported or inconclusive cases go to detailed inspection.

Detailed inspection uses a private triangulation with target linear deflection
`threshold / 64` and its piecewise-linear physical perimeter. For detailed planar
inspection it uses OCCT’s Delabella triangulator to avoid the default
triangulator’s high cost on thin trimmed regions. Coarse witness sampling and
curved faces retain the established mesher; the deflection, interior-width bounds and uncertain-case
refusal are unchanged. This numerical
approximation was approved by the founder; it is not an analytic Hausdorff-error
certificate for arbitrary BReps. On that mesh, adaptive triangle subdivision
bounds the maximum distance over **entire triangle interiors**, not only vertices.
A sampled nearest-perimeter distance is a lower bound. For any one boundary
segment, the maximum of its distances from a triangle's vertices is an upper
bound on that triangle's distance to the perimeter. A segment BVH accelerates
nearest queries. Unresolved bounds, missing mesh/perimeter data, or exhausted
work reject as uncertain; they never silently count as healthy.

Faces within twice the detection threshold are also considered for **bounded
repair** when the face and its incident neighbors have analytic supports (planes,
cylinders, cones, spheres or tori). This optional convenience preserves legacy
near-threshold annular shelves without launching costly speculative freeform
intersections on valid fillet patches. Mandatory sub-threshold repair remains
universal across support types. These above-threshold candidates are
not automatically defective: a successful repair must still keep the complete
solid's added and removed material within 0.001 mm. Failed optional repairs retain
above-threshold geometry; mandatory sub-threshold failures reject the edit.
Above-threshold coplanar subdivisions remain explicit. The wider candidate range
is not an increase to the material-change budget or kernel tolerance.
Short nondegenerate edges retain their independent length check; only continuous
curves may merge. Surface-pole edges remain bookkeeping.

Compatible rectangular spline patches join before destructive face removal. Their
surface degrees, transverse knots and parameter directions are aligned, then their
control nets concatenate across the shared isoparametric boundary. This preserves
the original interiors, including curvature that a perimeter-only fit would lose.
Positive rational control weights provide a whole-patch displacement bound on the
shared-row reconciliation, limited to 1e-7 mm. Straight UV boundaries may themselves
be represented as splines; their control hulls establish the isoparametric condition.
Unsupported trims, incompatible control rows, and periodic patch layouts retain the
ordinary repair/refusal path.

A former patch junction can leave microscopic boundary segments. Joining the next
compatible patch removes that junction, after which degree-two curve pieces can
concatenate without discarding a corner or refitting their geometry. Spatial and
parameter curves use the same piecewise affine parameter intervals; C0 joins remain
C0. Both old edge references continue to the resulting edge. Above-threshold faces
are not proactively concatenated unless they border such a microscopic junction.
Each join checks closed topology and curve/surface agreement; the completed batch
also receives the full solid, orientation, tolerance and self-intersection checks.

Repair operates on a private copy, carries face/edge correspondence, clears stale
measurements and belongs to the originating edit's Undo step. When two boundaries
of a removed face become the unique intersection of the same surviving supports,
both old selections can designate that intersection during input preparation.
The accepted merged edge receives identity through the ordinary correspondence
rules. Fillet/Chamfer also prepare captured/legacy operands through this gate, so a
previously accepted sliver cannot prevent construction before result repair runs.
Feasibility includes repair: an unrepairable result cannot be accepted through
Find Nearest or dragging. Exact typed input is not silently changed. Sketch curves
remain unchanged.

Validation requires valid closed solids, unchanged solid/shell counts, tight
curve/surface agreement and bounded added/removed material. Convex polyhedra use
exact vertex distances to bound the entire solid. Other shapes first check exact
Boolean containment: a contained candidate needs no outward envelope. Only a
non-contained side needs the fixed 0.001 mm outward envelope and its independent
validity/containment checks. This avoids offsetting a disappearing sliver merely
to prove that removing it cannot add material. If that envelope cannot be verified,
a union of rigidly translated source solids provides another conservative cover:
each copy moves no more than 0.001 mm, so their union lies inside the permitted
neighborhood. Exact successful Boolean differences must exhaust the candidate;
a failed or warning-bearing cut contributes no coverage. The proof runs in both
directions and does not enlarge entity tolerances.

The segmented conical-shoulder capture now repairs its 0.0005 mm shelf and accepts
a 0.5 mm fillet. Generated microscopic transition patches join their neighboring
spline patches, preserving the underlying surfaces rather than approximating them
from their perimeter. This does not guarantee reconstruction of every arbitrary
curved sliver: layouts without a verified join or bounded defeaturing still reject
without modifying the accepted document.

Defeaturing uses the kernel’s configured thread pool (serial in the single-thread
WASM runtime). Geometry and material validation remain mandatory after repair.

The general pass does not mutate read-only inspection or Open. Existing recognized
microscopic finishes still heal on Open under the separate finish-simplification
contract; other legacy geometry reaches the shared gate on a subsequent solid edit.
Mesh reconstruction retains its separate fitting/accuracy validation.

## Standalone cleanup only (founder decision, 2026-10-04)

[Issue #11 decision](https://github.com/osuushi/makeshift/issues/11#issuecomment-5980233999):
Clean up is an explicit standalone tool. Modeling operation controls, including
Extrude, Revolve, Boolean, Fillet/Chamfer and face offset, offer ordinary acceptance
and cancellation; they never offer cleanup on completion or schedule availability
probes. Apart from automatic microscopic repair above, ordinary completion
preserves the operation's subdivisions.

Cleanup stays within each body. Joining touching bodies is a separate Union.
Offset's established contact-absorption behavior still merges the contacted faces;
an ordinary offset without absorption does not refine the whole body.

**Clean up selection** previews selected body topology, explicitly selected edges,
and edges incident to selected faces. Unselected face boundaries are protected;
redundant neighboring edge breakpoints at eligible endpoints may also disappear.
Kernel-only periodic seams can reconnect as cylindrical walls merge.
During Cleanup, an edge between faces with different active decorator instance
IDs is protected even when that edge or the whole body is selected. An undecorated
face cannot merge into a decorated face; distinct instances cannot merge even if
settings match. Faces of one instance and undecorated neighbors within their own
regions remain eligible. Unresolved attachments reserve no active face membership.

The native kernel unifies coincident supporting surfaces/curves without approximate
surface fitting or spline concatenation. It validates the solid and volume, returns
face/edge correspondence, and retains body identity. DocumentOwner alone accepts
geometry and owns Undo. Explicit cleanup is a separate step from the preceding
operation; Cancel leaves accepted geometry and selection intact. An unchanged
cleanup result adds no geometry history.

## Compatibility

Existing native/script request flags for acceptance with cleanup and read-only
cleanup checks remain supported. Their operation-local scope covers newly created
or changed faces/edges plus surviving edges of consumed faces, without spreading
through older subdivisions. Decorator boundaries remain protected. These compatible
requests do not expose a modeling completion control or trigger an automatic UI
probe; standalone cleanup is the ordinary application interaction.

## Pre-launch document compatibility

Legacy documents containing sub-resolution topology do not require successful
editing compatibility (founder decision, 2026-11-08). Their operations pass through
the same repair gate as newly created solids. A result may repair the old topology
or refuse explicitly; refusal must preserve the accepted document and Undo/Redo.
Reading and copying section curves does not itself publish a new solid. Tests of
legacy captures enforce these guarantees rather than exact preservation or
reversibility of topology that the current model would no longer accept.

## Deferred boundary consumption (2026-11-08)

Founder-approved post-omnibus direction: consume a disappearing chamfer shelf at
its exact limiting boundary. A typed 3.4999 mm request may resolve to exact 3.5 mm
because the difference is 0.0001 mm (0.1 micron), subject to the existing complete
solid material-change budget and validity checks. This sub-micron normalization
is permitted; it is not the general nearest-feasible-value behavior.

This is not implemented. The segmented-shelf fixture accepts 3.4995 mm but refuses
3.4999 mm: reconstructed curve/surface disagreement was about 3.07692e-5 mm,
above the 1e-6 mm boundary budget. Rebuilding spatial curves removed that mismatch
but left incompatible boundary endpoints. Those experiments were reverted.
Follow up through boundary consumption, preserving preview, acceptance, selection
correspondence and Undo, rather than enlarging entity tolerances.
