# Explicit solid cleanup

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.

## Automatic microscopic topology repair (2026-11-06)

Solid modeling and STEP-import results pass one shared microscopic-topology gate
before ordinary or deferred presentation. Its broad phase has only two outcomes:
**certified safe** or **inspect**. No bounding-box size, area/perimeter ratio, or
sampled width can clear a face. Complete analytic boundaries can certify convex
straight-sided polygons, disks, nested circular loops and complete cylindrical
bands. The lower bounds include entity tolerances and placement-dependent floating
point error. An additional conservative margin covers the detailed spot check's
half-box convention in every orientation. Unsupported surfaces/trims, concavity,
unresolved holes, and near-threshold values always reach detailed inspection.
This is a no-false-negative bypass for the shared size screen; it does not claim
that OCCT's detailed diagnostics prove all possible local defects of arbitrary
freeform geometry. General BRep/operation validation remains separate and mandatory.

Detailed kernel spot/strip checks identify faces below 0.001 mm for boundary
reconstruction. Short nondegenerate edges still receive their independent length
check; only continuous curves may merge. Surface-pole edges remain bookkeeping.
Faces within twice the detection threshold are also considered for **bounded
repair**, regardless of whether they are planar, circular or freeform. They are
not automatically defective: a successful repair must still keep the complete
solid's added and removed material within 0.001 mm. Failed optional repairs retain
above-threshold geometry; mandatory sub-threshold failures reject the edit.
Above-threshold coplanar subdivisions remain explicit. The wider candidate range
is not an increase to the material-change budget or kernel tolerance.

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
this does not guarantee that every curved sliver can be healed.

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
