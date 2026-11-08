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
`threshold / 64` and its piecewise-linear physical perimeter. This numerical
approximation was approved by the founder; it is not an analytic Hausdorff-error
certificate for arbitrary BReps. On that mesh, adaptive triangle subdivision
bounds the maximum distance over **entire triangle interiors**, not only vertices.
A sampled nearest-perimeter distance is a lower bound. For any one boundary
segment, the maximum of its distances from a triangle's vertices is an upper
bound on that triangle's distance to the perimeter. A segment BVH accelerates
nearest queries. Unresolved bounds, missing mesh/perimeter data, or exhausted
work reject as uncertain; they never silently count as healthy.

Faces within twice the detection threshold are also considered for **bounded
repair**, regardless of whether they are planar, circular or freeform. They are
not automatically defective: a successful repair must still keep the complete
solid's added and removed material within 0.001 mm. Failed optional repairs retain
above-threshold geometry; mandatory sub-threshold failures reject the edit.
Above-threshold coplanar subdivisions remain explicit. The wider candidate range
is not an increase to the material-change budget or kernel tolerance.
Short nondegenerate edges retain their independent length check; only continuous
curves may merge. Surface-pole edges remain bookkeeping.

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
to prove that removing it cannot add material. Unverifiable repairs still reject;
this does not guarantee that every curved sliver can be healed. In particular,
the segmented conical-shoulder capture is now refused at the edit that creates
its 0.0005 mm shelf. Automatic recovery of that previously accepted capture is
not established: trial reconnection can lead to unrepairable microscopic
transition faces in a subsequent fillet. Keep the accepted document unchanged
on refusal; changing the originating chamfer to leave a meaningful ledge remains
available.

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
