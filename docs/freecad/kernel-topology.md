# FreeCAD/OCCT kernel audit (pinned source)

Makeshift's [captured subtraction constructor](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/recipe-refresh.md) exposed
a cache/publication counterexample: returning a correct Boolean volume did not
ensure the accepted operation stored the Boolean solid. Independent cavity and
retained-material probes now inspect the stored result. This is Makeshift runtime
evidence, not a change to the pinned upstream findings below.

Scope: `/Users/adacohen/projects/makeshift/.reference/FreeCAD`, revision `78e4038a564e4c8bfebb40119b41d67531232223`. Links are immutable GitHub links to that revision. No source/build/install changes were made.

## Makeshift face-edit helper follow-up

The helper built after Makeshift `a4dac00` resolves six faces from a validated
rectangular capture and source-edge correspondence, not OCCT face enumeration
order. Review required bijective geometric correspondence: distinct source IDs
can still repeat the same edge. Tests now measure exact returned face geometry
and orientation independently of the helper metadata, including located shapes.
See face-edit evidence (historical; `git show 2485a97:docs/evidence/face-edit-handoff.md`) for exact coverage.
This is Makeshift runtime evidence; the upstream inspected revision above is unchanged.
It does not establish naming through arbitrary face splits, Booleans or fillets.

The subsequent Makeshift signed-extrusion helper keeps profile/terminal cap identity
separate from sorted world-height bounds. Both signs and outward face offsets
have focused exact-geometry evidence in [signed extrusion](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/signed-extrusion.md).
Review also distinguished a face's plane from its arbitrary parameter origin:
an adjacent edit can move that origin tangentially while the plane stays fixed.
These are Makeshift implementation lessons; the inspected upstream revision is
unchanged and general support/topology mapping remains unverified.

## Makeshift face-boundary runtime follow-up

The 2026-09-15 boundary selection checks count edge occurrences in exact face
wires, not tessellation edges or distinct adjacent-face counts. Initially Makeshift
passed region-walking circle splits into extrusion, producing artificial
arc-bounded side faces. The circular-edge follow-up rejoins these spans and sends
complete circles as closed kernel edges: one cylindrical wall, with one seam
occurring twice in its wire. Seams remain exact topology but are excluded from
visible/selectable/snappable edges. Native tests in `tests/body-boundary.test.ts`
and `tests/circular-profile.test.ts` cover annuli, a locally generated OCCT
periodic-cylinder fixture, coordinate planes, signed distances and partial
major/minor circular regions. Ordinary UI tests verify complete-rim picking and
seam rejection in Chromium/WebKit/hidden Electron. This is Makeshift runtime evidence, not a new upstream
source inference. Stable edge IDs are assigned after kernel presentation and
face references are regenerated from BRep on archive load.

## Makeshift projection contour follow-up (2026-10-01)

Exact face-wire boundaries omit apparent contours that are not topology edges.
Makeshift now obtains those 3D curves using OCCT 7.9.3 HLR and passes them through the
same analytic/bounded cubic projection conversion as explicit edges. Native tests
in `tests/projection-sources.test.ts` independently check cylindrical side bounds,
a spherical outline with only a periodic seam and degenerate pole edges, collapsed
implicit box edges, trimmed sketch-region spans/holes and both projection directions.
The sphere exposed null spatial curves at the poles: implicit degenerate edges
must be skipped before reading their curves. These are Makeshift runtime observations;
no new claim about the pinned FreeCAD source and no upstream code copying is involved.
The later tilted-cylinder capture exposed another distinction: a side endpoint
lies on the exact rim's interior, but independent whole-rim cubic fitting can miss
it within the permitted approximation budget. That opens the middle cell despite
both rim loops closing. `tests/projection-junctions.test.ts` checks the absent
captured cell, both body/curved-face reprojection paths, exact junction endpoints,
independent silhouette/cell areas and downstream extrusion. Splitting exact rims at
contour contacts before fitting preserves closure without enlarging region tolerance.
These are additional Makeshift runtime findings, not upstream source claims.
Arbitrary freeform contour robustness and large-model HLR performance remain unproven.

## Bounded face-movement experiment (2026-09-16)

`native/kernel/tests/face-move-probe.cpp` runs independently of the application.
Inputs are the current BRep, a selected cylindrical face and a rigid transform;
the test serializes/reloads each fixture before editing. Removing/healing that
face with `BRepAlgoAPI_Defeaturing`, then cutting an extended cylinder derived
from its transformed current surface, succeeds for a through-hole in a flat plate
and a wedge with nonparallel entry/exit planes. No original recipe enters the edit.
The bounding box supplies cutter extent; fixture construction supplies only the
independent expected result. This is specialized hole reconstruction, not a
general selected-surface intersection/retrimming implementation.

macOS/OCCT 7.9.3 runtime: 18 translations (including overlapping positions and
0.0001 mm exterior clearance), four ±10° tilts, and reverse edits after BRep reload
pass. Checks include both directed expected-solid differences, analytic cylinder
radius/axis, stationary planes, single positive-volume solid/shell, BRep validity,
self-interference and translation point occupancy. Six tangency/breakout/outside
requests reject. Face/edge-count guards are fixture-specific and do not prove
general preservation of unshared boundaries or swept-path collision safety.
Multiple cylindrical holes, spheres, arbitrary face sets, topology ID
continuation and editor interaction remain untested. See the README for commands.
No upstream code was copied; these are Makeshift runtime observations.

The rectangular-pocket follow-up (`native/kernel/tests/pocket-move-probe.cpp`)
removes/heals four selected walls and a floor. Their oriented, extended planes
bound a convex cutting region, clipped to a body-derived envelope. An identity
reconstruction must reproduce the original solid before movement is attempted.
The moved planes recut the healed stock; the original recipe and fixture stock
are unavailable to this edit. Full planes were necessary in this experiment:
using the existing trimmed patches as half-space boundaries returned an empty
cutting region on the first flat-pocket fixture.

Runtime: seven translations and two rotations about the floor normal (±30°) on each of flat
and wedge stock pass (18 moves plus 18 reverse edits after BRep reload). Sloping
support retrims the walls while the selected wall/floor planes follow the rigid
transform. Both directed expected-solid differences, analytic plane matching,
point occupancy, BRep validity and self-interference checks pass. Six exterior
boundary/outside requests reject, and the explicit five-face input guard rejects
two incomplete selections. Both native CTests pass together on macOS/OCCT 7.9.3.
This establishes these convex planar pocket cases, not arbitrary multi-face
movement, automatic selection, fillets/nonconvex pockets or production boundary
guards. Counts still supplement fixture comparisons rather than establishing
general preservation of unshared boundaries. No UI or document behavior changed.

The positive-feature and neighbor follow-up (`boss-neighbor-probe.cpp`) shares
the planar test helpers with the pocket experiment. Five selected planes and the
stationary attachment plane bound either the cavity or boss volume. The edit
discovers its single attachment face from shared edges, heals the selected set,
verifies identity reconstruction, then subtracts or fuses the moved region.
Only the current BRep, selected faces, transform and positive/negative mode enter
the edit; stock and primitive recipes remain fixture-side expected-result inputs.

Runtime: 42 allowed translations/rotations and 42 reverse-after-reload edits pass
across flat/wedge bosses and all four boss/pocket neighbor combinations. Each
matches an independently constructed expected solid, with occupancy, selected
planes, validity and self-interference checks. Twelve exact-touch/partial-overlap/
full-overlap requests reject specifically on clearance to protected faces.
Unselected faces other than the attachment face are checked geometrically:
both directed trimmed-face differences must have negligible area. Two negative
controls shrink a neighbor's cap/floor while retaining its plane and face/edge
counts; this stronger preservation check detects both corruptions.
All three native CTests pass on macOS/OCCT 7.9.3 (8.99 seconds in this run).

These are endpoint checks for bounded convex planar features on one attachment
face. They do not establish swept-path collision safety, all tolerance/scale cases,
filleted/nonconvex features, multiple attachment faces, curved neighbors, production
topology correspondence or UI performance. The older hole/pocket probes retain
their fixture guards; the new geometric protection is isolated in the new probe.
No editor integration or broad general face-movement claim follows from this test.

The 2026-09-17 production follow-up (`feature-move-probe.cpp`) calls the actual
application reconstruction rather than a test copy. The planar half-space method
also handles complete triangular and hexagonal patches. A blind round hole/boss
uses the transformed cylinder interior clipped by its transformed planar floor/cap
and the stationary attachment plane. Positive/negative mode still comes from the
healed volume difference; identity reconstruction, untouched trimmed-face checks
and clearance remain required. Untouched planar and cylindrical faces are supported.
Independent expected-solid differences and reverse edits pass for all six shapes;
incomplete selections, boundary/neighbor contact, nonconvex and disconnected patches
reject. Backend tests also preserve face IDs through acceptance, Undo/Redo and
reopening. This is bounded Makeshift runtime evidence, not arbitrary surface movement
or swept-path safety, and no new upstream implementation was copied.

The later same-support extension extracts the healed/current-body Boolean
difference instead of reconstructing convex half-spaces. When a rigid transform
preserves every attachment plane, this carries the exact fillet and nonconvex
boundary with it. The production probe now checks L-shaped, rounded-wall and
toroidal-rim pocket/boss/through features against independent transformed tools,
including reverse edits, missing faces, curved neighbors and contact/overlap.
Opposite-sign features meet only at their support plane: a rounded cutter's
mouth radius, not its largest wall radius, determines that contact test.
Attachment overlap after healing and selected trimmed-face membership are checked;
disconnected extracted volumes reject. The older analytic retrimming path remains.
The founder's rounded-wall capture and toroidal face IDs survive backend reopen
and re-edit; the capture also passes ordinary UI controls in all three runtimes.
These are Makeshift runtime findings, not general freeform/curved-support movement or
new source-derived claims; no upstream code was copied.

