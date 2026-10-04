# FreeCAD Sketcher audit at `78e4038a564e4c8bfebb40119b41d67531232223`

Scope: `src/Mod/Sketcher/App/SketchObject*.{cpp,h}` and `planegcs` as present in the pinned source. These are source facts; conclusions about extracting a standalone service are inferences and require a build/licensing proof.

## Findings

1. **`SketchObject::execute()` is the integration boundary around the solver.** It loads complete geometry and constraints, selects the configured GCS algorithm, calls `solve(true)`, translates statuses into document errors (over-constrained, conflicting, redundant, malformed, solver error, invalid geometry), then calls `buildShape()` ([SketchObject.cpp#L225-L274](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObject.cpp#L225-L274)). The solver alone therefore does not provide document recompute/error propagation or the resulting shape.

2. **Interactive move has a stateful precondition and diagnostic lifecycle.** `moveGeometries()` rebuilds solver state when stale, rejects negative DoF/conflicts, delegates to `solvedSketch.moveGeometries`, copies solved geometry back, and resets the solver’s move state ([SketchObjectOperations.cpp#L44-L100](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObjectOperations.cpp#L44-L100)). This is evidence that drag stability is more than calling a numerical solve: the service must preserve initialization, conflict state, preview/commit semantics, and reset behavior.

3. **Constraint insertion is coupled to transactions and undo correctness.** The Python binding validates indexes, adds the constraint, solves before command commit because solving can move geometry, and refreshes the solver’s initial solution when redundant constraints make a later point move unsafe ([SketchObjectPyImp.cpp#L369-L406](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObjectPyImp.cpp#L369-L406)). A native OCCT service must define equivalent command boundaries and rollback behavior; OCAF transactions alone do not prove this integration.

4. **Trim is a topology/constraint rewrite, not a simple curve parameter edit.** `trim()` finds cutting geometry, creates one or two replacement curves, transfers or deletes endpoint/midpoint constraints, adds joint constraints, preserves expressions, replaces geometry, deletes obsolete pieces, and solves ([SketchObjectOperations.cpp#L921-L1148](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObjectOperations.cpp#L921-L1148)). The source explicitly documents unresolved redundancy/over-constraint cases for conics. Any product trim behavior must test constraint preservation, identity remapping, and failure recovery rather than assume OCCT curve splitting is sufficient.

5. **Split deliberately preserves some identity and derives new constraints.** `split()` keeps the original geometry ID for the first piece, assigns a new ID to the second, transfers endpoint constraints, derives constraints for pieces, and adds coincidence/tangent joins depending on curve type ([SketchObjectOperations.cpp#L1151-L1262](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObjectOperations.cpp#L1151-L1262)). This is useful evidence for a growing workspace: operation boundaries cannot be keyed only by current array indexes, and a new backend needs explicit provenance when a source curve is replaced.

6. **Geometry IDs are separate from array indexes, but are not a complete topology identity system.** `setGeometryId()` deep-clones geometry and changes the facade ID; `getGeometryId()` reads that ID ([SketchObjectGeometry.cpp#L1719-L1799](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObjectGeometry.cpp#L1719-L1799)). The existence of both index and persistent-ish ID supports durable sketch references, but does not establish durable BRep face/edge identity after arbitrary OCCT operations.

7. **Undo/redo and restore contain substantial synchronization work.** After undo/redo, FreeCAD repairs constraint indexes and vertex indexes, accepts geometry, synchronizes internal states, and solves again ([SketchObject.cpp#L1345-L1359](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObject.cpp#L1345-L1359)). Restore also migrates sketches, rebuilds external geometry, migrates constraint orientations, repairs expressions, and may rebuild the shape ([SketchObject.cpp#L1389-L1442](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObject.cpp#L1389-L1442)). Persistence is therefore a behavior-rich integration boundary, not just serializing curves and constraints.

8. **External references add another dependency graph.** Placement/support changes can delete external constraints and rebuild projected geometry ([SketchObject.cpp#L1317-L1330](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/SketchObject.cpp#L1317-L1330)). A remote frontend must send revisioned references and the backend must reject or reconcile stale support/selection context.

9. **GCS initialization is materially more than a numerical solve.** `System::initSolution()` stores a reference configuration, diagnoses constraints, filters redundant driving constraints, partitions decoupled subsystems, and prepares reductions before `System::solve()` can run ([GCS.cpp#L1740-L1780](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L1740-L1780); [GCS.cpp#L1900-L1946](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L1900-L1946)). A service reusing GCS would need to preserve this state lifecycle per sketch/session.

10. **Diagnosis has policy and stability choices that belong in the product contract.** `System::diagnose()` excludes some high-priority tags from conflict reporting, handles empty/external-only parameter sets specially, builds a reduced Jacobian, and switches DenseQR/SparseQR because SparseQR has known rank-detection failures for some structures ([GCS.cpp#L4772-L4852](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L4772-L4852)). “Solver reuse” therefore does not mean identical DoF/conflict UX without carrying over diagnostics policy and algorithm selection.

The pinned tree contains focused integration tests: repeated move/solver status in [`TestSketcherSolver.py#L438-L476`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/SketcherTests/TestSketcherSolver.py#L438-L476), restore/missing-reference behavior in [`TestSketcherSolver.py#L1040-L1065`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/SketcherTests/TestSketcherSolver.py#L1040-L1065), conflict rejection/rollback in [`TestCoincidentCommandGui.py#L117-L143`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/SketcherTests/TestCoincidentCommandGui.py#L117-L143), and split-edge mapped-name stability in [`TestSketchInternalFaces.py#L555-L659`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/SketcherTests/TestSketchInternalFaces.py#L555-L659). These are useful behavioral fixtures, but they run through FreeCAD’s document/GUI integration. Do not treat the solver source as a standalone packaged API or assume its licensing/ABI boundary without verification.

## Rectangle representation follow-up, 2026-09-14

At the same pinned revision, the rectangle tool's
[`createFirstRectangleLines`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/Gui/DrawSketchHandlerRectangle.h#L979-L1000)
adds four lines. `finishRectangleCreation` and its helpers add endpoint coincidence
and alignment relationships; rotated rectangular cases use parallel/perpendicular
relationships. [`finishCenteredRectangleCreation`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/Gui/DrawSketchHandlerRectangle.h#L1881-L1900)
adds a construction point and symmetry between opposite corners about it. This is
explicit geometry plus constraints, not a center/width/height/angle rectangle entity.
The GUI file was read at that commit separately because it was absent from the
sparse checkout; no upstream build or UI run was performed.

[`Sketch::addLineSegment`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/Sketch.cpp#L909-L952)
allocates endpoint coordinate parameters for the solver. In contrast,
[`Sketch::addCircle`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/Sketch.cpp#L1724-L1758)
uses center coordinates and radius, with the center addressable as a point.
[`GCS::Point`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/Geo.h#L39-L55)
holds coordinate-parameter pointers. These inspected interfaces do not establish
support for arbitrary rectangle-corner expressions over five custom parameters.

Makeshift inference: persistent subfeature addresses need not own independent stored
coordinates. A compact rectangle can expose derived corner/edge/center references.
Using it with PlaneGCS would require either appropriate derived-expression support
or temporary expansion into supported geometry and intrinsic constraints, followed
by validated reconstruction. Neither integration path has been runtime-verified.
Do not infer a need to write a new solver from the representation preference.

## Current application integration, 2026-09-14

The same pinned PlaneGCS sources now compile into Makeshift's current sketch calculator
under `native/solver`, independently of the old P0/P1 binaries. The setup script
verifies original file hashes and preserves source notices. No solver mathematics
is modified. Current TS document ownership/Undo supersedes historical service and
revision recommendations below.

Runtime evidence on macOS arm64: actual rectangle edits solve from previous extents
using ordinary segment constraints and temporary corner/orientation/size targets.
Native tests verify that output changes to the requested size, all equation residuals
hold, and contradictory parallel/perpendicular constraints reject without changing
accepted geometry or the redo branch. Do not run the numerical solve after diagnosis
has already reported a conflict. A calculator interruption also retains the document.

Integration counterexample: our first compact-JSON error reply omitted its trailing
newline, so the host waited until the host timeout even though PlaneGCS
had already diagnosed the conflict. Both success and failure responses now explicitly
terminate their line; the actual native rejection test covers this boundary. This was
an adapter defect, not evidence that PlaneGCS took ten seconds to diagnose the case.

Ordinary-input routes cover the current editor in headless Chromium/WebKit and hidden
Electron. Delayed actual browser replies cover coalescing/release/cancel; they are not
LAN latency measurements. The small warm rectangle solve observed in the review
fixture was below 1 ms; that is not a benchmark for large or general sketches.
Coverage gaps: curved/externally linked sketches, user constraint controls, physical
iPad/LAN interaction and Linux/Windows builds. This integration does not establish
support for compact rectangle expressions or settle casting/linking policy.

Circle editing follow-up: the Makeshift document now stores analytic center/radius
circles beside segments. The current native adapter solves only the segment
subset and preserves circles when mapping results back; an interleaved
circle/rectangle regression verifies this against actual PlaneGCS. Unconstrained
circle edits use document validation and shared Undo directly. This does not yet
integrate circle constraints or alter the inspected upstream revision. The
circle UI checks found an interior-move anchor error, fixed by snapping the center;
unsnapped pointer assertions account for WebKit pixel quantization while snapped
centers/intersections and numeric dimensions retain exact numerical checks.

## Product implications

### P0 dependency preflight, 2026-09-13

At the same pinned revision, the Sketcher build integrates PlaneGCS sources into
its module rather than exposing a demonstrated standalone target; the target
uses FreeCAD dependencies ([CMakeLists.txt](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/CMakeLists.txt#L1-L149)).
`GCS.cpp` includes `Base/Tools.h`, `Base/Console.h`, `FCConfig.h` and
`boost_graph_adjacency_list.hpp`
([GCS.cpp includes](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L51-L106)).
These are observed source dependencies, a counterexample to assuming the solver
directory alone is a ready independent library. Makeshift inference: inspect the
needed host symbols and evaluate an explicit adaptation/build boundary and
license obligations before extracting code. A shim is a possible approach,
not a verified sufficient solution. Luna inspected source and host availability;
the manager rechecked the includes. No compile, load or solve probe ran. The
next failure probe is an isolated pinned build/load with no FreeCAD application
or reference checkout runtime paths; numerical and diagnostic compatibility
remain unverified.

The subsequent [P0a dependency review](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p0a-dependency-selection.md)
enumerates five translation units, six solver headers and the Boost wrapper,
with exact Eigen/Boost package pins. Manager inspection confirmed that
`System::applySolution()` copies subsystem/reduction results into caller-owned
parameter storage and evaluates driven constraints
([GCS.cpp, applySolution](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L4696-L4723)).
Makeshift implication: solving and extracting caller values require an explicit
lifecycle; applying a solver candidate is still separate from committing a Makeshift
model revision. Probe perturbed inputs to catch reading pre-solve coordinates,
and reject a contradictory candidate without replacing accepted model values.
At the end of P0a, no such runtime probe had run. The P0b findings below
record subsequent execution separately.

### P0b runtime counterexample: success with conflicts

During the native trial on Darwin arm64 (Apple clang 17, Eigen 3.4.0,
Boost 1.86.0 headers), the manager ran the contradictory-width fixture against
the adapted solver at the same pinned FreeCAD revision. The solver returned
`Success`, while diagnosis returned `dofs=-1` and two conflicting constraint
tags. Base rectangle residuals were zero. This is a concrete counterexample to
accepting geometry from a solver status or only the non-conflicting constraints'
residuals. The final proof evidence belongs in
[the P0b report](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p0b-native-components.md).

Observed source context: `System::solve()` returns the subsystem solve status and
checks redundant constraints; diagnosis data is exposed separately via
`dofsNumber()` and `getConflicting()`
([GCS.cpp, solve](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L1907-L1945),
[GCS.h, diagnostic accessors](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.h#L632-L649)).
Makeshift implication: candidate acceptance checks diagnosis, finite solved values,
active-constraint residuals and geometry validity before publishing. Keep native
status distinct from the adapter's accepted/rejected result. Required failure
probe: introduce a contradictory width after a valid extrusion, reject the
candidate without replacing the accepted values/solid, then remove it and solve
again. This fixture does not establish general solver stability or trim behavior.

The product-independent core can own workspace state, gesture semantics, selection intent, operation-boundary revisions, and a typed command protocol. FreeCAD-specific code currently supplies solver integration, constraint diagnostics, trim/split rewrites, document transactions, undo/redo repair, external-reference restoration, shape generation, and GUI ownership. A three.js client can render meshes and own interaction presentation, but the backend still needs a model revision protocol, durable sketch-primitive identities, selection remapping, preview/commit separation, and a way to return solver diagnostics and valid tessellation.

The growing planar workspace requirement is compatible with the source’s ability to append geometry, but preserving an earlier extrusion across later workspace edits is a separate product-layer rule. It cannot be inferred from SketchObject geometry IDs or from solver reuse. The backend must persist an operation’s selected boundary/provenance independently and explicitly revise it when requested.

## Three highest-risk prototypes

1. **Constraint-preserving trim/split:** construct connected lines plus a constrained arc/circle, trim and split at intersections, and verify geometry identity/provenance, constraints, DoF/conflict diagnostics, undo/redo, and save/reopen.
2. **Growing workspace boundary preservation:** extrude a closed region, add a crossing line to the same workspace, verify the first solid’s volume/boundary is unchanged, then deliberately revise its boundary and undo/redo both actions.
3. **Thin-client command round trip:** three.js pointer gesture → revisioned backend command → solver preview → OCCT shape/tessellation → picked primitive/face returned to the client → commit/undo/save/reopen, repeated across a local process boundary. Measure stale-reference rejection and recovery, rather than assuming IDs or OCAF transactions solve them.

### Rectangle-only native entry point, 2026-09-13

The [P1 rectangle proof](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p1-rectangle-solver.md) shares the bounded
solver wrapper while excluding auxiliary circle unknowns and constraints for
P1's line-only workspace. Actual origin constraints solve a 30×12 rectangle at
(100,50); an extra width 35 produces native conflicting tags 16/22, and removing
it permits recovery from the accepted seed. Manager execution passed nine native
checks including the original circle, diagnosis and recovery fixtures. Source
links and the numeric-pointer lifetime inspection are in the evidence report.
This is a rectangle adapter, not a general constraint-editing or trim service.

### Independent rectangle ownership follow-up

Makeshift's multiple-rectangle native slice scopes the adapter's repeated native tags
to the selected rectangle's constraint IDs. A global lookup of tag 16 would blame
another rectangle's width. The targeted diagnostic test also exposed a stale
candidate-tag string that failed to return the allocated extra-constraint ID.
These are Makeshift implementation findings; the inspected FreeCAD revision above is
unchanged. The new tests distinguish unchanged boundary membership from changed
source versions and capture geometry after resizing. Exact bounded coverage and
remaining UI/solver limits are recorded in
[multiple-rectangle evidence](https://github.com/osuushi/makeshift/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/multiple-rectangles.md).

## Numeric radius lock integration (2026-09-14)

**Source observation:** at the same pinned revision,
[`System::addConstraintCircleRadius` and `addConstraintArcRadius`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L1188-L1195)
add equality between the curve's radius parameter and the requested radius.
They do not by themselves enforce arc endpoint incidence or tangency.

**Makeshift choice:** C1 uses that scalar equation for circle/arc radius locks, then
reconstructs an arc at fixed endpoints on its chosen branch. This needs no copied
solver mathematics or second authoritative geometry. General coupled arc solving
remains separate work; a radius-changing endpoint drag currently rejects.

**Runtime evidence:** `tests/numeric-locks.test.ts` solves a radius from 5 to 6
through the native wrapper, verifies major-arc branch retention and Undo, and
rejects conflicting/duplicate numeric locks without changing accepted geometry.
These fixtures establish numeric locks, not tangent/concentric/trim behavior.

## Temporary line targets (C2 preflight)

At the same pinned revision, the [constraint-tag documentation](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.h#L89-L100)
identifies negative tags as temporary constraints with lower priority than the
main sketch system. A local native probe used a hard horizontal constraint and
four negative-tag coordinate targets for endpoints (0,0) and (10,4). It returned
(0,1.99999998) and (10,1.99999998): the horizontal relationship won, but both
endpoints moved. The experimental wrapper changes were then reverted.

This verifies the priority mechanism, not an anchored editing interaction.
Makeshift must supply the intended anchors/targets explicitly; equal coordinate
targets alone do not preserve the opposite endpoint or first selected edge.
Application/removal, coupled drags and conflicting numeric locks still need
complete ordinary-input acceptance in C2.

C2 implementation follow-up: the owned wrapper now uses negative-tag point targets
and leaves temporary anchors out of `declareUnknowns`. The application does not
store these anchors as persistent constraints. `tests/line-relations.test.ts`
verifies a horizontal endpoint target (14,4) solves to (14,0) while the opposite
endpoint stays (0,0), equal lengths update from both sides, and conflicting locks
and duplicate relations preserve accepted geometry/history. These are bounded
line fixtures, not evidence for arbitrary linked arcs or trim.


## Coupled arc points (C3)

**Source observation:** at the same pinned revision,
[`System::addConstraintPointOnCircle`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L966-L969)
uses point-to-center distance with the circle's radius parameter. This allows
Makeshift's two arc endpoints to share a center and radius without carrying extra
angle parameters. No upstream implementation was copied.

**Makeshift choice:** only linked arcs expand into these temporary calculator points.
The authoritative arc remains endpoints plus signed bulge. Endpoint gestures do
not independently target the derived center. Fixed endpoints plus an explicit
radius and chosen branch determine the center; treating those as constants avoids
redundant/singular equations at exactly 180 degrees without weakening diagnosis
or final geometry validation.

**Runtime evidence:** `tests/arc-links.test.ts` exercises radius-locked linked
endpoint movement, center translation preserving major-arc shape, detachment and
Undo, and fixed-endpoint radius changes through a semicircle. The ordinary-input
route in `tests/ui-arc-links.mjs` passes in Chromium and WebKit. This is point-link
and radius-edit evidence, not tangent, fillet or trim acceptance.


## Meeting-line angle integration

**Source observation:** at the pinned revision,
[`System::addConstraintL2LAngle`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L739-L745)
installs a directed line-to-line angle equation.
[`ConstraintL2LAngle::error`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/Constraints.cpp#L1343-L1355)
evaluates the second line's direction relative to the first plus the requested
angle. Makeshift reverses temporary line endpoints as needed to represent rays away
from the selected meeting point; no upstream implementation was copied.

**Runtime evidence:** `tests/corner-angle.test.ts` covers all four endpoint-order
combinations, fixed-reference initial edits, explicit locking/value changes and
later reference-driven edits. `tests/ui-corner-angle.mjs` passes the actual local
field/lock/inspection/removal/Undo route in Chromium and WebKit. This establishes
straight-line angle behavior, not arbitrary angles between curved tangents.


## Tangency integration boundary (2026-09-15)

Source observation at the same pinned commit: line/circle and line/arc overloads
of `System::addConstraintTangent` reduce to signed center-to-line distance equal
to radius ([GCS.cpp#L1122-L1138](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L1122-L1138)).
The circle/arc overloads derive internal/external contact from initial center
distance and radii, then call `addConstraintTangentCircumf`
([GCS.cpp#L1140-L1186](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L1140-L1186)).
That lower-level entry point accepts an explicit internal-contact flag
([GCS.cpp#L844-L858](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L844-L858)).

Makeshift inference for C4: keep the selected contact branch in the ordinary constraint
record, and validate contact against finite segment/arc domains. A successful
supporting-circle solve alone does not establish visible tangency. Endpoint joins
also need explicit point incidence; tangency must not silently fuse endpoints.
These are source observations and integration requirements, not runtime tangency
verification. No upstream implementation was copied.


The first line/circular C4 runtime now calls the line/circle overload using the
stored side. `ConstraintP2LDistance::signed_value/error` confirms `ccw=true`
corresponds to positive signed center-to-line distance
([Constraints.cpp#L880-L901](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/Constraints.cpp#L880-L901)).
Makeshift independently checks this residual and the finite segment/arc contact.
Native tests exercise both selection orders, radius following, finite-domain
rejection and a conflicting center/endpoint coincidence. Pointer/numeric routes
run through Chromium, WebKit and built hidden Electron. This verifies line/circular
tangency only; joined-endpoint cases are still pending. Circular-pair runtime is described below.


Circular-pair C4 now uses the explicit `addConstraintTangentCircumf` entry point
cited above. Makeshift records external/a-contains-b/b-contains-a rather than asking
the overload to choose a branch again on every edit. The native equation enforces
center separation; independent model checks enforce containing identity and finite
arc contact. Native tests cover external/internal radius edits, containment
rejection, peer arc shape preservation, and a nearest contact on an arc boundary.
Chromium/WebKit pointer tests and built hidden Electron exercise circular pairs,
arc/circle and two-arc edits with removal/Undo. Joined endpoints remain unverified.


A next-increment native fixture establishes the joined-endpoint gap: a semicircle
from (-4,0) to (4,0) through (0,4), fused at its end to a line from (4,0) to (8,3),
is accepted. Seeding the line end at (4,5) and adding the supporting-circle tangent
produces “Conflicting or redundant sketch constraints” although the intended
geometry is tangent. The initializer also needs rotation about the junction rather
than translation. Candidate API: PlaneGCS exposes perpendicular constraints over
explicit points or a point pair and a line
([GCS.cpp#L716-L737](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L716-L737)).
The radius-normal integration now resolves this fixture: line/arc uses a
perpendicular direction equation and arc/arc uses parallel radii at the junction.
Makeshift still independently checks contact, finite domains and the stored branch;
solver conflict/redundancy diagnosis remains enabled. Junction roles do not add
coincidence: explicitly fused endpoints use their ordinary relation, while
touching unfused endpoints receive temporary anchors for this calculation.
Native tests pass both selection orders, fused/unfused line/arc junctions, two
radius-locked arcs and Undo. Targeted Chromium/WebKit and hidden Electron pointer
routes also pass later radius edits, constrained junction drags and detachment.

## Makeshift trim integration (2026-09-15)

The trim rewrite lesson above now has Makeshift runtime coverage. Analytic finite
contacts select spans independently of display tessellation and region-walker
circle seams. Surviving endpoint/center references and radius locks are remapped;
whole-edge length losses require local confirmation. A direction-constrained line
split keeps its existing direction relations on one piece and relates the other
piece by parallelism. Copying every original direction relation onto both pieces
would introduce redundant equations. Rectangle conversion also transfers a deleted
side's perpendicular relation to its surviving opposite side where applicable.
These are Makeshift implementation choices; no upstream trim code was copied.

Native tests verify linked endpoints, two radius/center-linked arc remnants,
rectangle middle/whole-side removal, right-angle preservation and Undo. Targeted
Chromium/WebKit and hidden Electron pointer routes verify spans, remnant edits,
loss confirmation/cancel, rectangle conversion, fill changes and overlap choice.
Save/Open remains unimplemented, so this is not persistence acceptance.

## Point/edge incidence (2026-09-15)

The pinned [GCS.h point-on-line overload](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.h#L313-L314)
and [point-on-circle overload](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.h#L415)
are the source API evidence. Makeshift calls them without copying upstream code.
Its own finite-domain validation is a product decision: supporting-line/circle
incidence must not accept a point outside the visible segment or arc. Native
fixtures now verify both initial selection orders, later solved edits and Undo
for line, circle and arc targets. Pointer acceptance is tracked in the current brief.

## Single-threaded WASM port, 2026-10-03

Source observation: `System::diagnose()` launches both QR variants using
[`std::async` with the default policy](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L4937),
then waits for the result. Makeshift adaptation: explicitly use
`std::launch::deferred` under Emscripten so that the same numerical work executes
on the calculator worker without pthreads or cross-origin isolation. Native
builds retain the original policy. Runtime evidence: initialization stalled
without this change; actual Chromium and WebKit rectangle creation, constraint
application, dimension editing and extrusion now complete.
