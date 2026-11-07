# Explicit solid cleanup

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.

## Automatic microscopic topology repair (2026-11-06)

Solid modeling and STEP-import results pass a shared microscopic-topology check before
ordinary or deferred presentation. Faces classified as spots or narrow strips
within 0.001 mm are removed with boundary reconstruction. Remaining edges shorter
than 0.001 mm can merge along continuous curves; arbitrary short corners are not
dropped. Legitimate degenerate pole edges remain kernel bookkeeping. Ordinary
larger subdivisions still require the explicit Clean up tool below.

Repair operates on a private copy, carries face/edge correspondence, clears stale
measurements and belongs to the originating edit's Undo step. Fillet/Chamfer
feasibility includes repair: when reconnection fails, the size search can back off
to a feasible result without microscopic topology. Other unrepairable candidates
reject without changing accepted geometry. Sketch curves remain unchanged.

Validation requires valid closed solids, unchanged solid/shell counts, tight
curve/surface agreement and bounded added/removed material. Convex polyhedra use
exact vertex distances to bound the entire solid; other shapes require mutually
containing 0.001 mm outward envelopes. Unverifiable envelopes reject. This is a
conservative repair, not a guarantee that every curved sliver can be healed.
The general strip/spot/short-edge pass does not run on read-only inspection or
Open; those bodies pass through it on their next solid edit. Existing recognized
microscopic finishes still heal on Open under the separate finish-simplification
contract. Other microscopic geometry can remain in an untouched legacy body.
Mesh reconstruction retains its separate fitting/accuracy validation and is not
rewritten by this pass.

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