The 14:54 shared-cylinder movement capture exposed a separate identity bug:
two distinct selected trimmed walls shared one infinite cylindrical surface.
Surface-only radius/axis matching returned multiple candidates after successful
geometry reconstruction. Movement now distinguishes whole-patch equality from
explicit retrimming and verifies composed healing/Boolean history for stationary
faces. Native `face-matching-probe` cases exercise coplanar, co-cylindrical and
co-spherical patches, partial overlap, enlarged patches, enumeration order,
misleading history and ambiguity rejection. These sphere tests establish matching,
not new spherical-feature movement support. The captured translation and rotation
preserve individual IDs through backend reopen and reverse edits; existing hole
tilt/retrim remains covered. This is Makeshift runtime evidence, not new upstream code.

## Makeshift boundary-reconnection experiment

The 2026-09-17 experiment uses one boundary graph for edge and face selections.
Selected boundaries transform rigidly, complete enclosed faces travel with them,
and immediate neighboring faces reconstruct from the new shared edges. Planar
trimming handles relocated holes/pockets/bosses without changing the outer stock;
two-rim periodic bands use ruled connections and nonplanar single loops use fitted
surfaces. No feature-type classifier or construction history enters this path.
The founder subsequently made this the only movement path on the same date.
The old feature/edge reconstruction and isolated comparison probes were removed;
the preceding movement sections record historical evidence.

Runtime tests cover upper-rim/cap equivalence, axial/sideways round and rectangular
boundaries, tilted caps, single-edge chamfer warping and rigid movement of a saved
and reopened warped face. The same path translates holes/pockets/bosses while
preserving planar stock and rigid-feature volume. Ordinary-input routes pass in
Chromium/WebKit/hidden Electron with histories and archives. Sewing history carries
faces; edge IDs require a bijection checked by lengths and bidirectional sampled
distances. Fitting/sewing tolerance is 1e-6 mm. These are bounded numerical checks,
not certified global surface-error or swept-motion proofs. Tangency and original
interior curvature are not enforced; nonplanar multiply bounded faces outside the
periodic-band case still reject. This is Makeshift runtime evidence, not a new upstream
source inference; no upstream implementation was copied.

Runtime follow-up when removing the comparison path: partial feature selections
and shoulders above the cap can be valid; the earlier blanket rejections no longer
apply. Through-hole wall tilt currently rejects the nonplanar multi-loop attachment,
instead of analytically retrimming it. Ruled spline presentation bounds can be
conservative (control poles extend beyond the surface), so regressions check mesh
positions and exact edge heights rather than equating bounding boxes. For the
radius-8 shoulder, reported volume differs from the analytic value by about
5.1e-6 mm³ on 1964.5 mm³; the UI volume comparison uses 1e-8 relative tolerance,
while coordinate checks remain at 1e-6 mm.

## Makeshift face-offset runtime follow-up

The 2026-09-15 current-body path uses OCCT 7.9.3 `BRepOffset_MakeOffset`, zero
general offset, individual `SetOffsetOnFace` distances, and intersection joins.
This is independent Makeshift runtime evidence in `tests/body-offset.test.ts`, not
new FreeCAD source evidence or a claim of arbitrary surface support.

Planar face +2 mm beside a Ø3 through-hole gives the expected increased plate
volume and unchanged hole radius. A -1 mm material-outward offset of the hole
makes it Ø5 with the independently expected removed volume. The continuing face
IDs survive, including the changed cylindrical face. Cylindrical bosses,
multiple selected faces/bodies, Undo/Redo and archive reopening are also checked.
Cylinder outward radial sign must combine the cylinder coordinate system's
handedness with face orientation: the test hole has a forward face on an indirect
cylinder. Face orientation alone incorrectly treats that hole like a boss.

A radius-collapse guard is necessary: the unguarded kernel returned a valid BRep
with a small positive hole after offsetting past zero radius. A fillet-cylinder-only
probe also returned a valid BRep while moving unselected tangent planes. The
implementation rejects radius collapse and samples continuing unselected supports
against their original surfaces to detect that propagation. Explicitly selecting
the cylinder and its two tangent planes gives the expected result. These checks
are not a proof of general freeform offset feasibility; selected surface support
is currently planes/cylinders, and each affected body must remain one valid solid.

Ordinary UI tests in `tests/ui-face-offset.mjs` cover drawing/extruding a perforated
plate, local planar push/pull, hole diameter entry, multi-face offset, direct drag,
invalid recovery, cancellation/zero, next-selection acceptance, repeat editing,
Undo/Redo, Save/Open and a new sketch on a surviving face in Chromium/WebKit/hidden
Electron. Physical iPad input and Linux/Windows builds remain unverified here.

### Existing blend editing and chamfer direction correction

Subsequent Makeshift runtime checks (`tests/body-blend-resize.test.ts`) use
`BRepAlgoAPI_Defeaturing` on current recognized constant-radius patches, then
`BRepFilletAPI_MakeFillet` on the recovered intersections of their supporting
faces. Convex/concave cylinder strips, a toroidal rim and a sphere with three
meeting strips resize from 2 to 3 mm with fixed continuing supports. Reopening
and resizing again to 2.5 mm works without construction history. Recognition uses
analytic radius and tangent neighboring faces; it is not a guarantee of arbitrary
blend reconstruction. Corner patches without unambiguous correspondence get new IDs.

Conical chamfer faces accept signed normal offsets. The separate planar chamfer
drag bug came from using the plane axis without its handedness. Constructing the
oriented normal from its parameter axes agrees with the oriented triangles and
actual signed face displacement (`tests/body-chamfer.test.ts`). Typed signed
offsets were already correct. Ordinary pointer tests in `tests/ui-blend-edit.mjs`
verify outward drag adds material for planar/conical chamfers and a toroidal
fillet in Chromium, WebKit and hidden Electron. These are Makeshift runtime findings,
not new upstream source claims or general freeform-offset evidence.

### Automatic normal-offset face chains

Makeshift now takes the transitive closure of shared-edge tangent faces using OCCT's
`BRepLib::ContinuityOfFaces` (G1 or better). The same native function supplies
presentation membership and operation selection. This stops at sharp boundaries;
it does not group disconnected faces by approximate normal or curvature.
Normal-offset closure includes support walls; existing-fillet radius groups remain
separate. Native tests check equivalent requests from each member of a rounded
corner, toroidal rim and spherical corner offsets, and curved radius collapse.
`tests/ui-offset-chain.mjs` exercises rounded wall and chamfer strips through
ordinary clicks/drags in Chromium, WebKit and hidden Electron. These are Makeshift
runtime findings, not a general arbitrary-surface feasibility claim.

### Planar contact and topology consumption

Makeshift's stepped-prism reproduction showed why validity alone is insufficient:
the old offset could return a valid BRep with split coplanar seams and, for inward
motion beyond the step, an incorrect unchanged volume. The corrected operation
assigns a contacted parallel face only the travel remaining after contact.
Contact uses the finite translated face, not just plane distance. Same-domain
unification removes coplanar seams while composing immediate operation history.
No construction history is retained or replayed.

`tests/body-offset-contact.test.ts` verifies an L prism becomes a six-face,
twelve-edge box, whose volume keeps changing correctly after contact in both
directions. Rotated successive steps and non-contacting parallel faces are also
checked. Result-face correspondence supplies transient preview highlighting;
merged faces get fresh IDs. Invalid solid orientation/material reversal is rejected,
and the application searches back to verified geometry for failed normal offsets.
Pointer tests cover reversal, achieved numeric distance, Undo and archive reopening.
These are Makeshift runtime findings; they do not establish arbitrary surface-contact
reconstruction or allow accepting invalid kernel results.

## Makeshift edge-fillet runtime follow-up

The 2026-09-15 native fillet path uses OCCT 7.9.3, checks selected edge ownership,
verifies each edge enters a contour, and now discovers required contour edges on
tool entry using `Add(edge)` and the contour API before building geometry. This
supersedes the original rejection of contours beyond the explicit selection.
Native tests verify both Fillet and Chamfer expand a circular rim made from two
tangent arcs and produce the same volume as explicit full-chain selection. Sharp
box edges remain single edges, including in mixed-body selections. Ordinary UI
tests verify straight/arc/straight chain expansion on an extruded rounded sketch
in Chromium/WebKit/hidden Electron. These are Makeshift runtime observations. Results are
validated as one nonempty solid per input body. Modified/generated correspondence
is filtered by topology type; an edge's generated blend face gets a new face ID.

`tests/body-fillet.test.ts` checks convex/concave volume changes, multiple meeting
edges, circular rims, shared multi-body requests, invalid recovery and preserved
identities across Undo/reopen. A 15 mm radius succeeds on a 20 mm square corner;
the 20 mm complete-support-consumption request fails in this kernel. After founder
feedback, Makeshift brackets this failure against verified geometry and returns a legal
size approaching the limit. The same local feasibility path constrains symmetric
chamfers; `tests/body-chamfer.test.ts` checks convex/concave/circular volumes,
shared-body edits, large requests, zero and history. This is a conservative numerical
boundary for the current selection, not proof of a global maximum. These are bounded Makeshift runtime results,
not a general fillet-feasibility guarantee or a new upstream source inference.

## Revolve and constant-pitch helix follow-up

Source observation: FreeCAD's pinned `PartDesign::Helix::execute` constructs a
helical path and sweeps the profile face with OCCT `BRepOffsetAPI_MakePipe` in
Frenet mode. It separately checks orientation and applies tolerance/healing work.
[FeatureHelix.cpp, execute](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/PartDesign/App/FeatureHelix.cpp#L360-L408).
This was API evidence; no upstream implementation was copied.

Makeshift inference: a constant-pitch cylindrical helix's Frenet frame rotates about
its axis at the same angular rate as the path. Preserving the initial radial
section orientation gives the requested screw motion. Zero height instead uses
OCCT's dedicated analytic revolution. Makeshift runtime tests in
`tests/body-revolve.test.ts` check full/partial and signed revolutions, mixed
line/arc profiles, holes, translated/rotated axes, straight cap-edge axes, Boolean
results, independent materialization, history and archive reopening. Helical tests
check positive/negative angles and heights, 450°/720° endpoint section coordinates,
total axial travel, positive oriented tessellation volume and hollow sections.
The founder subsequently required overlapping material and axis-crossing sections
to union; the initial blanket rejection is superseded. Helical sides are OCCT
B-spline sweep approximations,
not polygonal mesh solids; numerical volume tolerances reflect that approximation.
BRep validity and self-intersection checks precede publication. These checks do not
establish arbitrary variable-pitch sweeps or guarantee feasibility for every profile.

Founder-fixture runtime follow-up (2026-09-16): the captured pentagonal section
on the axis failed even at 20° because the original pipe approximation generated
a collapsed, self-intersecting axial side. The new `screw-sweep.cpp` uses
`MakePipeShell` with a more accurate spine/frame approximation, omits only the
faces generated from source edges lying on the axis, and reconstructs the volume
from the remaining boundary faces and explicit caps. Curved edges with both ends
on the axis split analytically before sweeping: otherwise one lateral face can
have overlapping axial boundaries, and the volume builder can silently return
no solid. Every reconstructed section must contain positive solid volume.

`axial-sections.cpp` splits crossing profile faces, including their holes, with
an analytic plane through the axis. Each side sweeps in pieces of at most 180°;
transformed copies at constant pitch union into the result. Holes subtract inside
each piece **before** pieces union, so another turn may fill a swept cavity.
The final solid passes BRep validity, positive orientation and self-intersection
checks. Multiple disjoint solids remain valid output. This is Makeshift runtime work,
not a claim that FreeCAD implements this union policy; no upstream code was copied.

`tests/body-screw-union.test.ts` preserves minimal versions of both captures and
checks independent volumes, signed turns, axial contacts, crossing lines/circles,
overlapping hollow turns and history/reopening. For the R7, radius20, two-turn,
height10 capture, the independent disk-union integral is 27950.1328037 mm³.
OCCT's default volume quadrature reports 27950.1270731; an independent adaptive
integration of the resulting BRep reports 27950.1328031. The regression's 0.01 mm³
allowance covers volume reporting, not acceptance of invalid geometry. Sweeps may
retain valid boundary patch seams; removing these is separate cleanup.

Point-contact audit (founder capture `2026-09-16T03-12-53-056Z-c5e77e06`):
the triangular section at radii 20–30 mm, axial extent -10–10 mm, swept 360°
with total height 20 mm, closes onto itself at (20, 0, 10). Reading the captured
accepted BRep directly gave one solid, 8 vertices, 15 edges and 8 faces.
`BRepCheck_Analyzer` passes and `ArgumentAnalyzer::SelfInterMode` reports no fault.
Nevertheless, the shared contact vertex has **two disconnected surface fans**:
its boundary is not a strict 2-manifold. Every edge still has two face uses, so
an edge-incidence-only manifold check would miss it. Kernel-valid and strictly
manifold must not be treated as synonyms in Makeshift's claims.
A direct native diagnostic both cut and fused an R1 sphere at the contact; both
results passed the same kernel checks. These probes show that the contact need
not prevent later Booleans, not that arbitrary fillets, offsets or downstream
mesh consumers support it. No application behavior changed in this audit.

Cylinder-union follow-up (`2026-09-16T03-17-53-619Z-716ffea4`): the captured
multi-turn thread/cylinder union is one valid solid with one shell, 23 vertices,
44 edges and 23 faces, with no self-interference reported. Every edge has two
face uses; every vertex link, built from oriented wire-corner/edge-end incidences,
is one cycle. The same link diagnostic detects two cycles at the previous
point-contact fixture's pinch. The cylinder union therefore removes the observed
non-manifold contacts; this is direct inspection of the accepted BRep, not merely
inference from its appearance or the kernel validity flag.

## Kernel and App mechanisms

Makeshift's subsequent [cut evaluator and face-history checks](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/cut-evaluation.md)
map complete copied operand face sets onto actual result occurrences. A deleted
tool cap is ordinary history, not a missing-source error. Another failure probe
showed that the center of mass of a holed face can lie in its aperture: two OUT
classifications there do not establish reversed face orientation. The final
checks use explicit semantic normals and known cavity-boundary probes, with no
orientation repair. These are independent Makeshift runtime lessons; the inspected
upstream revisions remain unchanged and general split-face naming remains open.

Makeshift's initial [Boolean helper evidence](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/boolean-kernel.md) adds
independent runtime checks without new upstream source inspection. Matching
volume alone also fails for a pocket: a same-size tool at a block corner removes
the same volume as an interior cap cavity. The corrected fixture uses explicit
placement, retained outer bounds and inside/outside point probes. Empty Boolean
results can be structurally empty compounds; absence of solids alone does not
prove absence of leftover faces or wires. The upstream revision above remains
unchanged, and general face provenance through Boolean operations is still open.

`Part::Feature` is an App document object with a `PropertyPartShape Shape`; it also exposes element-history and related-element queries at the feature layer ([PartFeature.h#L65-L99](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/PartFeature.h#L65-L99)). The kernel value is `TopoShape`, which wraps an OCCT `TopoDS_Shape` with a tag and element-name hasher; `setShape()` can reset the element map ([TopoShape.h#L282-L320](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.h#L282-L320)). A service can use OCCT directly, but must add its own document/revision layer if it wants FreeCAD-like feature identity and dependencies.

Shape comparisons are deliberately different: `isPartner` tests shared topological backing while allowing placement/orientation differences; `isSame` includes placement; `isEqual` includes geometry, placement, and orientation ([TopoShape.pyi#L745-L769](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.pyi#L745-L769)). `hashCode()` is derived from the underlying shape reference and location and ignores orientation ([TopoShape.pyi#L823-L830](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.pyi#L823-L830)). These are useful diagnostics, not durable Face/Edge identity.

Validity is a separate OCCT check. `TopoShape::isValid()` constructs `BRepCheck_Analyzer` ([TopoShape.cpp#L1433-L1446](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.cpp#L1433-L1446)). `fix()` is a separate best-effort operation returning success/failure ([TopoShape.pyi#L780-L820](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.pyi#L780-L820)). Neither defines a product tolerance policy or guarantees future boolean/fillet stability.

## Boolean, fillet, and history behavior

OCCT 7.9.3 source observation: face/face processing computes support intersection
curves, then checks their achieved 3D tolerance against pcurves/surfaces in
[`IntTools_FaceFace::ComputeTolReached3d`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntTools/IntTools_FaceFace.cxx#L523-L543)
and its [deviation-checking loop](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/IntTools/IntTools_FaceFace.cxx#L608-L685).
Thus a curve later discarded by Boolean trimming can already have incurred
expensive approximation and deviation checks. The ordinary
[`BndLib::Add(gp_Torus, ...)`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BndLib/BndLib.cxx#L1560-L1752)
also uses coarse V bands, so subdividing UV intervals does not imply equally tight boxes.
Makeshift inference: after the original box gate, conservative trim-cell exclusion
may avoid unnecessary support work; a cell must retain every possible trimming
boundary, rather than rely on center/corner sampling alone. The opt-in
[native benchmark](../../native/kernel/benchmarks/README.md) separates support
bounds, trim exclusion and isolated per-pair CPU profiling. It remains experimental;
these source observations do not establish general rejection safety or enable a
default Boolean optimization. Standalone Subtract can explicitly opt into the
experimental shared filter; unsupported/uncertain pairs retain exact processing
and invalid/failed experimental results fall back to ordinary OCCT preprocessing.

Simple cut/common/fuse call OCCT wrappers and return a shell-normalized result ([TopoShape.cpp#L1759-L1818](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.cpp#L1759-L1818), [TopoShape.cpp#L1857-L1885](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.cpp#L1857-L1885)). The element-mapped boolean path is more informative: it selects Fuse/Cut/Common/Section, rejects null and invalid inputs, includes analyzer details in invalid-input errors, configures parallelism and fuzzy tolerance, builds, handles cancellation, then records element mapping ([TopoShapeExpansion.cpp#L6046-L6055](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShapeExpansion.cpp#L6046-L6055), [TopoShapeExpansion.cpp#L6227-L6294](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShapeExpansion.cpp#L6227-L6294)). Positive tolerance is fuzzy value; negative requests auto-fuzzy. That policy should be explicit in a service API.

Fillet accepts one radius for all edges or two radii, calls OCCT, and translates `Standard_Failure` into a Part exception ([TopoShapePyImp.cpp#L1258-L1315](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShapePyImp.cpp#L1258-L1315)). A caller must preflight edge ownership and radius feasibility, catch operation errors, validate the resulting shape, and retain the prior revision for rollback. OCCT does not provide a product-level “safe fillet” contract.

Element maps help with generated/modified/deleted history, but are not magic persistence. Shape serialization stores optional map version/hasher data ([PropertyTopoShape.cpp#L370-L410](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/PropertyTopoShape.cpp#L370-L410)). Generated-element tracing walks mapped names and operation tags ([TopoShapeExpansion.cpp#L6302-L6335](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShapeExpansion.cpp#L6302-L6335)). A FaceN reference can still disappear or be replaced after a topology-changing operation. Persist source feature/revision, operation provenance, mapped name, and a geometric/semantic check; never persist only `Face6`.

App transactions record object/property add, delete, and change actions and apply them forward or reverse ([Transactions.h#L55-L93](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Transactions.h#L55-L93), [Transactions.h#L139-L168](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Transactions.h#L139-L168)). This is document undo/redo, not topology conflict resolution or a guarantee that an invalid result can be repaired.

## Tessellation and interchange

`TopoShape.tessellate(tolerance, ...)` returns vertices and triangular facets generated from faces; an optional boolean first cleans the shape ([TopoShapePyImp.cpp#L1738-L1765](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShapePyImp.cpp#L1738-L1765)). Meshes are presentation artifacts and must carry source revision and tolerance. They cannot be authoritative model identity.

BRep persistence writes binary or textual BREP and optional element-map metadata ([PropertyTopoShape.cpp#L389-L410](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/PropertyTopoShape.cpp#L389-L410)). Part registers IGES and STEP import/export handlers in `src/Mod/Part/Init.py#L36-L42`; these formats preserve different subsets of shape, attributes, and history. An interchange service must record units, tolerance, format, and provenance loss.

### Source-level interchange lessons

`TopoShape::importStep` checks read status, transfers roots and combines them with
`OneShape`; `importIges` additionally requests visible entities. These are basic
shape imports, not proof of full document/assembly round-trip preservation.
[TopoShape.cpp L751-L791](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.cpp#L751-L791).

The simplified `exportStep` explicitly disables assembly output and checks both
transfer and write status. It has an OCCT-version-guarded shape-processing
workaround for 7.9+ and comments about header string encoding. This is concrete
evidence that exchanging a shape needs more than calling a writer, and changing
kernel versions can alter required integration. Do not blindly transplant the
workaround: reproduce its necessity against Makeshift's selected version.
[TopoShape.cpp L896-L936](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/TopoShape.cpp#L896-L936).
Full XCAF/assembly metadata and units are outside this first-pass audit.

### Makeshift STEP representation (2026-10-01)

Source observation at configured OCCT 7.9.3 commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`STEPControl_Writer::Transfer` and `WriteStream`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/STEPControl/STEPControl_Writer.cxx#L109-L183)
provide checked shape transfer and stream writing; the
[`DESTEP_Parameters`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/DESTEP/DESTEP_Parameters.hxx#L190-L194)
carry explicit schema, tessellation and output units. The
[`TopoDSToStep_MakeManifoldSolidBrep` solid constructor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopoDSToStep/TopoDSToStep_MakeManifoldSolidBrep.cxx#L111-L163)
can produce a `tessellated_solid` without a manifold BRep link; its
[`TopoDSToStep_MakeTessellatedItem::Init` face conversion](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TopoDSToStep/TopoDSToStep_MakeTessellatedItem.cxx#L112-L175)
uses attached triangulation for a `triangulated_face` without requiring a surface.

Makeshift inference: preserve ordinary solids as exact BReps and carry decorated
bodies as native AP242 meshes, without thousands of manufactured planar CAD faces
or an incorrect nominal-solid alternate representation. Warn about mesh editability
and receiving-app support, with an explicit underlying-exact-solid export choice.
No OCCT implementation was copied; this uses public APIs from the existing pinned
LGPL component. STEP requires the TKDESTEP toolkit and its
[transitive dependencies](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TKDESTEP/EXTERNLIB);
setup disables optional FreeType and Xlib to avoid new system font/X11 requirements.
Independent reader acceptance and its actual runtime results belong in tests and
the active brief; this source observation does not establish target-app compatibility.

### Service implications of implementation details

The mapped Boolean path changes OCCT parallel-thread configuration before build.
Do not infer thread safety from a Python or Rust request boundary. Start with
serialized document mutations and isolated candidate results; measure concurrent
kernel execution separately. Tessellation's optional `BRepTools::Clean` also means
presentation generation may alter cached triangulation on a shape. A mesh worker
must have an explicit ownership/copy policy rather than assuming every geometry
query is read-only.

## Build and test evidence

Part’s CMake module builds `App` and conditionally `Gui` resources ([Part/CMakeLists.txt#L1-L12](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/CMakeLists.txt#L1-L12)). PartDesign installs Python scripts/resources through explicit copy/install targets ([PartDesign/CMakeLists.txt#L105-L143](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/PartDesign/CMakeLists.txt#L105-L143)). `pixi.toml` specifies a coherent environment matrix, including OCCT 7.8 range, Python 3.11 range, Qt 6.8 range, CMake/Ninja, compilers, and platform targets ([pixi.toml#L1-L70](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/pixi.toml#L1-L70)). These are environment constraints, not evidence that an independent service must use FreeCAD’s ABI; it needs its own internally coherent OCCT/toolchain bundle.

These upstream test groups are especially relevant: `testTopoShapeFuse`, `testTopoShapeCommon`, and `testTopoShapeCut` assert element-map sizes after boolean operations ([TopoShapeTest.py#L554-L625](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/parttests/TopoShapeTest.py#L554-L625)); `testTopoShapeMakeFillet` and `testTopoShapeMakeChamfer` exercise mapped edge operations ([TopoShapeTest.py#L731-L745](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/parttests/TopoShapeTest.py#L731-L745)). `testTopoShapeGetElementHistory` checks a Fuse history entry ([TopoShapeTest.py#L846-L856](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/parttests/TopoShapeTest.py#L846-L856)). I did not find `src/Mod/PartDesign/PartDesignTests/TestFillet.py` or `TestBoolean.py` at those paths in this checkout; those paths should be treated as unavailable rather than assumed.

## Recommendation and gaps

### Independent P0b execution, 2026-09-13

The [native proof](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p0b-native-components.md) built OCCT 7.9.3 at
`a016080bf6738d6aeae020badee4e888ad1540a5`, separately from the audited FreeCAD
environment. On Darwin arm64 it used actual PlaneGCS output to construct a
rectangle with a circular hole and a prism, with validity, measured area/volume
and unique circular boundary checks. Default and nondefault fixtures passed.
This is runtime evidence for that integration only, not for all OCCT operations.

Inspected OCCT source reinforces separate validation: `BRepBuilderAPI_MakeFace::Add`
documents conditions on its wires that it does not check
([pinned MakeFace header](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_MakeFace.hxx#L250-L272)).
Makeshift implication: a completed constructor does not prove the selected region's
intent. The proof measures mass properties using exact geometry, not triangulation
([BRepGProp declarations](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.hxx#L125-L203)).
It maps unique edges before counting the two analytic circular boundaries; raw
edge traversal can revisit shared edges. The inner wire is explicitly oriented
as a hole. No general arrangement classifier or topology naming layer is supplied
by this fixture. Open/self-intersecting profiles, captured boundaries, persistence,
clean distribution and failure containment remain explicit coverage gaps.

Use a revisioned domain record above the kernel: model revision, source feature/revision, operation parameters, input subshape provenance, tolerance, output shape comparison, and mesh revision. Keep request inputs/outputs explicit and validate outputs; do not assume the OCCT implementation is internally stateless. An independent service needs persistence, revision and rollback semantics, potentially using OCAF facilities. FreeCAD application-service reuse is a separate feasibility choice. Open gaps include platform-specific OCCT failure rates, performance under remote workloads, and how much FreeCAD-specific element-map machinery would need reimplementation or explicit reuse above a chosen OCCT version. The original FreeCAD audit did not build FreeCAD or run its upstream tests; subsequent independent OCCT execution is recorded above.

### Independent bounded arrangement probe, 2026-09-13

The [region proof](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p0-regions.md) uses pinned OCCT 7.9.3
[`BRepAlgoAPI_Splitter::Build`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_Splitter.hxx)
with a padded support face and input line tools. Runtime checks on Darwin arm64
produced two area-100 cells for the crossing fixture, preserved the area set
under reordered/reversed input, and produced 70/130 after translation and an
off-center crossing. Makeshift owns support construction, exterior exclusion and
source correspondence; these are not an automatic sketch-region service.

Counterexamples shape the boundary: a horizontal line alone has zero cells;
a dangling interior edge must not become boundary provenance; overlapping
sources yield unresolved correspondence. Input-ID and selected-profile checks
reject duplicates, disconnected wires, an open boundary and a bow-tie. The
[`BRepCheck_Wire::Closed` and `SelfIntersect` declarations](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Wire.hxx)
are source evidence; the tracked CLI cases provide runtime evidence for these
specific inputs. Crossing workspace linework remains allowed.

Source intervals are inferred from analytic segment containment, not durable
kernel history. Current cell handles are candidate-local. Curved arrangements,
trim, general tolerances, captured operation history and universal face identity
remain unverified by this line-segment probe.

### Exact shape round-trip probe, 2026-09-13

The [binary BRep proof](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p0-roundtrip.md) independently exercises
OCCT 7.9.3 [`BinTools::Write` and `Read`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BinTools/BinTools.hxx).
A fresh process reloads a box with a cylindrical through-hole and validates
surface area 737.69911184307739 mm², volume 937.1681469282039 mm³, one solid,
one radius-2 cylinder and two unique circular edges. A 32-byte truncated file
is rejected with exit 1; a subsequent valid read succeeds. Writer validation
and reader validation are independent gates. These executed checks establish
bounded exact-shape persistence, not document IDs, dependency repair, undo,
crash-atomic saves or general corrupt-file handling.

### Relocated native candidate, 2026-09-13

The [stage probe](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p0-stage.md) copied the kernel and statically linked
solver proof into a fresh bundle, rewrote only copied Mach-O search paths and
ad-hoc signed those copies. On Darwin arm64, fresh processes ran solver/kernel,
recovery, repeated changes and exact BRep read with development DYLD overrides
unset. Independent loader parsing found 12 OCCT libraries under the relocated
bundle and only Apple system dependencies elsewhere. The all-SDK payload is
110,427,317 bytes; versioned library aliases are duplicated, so this is not a
minimal distribution-size estimate. A relocated host-local launch narrows loader
risk but does not prove clean-machine installation, notarization, resource paths
for unexercised modules, source/relinking compliance or the coding-agent runtime.

### Reusable boundary ownership probe, 2026-09-13

The [P1a adapter proof](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p1a-adapters.md) uses
[`BRepBuilderAPI_Copy(shape, true, false)`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Copy.hxx)
to copy topology and geometry without triangulation. A copied face is checked
as non-partner to its source; changing its placement leaves the source placement
unchanged. Actual solved values feed a translated area-360 region and depth-7
prism with volume 2520. Unresolved source provenance cannot be captured by this
adapter. This establishes a bounded ownership mechanism, not immutable document
history or safety of every future OCCT mutating operation.

### Restore comparison review, 2026-09-13

The P1c review distinguishes an empty Boolean difference from a failed Boolean
operation. A rejected draft returned a null shape on `HasErrors()` and later
treated null as zero volume. That control flow cannot establish equivalence.
The corrected comparison checks completion and errors before interpreting the
result, then checks result validity and finite absolute difference volume.
Fresh-process and malformed-solid acceptance is recorded separately in the
[P1c report](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p1c-restore.md); source availability is not that evidence.

In OCCT 7.9.3, `IsDone()` is inherited through
[`BRepAlgoAPI_Algo`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_Algo.hxx),
[`BRepBuilderAPI_MakeShape`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_MakeShape.hxx)
and [`BRepBuilderAPI_Command::IsDone`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Command.hxx).
An audit that searched only the immediate Boolean headers incorrectly reported
it unavailable. Follow the inheritance chain before declaring an API absent.
[`BRepAlgoAPI_BuilderAlgo::SetNonDestructive`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BuilderAlgo.hxx)
documents that argument shapes are not modified in that mode; Makeshift also uses
copied operands in this bounded comparison. These facts do not make Boolean
equivalence a general durable topology identity scheme.

### Independent presentation query, 2026-09-13

Makeshift now meshes copied operation solids and current planar cells through a separate
`Document::presentation()` query. The inspected OCCT revision remains
`a016080bf6738d6aeae020badee4e888ad1540a5`.
[`BRepMesh_IncrementalMesh`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepMesh/BRepMesh_IncrementalMesh.hxx)
and [`BRep_Tool::Triangulation`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRep/BRep_Tool.hxx)
provide the native mesh and its location. Makeshift applies the location transform,
corrects reversed-face winding and tags meshes by document/session/revision/owner.
It does not persist triangle identity or derived meshes in document history.

Manager runtime checks on Darwin arm64 cover a translated30×12×7 prism with signed
mesh volume2520, crossing cells that preserve that solid, and an origin4×3×2 box
placed with a nonidentity TopLoc_Location at(-11,23,7), yielding shifted bounds
and signed volume24. Repeated presentation leaves revision/history/archive bytes
unchanged. This distinguishes transformed geometry from merely constructing a
rectangle at nonzero coordinates. Fixed deflection0.1mm/angular0.5rad is a proof
setting; curved-model quality, performance and generalized picking remain gaps.

### Framed exact geometry and orientation

Makeshift runtime work at commit `f6f45dc` adds a local/world rectangular-prism
adapter using the same OCCT 7.9.3 revision above; no additional upstream source
inspection is claimed. Copy/transform history identifies corresponding faces,
but the adapter resolves the occurrence in the returned solid to retain its
orientation. An initial normal check using absolute dot product would have
accepted an inward face. The tightened scenario measures signed outward normals
and checks published center/normal metadata against the BRep.

Manager-run frame and framed-prism tests pass for translated, bottom, vertical
side and rotated planes, including negative depth. Canonical point and shape
transforms share one rigid matrix; independently normalizing slightly skewed
basis vectors could otherwise make their conversions disagree. These are bounded
Makeshift findings, not universal topology naming or face-support persistence.
See `git show 3a4615641204f3a90683c590f52bfe3f81b29f87:docs/evidence/plane-frame.md` for commands and remaining integration gaps.

### Workspace integration review

The subsequent Makeshift origin-workspace integration separates plane-local captured
boundaries from world-space solids and presentation. This adds no upstream
source claim; the inspected OCCT revision remains the one recorded above.
Candidate evaluation and archive reconstruction must resolve the frame in the
snapshot being evaluated, rather than borrowing live client selection or a
default XY frame. Equal positive volume cannot detect a translated stored solid.
The bounded corruption probe therefore translates a valid solid while leaving
its local capture unchanged, independently in current, undo and redo history.

Another counterexample is identity in presentation: arrangement cell IDs can
repeat across planes. Mesh ownership must include the workspace, even when
operation IDs are document-wide. See
[origin workspace evidence](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/origin-workspaces.md) for verification
status and limits; face-supported workspaces and general topology remain open.

The next [face-support resolver proof](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/face-workspace-resolver.md)
uses a document-local operation/capture/semantic-face reference to derive the
current frame through a candidate dependency graph. Nested-support and cycle
probes exercise that boundary before public command or archive integration.
Incoming pick revision validation remains distinct from the stored attachment's
lifetime. This adds Makeshift implementation evidence only; the inspected upstream
revisions and general topology coverage remain unchanged.

### Pocket result mapping and editing probes

Makeshift commits `9bfea8c`, `ca935a4` and `cf85a95` add bounded runtime evidence
for planar Boolean result faces and cut-owned offsets using the same pinned
OCCT revision above. This is independent implementation evidence, not a new
FreeCAD source audit. Actual result occurrences supply orientation; operand
provenance supplies semantic keys. A source face splitting into multiple result
faces is rejected by this mapper rather than assigned an arbitrary occurrence.

A triangulated interior point is useful for placing a control but unsuitable as
the origin of a persistent sketch frame: remeshing can move it. The mapper
instead projects the source frame origin onto the result plane. The remesh probe
must rebind its face records to the copied solid; merely replacing a separate
solid field would leave the tested records unchanged.

Another failure probe distinguishes a deleted tool start face from an actual
collapsing offset. Rejecting a deleted key cannot demonstrate collapse handling.
The corrected floor test applies the full depth toward the opposing plane and
checks the specific collapse diagnostic while preserving accepted state.
See [mapped faces](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/cut-result-faces.md) and
[cut offsets](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/cut-face-offset.md). These helpers do not establish
general Boolean topology stability, cut-face sketch support, or UI usability.

The subsequent [staged refresh probe](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/supported-operation-refresh.md)
demonstrates why unchanged volume is insufficient for dependent geometry: moving
a producer shifts two attached solids while both retain volume 20 mm³. Replacement
solids are staged before assignment; a later collapsing operation leaves the
earlier cached bounds unchanged. This is independent Makeshift runtime evidence with
the same OCCT revision, not a new upstream finding. Public command and persistence
integration remain separate checks.

### Pocket interaction follow-through

Makeshift commits `32c6e7b`, `7d86b9c` and `d8544aa` connect mapped result faces to
spatial editing and used-profile visibility. This is Makeshift implementation
evidence using the previously recorded native dependencies, not a new upstream
source audit. Cavity depth has an explicit inverse relationship to signed
outward face motion; translating a floor guide must use that same relationship
as the committed offset.

The ordinary WebKit probe exposed a distinction that geometry tests missed:
an unchanged sketch region above the pocket can intercept a floor click even
when the floor is visible and its semantic map is valid. The renderer now
matches complete workspace-qualified capture boundaries to current regions,
including source versions and parameter spans, and hides matching profiles in
3D. Planar mode restores them. Remembered cell IDs alone would conflate distinct
workspaces and would not survive normal region regeneration reliably.
See [renderer integration evidence](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/pocket-renderer-integration.md)
for actual runtime coverage and remaining limits.

## Makeshift curved closure follow-up (2026-09-14)

Founder review exposed a display/model boundary error: polygonizing a circle
before region detection disconnected line endpoints snapped to the actual circle.
Makeshift now constructs directed analytic curve spans and finds closed boundaries
before tessellation. The circle/line wedge regression verifies independent analytic
areas, rotated non-quadrant joins and real gaps; ordinary UI tests check visible
fill through zoom and Delete/Undo. This is Makeshift implementation evidence, with
upstream revision unchanged and no upstream code copied. It does not establish
arc-tool editing, selectable holes or use as kernel operation boundaries.

## Makeshift arc-domain follow-up (2026-09-14)

No new upstream source was copied or inspected; the recorded FreeCAD revision
is unchanged. Makeshift's standalone arcs now use endpoints plus signed bulge as
independent geometry. The existing analytic boundary walker accepts their bounded
angular domains; circle intersections are filtered to those domains before
forming regions. Display sampling remains downstream. Independent tests cover
minor/major arcs on both sides, reverse traversal, area and excluded portions of
the supporting circle. Ordinary Chromium/WebKit/hidden Electron input verifies
arc/line fill, editing and Undo. Curved constraints and trim rewriting remain
unimplemented; this is geometry/interaction evidence, not a PlaneGCS arc proof.

## Makeshift interactive kernel scheduling follow-up (2026-09-16)

OCCT parallelism does not require concurrent application-document edits or TBB.
Source observation at pinned OCCT `a016080bf6738d6aeae020badee4e888ad1540a5`:
[`OSD_Parallel::ToUseOcctThreads`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_Parallel.cxx#L176-L188)
defaults to OCCT threads without TBB;
[`BRepAlgoAPI_BuilderAlgo::IntersectShapes/BuildResult`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BuilderAlgo.cxx#L120-L141)
forwards the operation's parallel flag to its filler/builder. Makeshift inference:
keep one calculator request active while parallelizing work inside that request.
Actual runtime verification and the repeatable synthetic benchmark are recorded in
[the native calculator README](../../native/kernel/README.md#interactive-performance).
This is not evidence that every OCCT operation scales with core count.

## Explicit scoped cleanup (2026-09-16)

Source observation in the pinned OCCT 7.9.3 headers (commit
`a016080bf6738d6aeae020badee4e888ad1540a5`):
[`ShapeUpgrade_UnifySameDomain` constructor and `KeepShape`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ShapeUpgrade/ShapeUpgrade_UnifySameDomain.hxx#L91-L129)
allow separate face/edge unification and protection of edges against face merging,
and vertices against edge concatenation. `SetSafeInputMode` and `History` support
non-mutating input and correspondence. No upstream implementation was copied;
Makeshift calls the existing LGPL component through its public API.

Makeshift inference: bound optional cleanup with protected face boundaries and remote
vertices, rather than refining an entire body after each edit. Actual native
regressions verify whole/partial box cleanup, cylindrical ribs, body separation,
volume, identities, Undo, no-op history and preservation of older extrusion ribs.
A runtime mismatch showed that protecting hidden periodic seams also prevents
cylindrical wall merging: those kernel seams must be allowed to reconnect. Another
showed that protecting every adjacent vertex leaves spurious collinear edge pieces
after face merging; only endpoints touching eligible edges may be concatenated.
This is same-domain simplification, not general repair or approximate fitting.

## Extrusion draft: offset contours and general-curve sweeps

Source observation at the configured OCCT 7.9.3 commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepOffsetAPI_DraftAngle::Add`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_DraftAngle.hxx#L83-L130)
treats planar/cylindrical/conical faces and warns against topology changes.
[`BRepOffsetAPI_MakeOffset`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_MakeOffset.hxx#L40-L104)
offers intersection joins for parallel contours;
[`BRepOffsetAPI_MakeDraft`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_MakeDraft.hxx#L36-L89)
sweeps draft to a stopping surface. Its underlying implementation sets a 1e-4
surface tolerance and sews at five times that tolerance
([initialization](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepFill/BRepFill_Draft.cxx#L282-L290),
[sewing](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepFill/BRepFill_Draft.cxx#L819-L845)).
FreeCAD's pinned
[`ExtrusionHelper::makeElementDraft`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Part/App/ExtrusionHelper.cpp#L574-L723)
provides another offset/ruled-loft precedent; it is evidence, not copied code.

Makeshift inference: use a true lateral offset rather than scaling about a centroid.
Offset outer and hole boundaries in opposite directions, validate end-section
nesting and nonzero area, and reject collisions. Straight/circular boundaries use
parallel contours and ruled solids; cubic/general boundaries use the draft sweep.
No upstream implementation was copied. Existing OCCT linking/licensing applies.

Runtime verification: an initial DraftAngle experiment returned a solid after
an inward circle draft passed its apex, so kernel completion alone was inadequate.
The delivered offset-contour path rejects that case. Native tests cover square
volume, circular annuli, hole closure/wall collision, angle/offset equivalence,
either length sign, cubic end offsets and automatic Union with Undo. General
curves retain the kernel approximation tolerances above; arbitrary self-intersecting
or topology-changing drafts are not promised.

### Twisted sections and cubic parameterization (2026-09-21)

Source observation at the same pinned OCCT commit: the
[`ThruSections` compatibility pass](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_ThruSections.cxx#L370-L390)
chooses wire origins/orientations to avoid twisting. Its
[curve preparation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_ThruSections.cxx#L1106-L1137)
converts trimmed curves to B-splines and normalizes their parameters.
[`Approx_CurvilinearParameter`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Approx/Approx_CurvilinearParameter.hxx#L22-L74)
offers approximate arc-length parameterization and reports its maximum 3D error.

Makeshift inference: disable compatibility optimization for intentional twisting,
align offset-wire edges before rotation, and reparameterize general drafted
sections to reduce artificial correspondence changes along the loft. Exact
Bézier-to-B-spline conversion is not the source of draft approximation; the
offset/sweep and reparameterization are. No upstream code was copied.

Runtime verification: rigidly rotated cubic sections passed, but drafted cubics
failed a 1e-6 mm loft sampling check despite errors of only a few microns in
initial experiments. With the founder's 0.001 mm curved-tool target, a 0.0005 mm
loft sampling allowance passes the cubic arch with either draft sign. A separate
cap-displacement assertion checks 0.001 mm agreement. This is sampled evidence,
not a universal bound; solid validity and self-interference checks still apply.
The drawn-cubic interaction passes Chromium/WebKit and hidden Electron.

The kernel can also emit untranslated French exceptions: for example,
[`BRepLProp::Continuity`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLProp/BRepLProp.cxx#L52-L58)
throws `Courbes non jointives` when the evaluated endpoints differ beyond its
tolerance. Makeshift translates that message to “The operation could not join the
curves within tolerance.” at the native boundary and preserves the raw diagnostic
on stderr. The founder's screenshot establishes the displayed exception, not
which kernel call or model caused it; reproducing that geometry needs a captured fixture.

## Closed-solid deletion (2026-09-17)

Source observation at configured OCCT 7.9.3 commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepAlgoAPI_Defeaturing` input contract and `AddFaceToRemove`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_Defeaturing.hxx#L27-L126)
accept solid inputs and face removals, build a new shape, and expose history and
warnings. Faces absent from the input are ignored by OCCT. Makeshift therefore resolves
all selected IDs before calculation and rejects warnings or any surviving selected
face. No upstream implementation was copied; this calls the existing LGPL component.

Makeshift runtime checks restore box geometry after hole/pocket/boss and fillet/chamfer
removal, comparing both Boolean differences against an independently saved stock.
Scoped same-domain edge removal preserves volume; a sharp edge or a partially
removable edge set rejects atomically. Mixed face/rim removal, multi-body failure,
cancellation, history, identity and reopened face offset are covered. This is
bounded feature healing, not arbitrary face removal or approximate surface fitting.

## Shell: completion is not validity (2026-09-17)

Source observation at configured OCCT 7.9.3 commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`MakeThickSolidByJoin`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_MakeThickSolid.hxx#L63-L118)
supports selected opening faces and signed thickness; the global intersection
option is incomplete and the self-intersection-removal option is unimplemented.
[`MakeOffsetShape` warnings](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_MakeOffsetShape.hxx#L62-L105)
explicitly include self-intersections and inverted offset surfaces.
[`BRepOffset_MakeOffset::MakeThickSolid`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_MakeOffset.cxx#L1083-L1175)
assembles the wall from both skins only when closing faces are supplied. Empty
opening selection therefore needs a distinct closed-hollow construction.
[`BOPAlgo_ArgumentAnalyzer::TestSelfInterferences`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_ArgumentAnalyzer.cxx#L340-L390)
uses the Boolean self-interference checker independently of BRep validity.

Makeshift inference: use arc joins for the surface distance envelope, a checked Boolean
difference for closed hollows, and independent validity, orientation, collision,
containment, opening and offset-correspondence checks before accepting. Keep strict
requested thickness and atomic failure. Unsupported freeform verification must
reject instead of pretending the kernel's success flag establishes validity.
No upstream implementation was copied; this uses the existing LGPL OCCT component.

Makeshift runtime evidence: box/cylinder/concave/filleted examples, multiple and adjacent
openings, spherical/toroidal closed hollows and through-hole collisions are exercised
in `tests/body-shell-geometry.test.ts`; lifecycle tests cover IDs, atomic rejection,
Undo/Redo and reopened ordinary edits. Rounded outward box joins carry 1.1e-6 mm
vertex tolerances even with 1e-7 mm construction tolerance. Makeshift bounds topology
at 2e-6 mm separately from 1e-6 mm geometric checks. These bounded numerical tests
do not certify arbitrary offsets; the current contract is
[Shell](../architecture/shell.md), including rejection of unverified freeform offsets.

Cylindrical spline capture follow-up: the pinned public APIs
[`GeomConvert_SurfToAnaSurf::ConvertToAnalytical` and `Gap`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomConvert/GeomConvert_SurfToAnaSurf.hxx#L32-L70)
and [`GeomConvert_CurveToAnaCurve::ConvertToAnalytical`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomConvert/GeomConvert_CurveToAnaCurve.hxx#L52-L64)
provide tolerance-bounded analytic recognition, not a proof of exact equivalence.
[`BRepTools_Modifier::ModifiedShape`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.lxx#L24-L31)
returns its local map entry; the
[`Rebuild` orientation assignment](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.cxx#L605-L614)
is not the cumulative orientation within the solid. Makeshift therefore gets mapped
face orientations from the rebuilt solid before checking signed offsets.

Runtime evidence: the founder's two fillet supports recognize as cylinders with
reported gaps below 2e-13 mm. Raw spline offsets exceed the topology tolerance;
converting only the surfaces still leaves inaccurate spline boundaries. Converting
verified line/circle boundaries as well makes ±1/±4 mm open and closed shells pass
the unchanged validation. Recognition uses 1e-7 mm; sampled support checks, endpoint
checks, exact BRep checks and both Boolean differences supplement it. The captured
regression checks independent prism volume formulas, radius offsets, either/both
cap openings, rigidly transformed input, rejection and document lifecycle.

No OCCT source was copied. These are public API calls linked to the existing pinned
OCCT distribution under its existing LGPL component obligations; no new library or
vendored implementation is introduced. Genuine freeform offset verification remains
out of scope.

## Shell correspondence performance (2026-09-17)

Source observation: pinned OCCT 7.9.3's
[`Geom_OffsetSurface::Surface()`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_OffsetSurface.cxx#L782-L935)
constructs equivalent plane/cylinder/cone/sphere/torus surfaces where supported,
including orientation handling, and returns null when unavailable. Its
[API contract](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_OffsetSurface.hxx#L350-L354)
explicitly describes an equivalent surface.

Makeshift inference: offset correspondence can project onto that exact equivalent
instead of the generic offset wrapper, retaining the same samples and tolerance
and falling back to the wrapper when no equivalent exists. This avoids unnecessary
numerical projection; it is not fitted approximation or weaker validation.
Makeshift implementation uses the library API; no upstream code was copied.
Runtime checks and measured timings belong in test results and the local brief.

## Circular twist representation (2026-10-03)

Source observation at configured OCCT commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepOffsetAPI_ThruSections::EdgeToBSpline`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_ThruSections.cxx#L1064-L1134)
tries a `GeomConvert_ApproxCurve` fit for conics with degree limit 14 before
falling back to rational conversion. Its
[`TotalSurf`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_ThruSections.cxx#L1253-L1286)
constructs the loft from these prepared section splines. Existing public
[`BRepBuilderAPI_NurbsConvert::Perform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_NurbsConvert.cxx#L47-L54)
uses [`BRepTools_NurbsConvertModification::NewCurve`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_NurbsConvertModification.cxx#L420-L478)
to supply rational geometry before that conic-only branch. No upstream code was
copied; these APIs belong to the already linked OCCT component.

Makeshift inference: full circular sections can move their centers around an
off-center twist axis while keeping their own seam orientation fixed. Their own
spin does not change the section geometry. Supply exact rational circles to the
smooth loft, retaining independent analytic mid-station samples and unchanged
solid/interference checks. Centered circles/concentric circular boundaries use
ordinary extrusion/draft. Rational quadratic rim recognition supplies a
circle descriptor after per-knot-span radial/planar checks at 1e-8 mm; it changes
neither accepted BRep curves nor their tolerances.

Runtime observation on a fresh 10 mm-radius, 20 mm-deep circle twisted 90° around
an axis displaced 5 mm: loft/accuracy/solid checks took roughly 40 ms, but two
span-based volume calls accounted for almost all of a 35-second round trip.
Fixed seams alone still took about 32 seconds. Rational sections reduced the
round trip to about 2.9 seconds; profiling separates roughly 1 ms bounds queries
from roughly 1.43-second integration calls. The result retains one periodic wall
and two caps, with fewer display triangles. This establishes a representation
bottleneck for the repro, not that volume integration is generally fast or that
all circular sweeps are instantaneous. Native checks cover signed/multiple turns,
draft, independent mid-height mesh sections, history, archive regeneration and
subsequent cap extrusion.

## Sweep validation performance (2026-09-21)

Source observation at the same pinned OCCT commit: [`BRepExtrema_ExtPF::Initialize/Perform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepExtrema/BRepExtrema_ExtPF.cxx#L41-L108)
separates surface-extrema initialization from point queries and classifies solutions
against the trimmed face. Its internal extrema retains the surface adaptor's address.
[`BOPAlgo_ArgumentAnalyzer::TestSelfInterferences`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_ArgumentAnalyzer.cxx#L340-L371)
forwards the parallel setting to its non-destructive self-interference checker.

Makeshift inference: keep one stable-address query per loft face, accept a sample only
when a classified face point is within the existing section tolerance, and retain
the general shape-distance fallback for edge/corner or unsuccessful projections.
This retains every sampling station; it is not a reduction of the accuracy target.
Use the configured OCCT thread pool for sweep self-interference checks. An unchanged
outer twist solid needs that check once; subtracting holes requires a new final check.
No upstream code was copied; these public APIs use the existing LGPL OCCT component.
Focused native checks compare against the original distance query at face/edge/corner,
interior, trimmed-hole, located-face and spline-surface samples. Benchmark results and
remaining preview limitations are recorded in the kernel README.

## Cylindrical boundary reconnection (2026-09-19)

Source observation at the configured OCCT 7.9.3 commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`GeomProjLib::Curve2d`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomProjLib/GeomProjLib.hxx)
projects a spatial curve onto a surface over its parameter interval and reports
approximation tolerance; a failed projection returns a null handle. This public
API is already used by Makeshift's cylindrical Shell preparation.

Makeshift inference: if moved boundaries still lie on an existing cylinder, retain
that support instead of attempting a generic surface fill. Preserve each original
periodic parameter branch, including both occurrences of the seam. Check spatial/
parameter correspondence, resulting topology tolerances and the existing solid
validation/correspondence rules. This is a bounded numerical check, not a global
surface-fitting certificate. No upstream implementation is copied.

The captured flange regression uses the current exact BRep, without thread or
flange feature history. It checks axial extension, fixed thread faces, independent
cylindrical added volume, reversal after reopening and rigidly rotated placement.

## Tangential periodic subtraction (2026-09-20)

Source observation at pinned OCCT `a016080bf6738d6aeae020badee4e888ad1540a5`:
[`ShapeUpgrade_ClosedFaceDivide::SplitSurface`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/ShapeUpgrade/ShapeUpgrade_ClosedFaceDivide.cxx#L210-L261)
partitions a closed face's parameter domain and records substitutions in a shared
reshape context. The public
[`BRepLib_CheckCurveOnSurface`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib_CheckCurveOnSurface.hxx)
checks the maximum distance between a SameParameter edge and its face representation.
[`BRepTools_Modifier::ModifiedShape`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepTools/BRepTools_Modifier.lxx#L24-L31)
requires membership in its map; tool-side origins must bypass a target-body copy map.

Makeshift inference: after a failed subtraction yields invalid cylindrical faces,
partition only their corresponding source cylinders and rebuild the cut once.
Operate on a deep copy, carry copy/division/Boolean correspondence, and validate
source volume and precision before reuse. New split edges initialized with a
looser tolerance must pass the full curve/surface distance check at source precision
before their tolerance is reduced; ordinary BRep validation then checks the prepared
operand and final result. Additional cylindrical subdivisions can remain. This is
bounded Boolean preparation, not general shape healing or an increased fuzzy tolerance.

Runtime evidence: the captured opposite-direction hole, tangent to the lower fillet
boundary, produces open periodic parameter-space wires with the unprepared cut.
Partitioning the implicated cylinder makes the requested cut succeed. Regression
checks exercise retained material and empty-hole probes, lengths, source identity,
standalone subtraction, translated/reversed placement, preview/Undo/archive and
subsequent edits. Adaptive volume integration is used for preparation checks because
ordinary non-adaptive volume integration changes slightly when a trimmed face is
partitioned. No upstream code was copied; existing OCCT linking/licensing applies.

## Swept spline Shell preparation (2026-09-22)

Captured Face Offset follow-up: OCCT's pinned
[`BRepLib::BuildCurve3d`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib.cxx#L295-L440)
keeps an existing spatial curve, or reconstructs one from a pcurve when absent.
Makeshift inference: a coarse generated intersection curve can be rebuilt from its
accurate pcurve, then checked independently against every incident surface and
endpoint. This uses the public API; no upstream implementation was copied.
Runtime verification on the captured hollow bend: sharp intersection offsets of
the inner chain at -1/+0.5/+1/+2/+7.5 mm preserve the outer wall; outer offsets
at -0.5/+0.2 mm preserve the inner wall. Independent material probes through the
legs and bend pass. Whole-solid comparison Booleans on coincident spline walls
produced invalid comparison BReps, so Offset uses complete face correspondence,
signed support/orientation, separation and strict solid checks. Shell retains its
existing containment checks. These are numerical validations, not a guarantee for
arbitrary freeform bodies.

Source observation at the same pinned OCCT commit: [`BRepLib::SameParameter`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib.hxx#L159-L199)
recomputes boundary pcurves against existing spatial curves; its forced shape form
also processes edges already marked SameParameter. [`BRepBuilderAPI_Copy`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Copy.hxx#L40-L69)
can deep-copy geometry independently of triangulation. [`Geom_OffsetSurface`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_OffsetSurface.hxx)
represents normal-distance offsets of regular supports; its existence alone does
not establish a valid non-self-intersecting solid.

Makeshift inference: recompute spline boundary correspondence on a deep copy at the
existing construction precision, then require the unchanged strict solid checks.
Use cumulative face orientations from the copied solid. Validate generic offsets
against the signed offset support across C2 spans and check sampled normal
regularity/orientation, in addition to existing whole-skin separation, containment,
opening, preserved-face and self-interference checks. No upstream code is copied;
these are public APIs of the existing linked OCCT component.

Runtime observation: the captured bend is genuinely non-analytic at 1e-7 mm.
Two source boundaries have 3.05e-5/4.85e-5 mm parameter correspondence error;
recomputation reduces these below 5.5e-8 mm, without spatial refitting. Both-open
-1/+1 mm results pass unchanged tolerances and independent solid-intersection
probes through the legs and bend. Inward closed/one opposite-cap variants still
fail BRep boundary validation after preparation; they remain explicit rejections.
These numerical checks do not certify every freeform offset or guarantee every
feasible opening set. Immediate verification context belongs in the local brief.

## Plane-cut volume integration (2026-09-22)

Source observation at pinned OCCT `a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepGProp::VolumePropertiesGK`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L430-L726)
provides spline-span integration and point/plane reference variants, returning
an estimated relative volume error. The face integrator
[`BRepGProp_VinertGK::PrivatePerform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L350-L502)
integrates parameter spans with nested adaptive quadrature. These are inspected
public APIs/implementation, not copied code.

Makeshift runtime observation: ordinary adaptive integration reports the captured
hollow bend as 8131.907774 mm³, while span integration reports 8132.078228 mm³.
The false conservation rejection occurs despite a tiny reported integration error.
Point-reference span integration is very slow on the small XZ split fragment;
an exterior plane reference measures it promptly. Makeshift therefore retries a
failed ordinary volume comparison with span integration from one exterior
reference plane shared by source and pieces. Estimated absolute integration
errors consume the unchanged conservation allowance; they do not enlarge it.
Independent point-classification probes compare original material with the
returned pieces, supplementing the scalar-volume and closed-solid checks.
These numerical checks are not a general proof of arbitrary split correctness.

The 2026-10-03 Fast erosion workflow exposed a related case: a nested cavity wall
returned a tiny negative face error (about -2.4e-21) from the nearest exterior plane.
Source observation: the pinned
[`volumePropertiesGK` face loop](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L630-L648)
aborts on any negative face error before accumulating the remaining faces. Taking
its absolute value would therefore accept incomplete mass properties. Makeshift
instead retries distinct exterior reference planes at the same 1e-10 requested
accuracy and rejects if every reference fails. Runtime verification includes the
captured wall's subtraction-volume identity and Save/Open; exact STEP readback is
also part of that regression route. No upstream implementation was copied.

## Rounded offset join precision (2026-09-23)


Source observation at pinned OCCT `a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepOffset_MakeOffset` edge-pipe construction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_MakeOffset.cxx#L1995)
omits the pipe constructor tolerance, so the
[`BRepOffset_Offset` declaration](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_Offset.hxx)
uses its independent 1e-4 default. The
[`GeomFill_Pipe::Perform` call](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffset/BRepOffset_Offset.cxx#L1104-L1108)
receives this tolerance, not the outer Shell construction tolerance.

Makeshift adaptation: the setup script changes this call to pass 1e-7 explicitly;
the original pinned archive plus this dated script reproduce the modified LGPL
component. Runtime investigation of the captured notched cylinder measured rounded
join mismatch up to 4.1e-5 mm with the default. More accurate pipe construction,
all-parallel intersection fallback, and bounded generated-vertex fitting permit
both -2/+2 mm Shell results under the existing strict checks. The capture tests
also run STL and 3MF mesh closure/orientation validation. This is specific runtime
evidence, not a claim of general constrained-surface repair.

## Perforated boundary reconstruction (2026-09-27)

Source observation at configured OCCT commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepOffsetAPI_MakeFilling::Add`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepOffsetAPI/BRepOffsetAPI_MakeFilling.hxx)
accepts interior curve constraints through `IsBound=false`.
[`BRepFill_Filling::Build`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepFill/BRepFill_Filling.cxx#L669-L695)
approximates its plate surface with a separate B-spline approximation;
`G0Error()` reports the plate builder's constraint error, not a certificate for
all final boundary points. These local source observations informed use of the
public API; no upstream implementation was copied.

Makeshift inference: constrain inner wires, trim them on the resulting support, and
independently validate final spatial/parameter boundary agreement. A tiny
out-of-plane movement can require substantially more approximation pieces than
a single-loop fill. Increasing representation capacity must not increase the
accepted geometric tolerance.

Runtime observation on the captured tilted capsule: its microscopic straight
spans and tangent arc joins make a straight connecting edge introduce a kink
when one end moves out of the original plane. Keeping tangent directions on
unselected connecting edges permits the perforated support to reconstruct within
the unchanged boundary tolerance. Curve-point correspondence also supplies a
direct distance witness when the nearest-point solver misses a copied spline's
zero-distance solution; length checks and both sampling directions remain.

Source observation: pinned
[`BRepFill::Face`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepFill/BRepFill.cxx#L210)
constructs a ruled support between oriented edges. Makeshift uses this public API for
four-sided reconnections only when all four output boundaries match the requested
curves. Runtime verification of moving an individual capsule quarter-face exposed
an inaccurate neighboring single-loop fill carrying a roughly 0.0059 mm vertex
bound; reversing the edit then merged endpoints around a 0.0006 mm span. The ruled
construction and measured boundary precision checks allow that move and its
reverse after reopening, without increasing tolerances or relying on edit history.

## Shared bicubic mesh reconstruction (2026-10-02)

Source observation at configured OCCT commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`Geom_BezierSurface::Geom_BezierSurface`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BezierSurface.hxx)
accepts a rectangular array of poles, with polynomial degree one less than the
pole count in each direction. A 4-by-4 array therefore represents a bicubic patch.
[`BRepBuilderAPI_Sewing`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepBuilderAPI/BRepBuilderAPI_Sewing.hxx)
accepts a connectivity tolerance and exposes free-edge and multiple-edge counts.
These observations use public API declarations; no upstream implementation was copied.

Makeshift inference: jointly fitted shared boundary poles allow the fitting
allowance and kernel sewing tolerance to remain independent. Sewing alone does
not certify target approximation, normal continuity, or solid validity. The
mesh-fitting operation measures these separately and passes the assembled solid
through the existing strict B-rep checks. See the current
[mesh-fitting contract](../architecture/mesh-fitting.md) for sampling limitations.


Automatic layout research: Kazhdan, Solomon and Ben-Chen, *Can Mean-Curvature
Flow Be Modified to Be Non-singular?* (2012),
[doi:10.1111/j.1467-8659.2012.03179.x](https://doi.org/10.1111/j.1467-8659.2012.03179.x),
describes a conformalized flow using fixed stiffness and changing mass matrices.
Makeshift implements that numerical idea independently with a consistent triangle
mass matrix and a matrix-free conjugate-gradient solve. No upstream code was copied.

Makeshift inference: a sphere map can transfer a coarse cube quad grid to a
closed genus-zero target, but angle-preserving maps can compress bent extremities
and undersample them. Makeshift adds its own spherical triangle area-distortion
objective with orientation-preserving backtracking. Runtime tests on independently
tessellated bent and waisted meshes support this bounded sampling strategy; neither
the paper nor those tests guarantee mapping or reconstruction of arbitrary meshes.


## Analytic mesh recovery (2026-10-02)

Source observation at configured OCCT commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepPrimAPI_MakeSphere`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepPrimAPI/BRepPrimAPI_MakeSphere.hxx)
accepts a center and radius;
[`BRepPrimAPI_MakeCylinder`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepPrimAPI/BRepPrimAPI_MakeCylinder.hxx)
accepts a placed axis, radius and height and constructs a cylindrical side with
planar caps. These are inspected public declarations, not copied implementations.

Makeshift inference: fitting analytic parameters directly to the original mesh
avoids compounding a previous bicubic approximation's error. A complete candidate
still needs bidirectional checks against the faceted mesh and the ordinary strict
solid checks; vertex agreement alone misses triangle chord error. Constructing
compatible capsule supports together also avoids independently fitted mismatched
equators. Runtime tests recover independently tessellated spheres, cylinders and
capsules, including rotated/scaled inputs, and retain or reject distorted geometry
instead of forcing it onto an analytic support. General regional segmentation and
analytic/freeform joins are not established by those tests.

## Bézier bounds and boundary reconnection (2026-10-02)

Source observations at configured OCCT commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepAdaptor_Surface::Bezier`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAdaptor/BRepAdaptor_Surface.cxx#L290)
returns a transformed copy of the surface.
[`Geom_BezierSurface::Segment`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Geom/Geom_BezierSurface.cxx#L917)
reparameterizes a bounded portion through its pole representation.
[`GeomFill_BezierCurves`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomFill/GeomFill_BezierCurves.hxx)
accepts contiguous polynomial boundary curves and a Coons filling style. These
observations informed use of public APIs; no upstream implementation was copied.

The same pinned source's
[`GeomFill_BSplineCurves::Init`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/GeomFill/GeomFill_BSplineCurves.cxx#L294)
arranges four contiguous spline boundaries, raises opposite degrees and aligns
knot distributions before constructing a Coons surface. Makeshift uses this public
API for nonrational multi-span boundaries; it does not copy the implementation or
relax the existing boundary, correspondence or solid-validity checks. General
rational-boundary interpolation is outside this path.

Makeshift inference: nonrational subpatch control hulls enclose every surface point,
so their boxes can accelerate conservative distance and crossing bounds. An actual
point classified on a trimmed face supplies an independent upper bound. Runtime
native tests compare these bounds to exact extrema on trimmed faces under both
located and copied transformations, and ensure actual surface crossings remain
possible. Bounds neither certify mesh fitting nor enlarge Erode's allowance.

Runtime observation: general plate filling did not meet a moved reconstructed
cubic face's neighboring rims within the existing boundary budget. Four-boundary
polynomial interpolation permits a nonzero local face move and subsequent cavity
subtraction. The captured periodic Remesh interior also passes nonzero face movement,
Save/Open and final cavity subtraction after extending the exact construction to
multi-span B-spline rims. Boundary correspondence, solid validity and persistence
checks remain required; this construction alone promises neither tangent continuity
nor a valid result for every edit.

## Stationary endpoints and continuity metadata

Source observation at configured OCCT commit
`a016080bf6738d6aeae020badee4e888ad1540a5`:
[`BRepLib::ContinuityOfFaces`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepLib/BRepLib.cxx#L2160-L2170)
can ask for a normal after comparing first derivatives, including stationary
parameters. [`LProp_SLProps::Normal`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/LProp/LProp_SLProps.gxx#L341-L348)
throws `LProp_NotDefined` when that normal is undefined.

Makeshift policy: optional tangent grouping and fillet recognition do not infer
smoothness across such an adjacency. Treat it as C0 for metadata only; retain
the exact solid and all geometry and presentation checks. This does not promise
tangent propagation across a singular parameterization. The captured Pen
extrusion regression exercises stationary endpoint controls next to an arc;
ordinary smooth joins remain covered by existing face-chain/fillet acceptance.
