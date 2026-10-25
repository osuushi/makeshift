# Preview presentation and deferred work

A tool should draw useful geometry before computing data that only supports later
editing or readouts. Its accepted document, validation requirements and Undo
boundary remain unchanged. This is separate from making a kernel operation faster.

## Face and edge movement

Boundary movement has two serialized calculation stages. The first reconstructs
and validates the exact solid, checks boundary correspondence and produces its
complete mesh and outline. It returns a `VisualPreview`, with source references
used only for visibility, selection color and body appearance. It contains no
BRep, measured volume or editable topology and cannot be accepted or exported.
The accepted operands it replaces are hidden while that drawing is shown.

The calculator retains at most one disposable result from this stage. It is a
calculation cache, not a document: the next kernel operation replaces it, completion
consumes it, and cancellation releases it. `DocumentOwner` owns the pending typed
operation and accepted data. The same protocol runs in the native calculator and
persistent WASM calculator worker; worker termination discards the cache.

After drawing, the renderer yields across a paint opportunity before requesting
`complete-preview`. Completion reuses the exact shape and its existing mesh. Exact
volume integration, BRep serialization, analytic editing metadata, guide/tag
continuation and decorator continuation happen in this stage. Only its successful
result becomes an acceptable candidate. Enter/tool completion waits for it; Undo
still records one accepted operation. A failed completion cannot accept the early
drawing.

New movement input skips completion if it has not started, or interrupts its
calculator if it is running. Geometry already being generated may supply an
intermediate drawing; only the latest queued target can become acceptable. Escape
also releases the pending paint wait, so cancellation does not depend on another
frame in a hidden window. Late metadata or decorator replies cannot publish a
superseded candidate.

Combined whole-body and boundary movement currently uses the complete path. Its
separate exact transforms and result composition have not been staged. Reopened
accepted previews retain their existing complete snapshot behavior.

## Tool audit

This table describes the current code paths, including synchronous work that
remains. Deferring presentation does not authorize omitting geometric checks.

| Path | Work before the first useful draw | Deferral/cancellation status |
| --- | --- | --- |
| Face/edge Move | Boundary reconstruction, validity/self-interference, correspondence, meshing | Mesh first; volume and editing metadata after paint; newer targets cancel completion. |
| Whole-body Move/Rotate | Renderer placement of existing geometry | Already draws without a kernel round trip. Exact transformation is required at acceptance. |
| Cube and circular primitive creation | Temporary renderer geometry | Already uses local preview geometry; exact acceptance remains necessary. |
| Straight sketch extrusion into a new body | Sweep and mesh; solid extraction still measures volume | Held dragging already omits full presentation metadata. Release requests a complete result. Extraction volume remains before the visual result. |
| Drafted/twisted/Boolean extrusion, Revolve and Loft | Sweep/Boolean work, validation, result extraction and full presentation | Surface/volume annotations and serialization are candidates for staging. Overlap selection, cavity checks and other volume comparisons used by the operation must remain in its geometry stage. These paths are not yet mesh-first. |
| Offset and Fillet/Chamfer | Feasibility search; each successful probe returns a fully presented result | New input stops subsequent probes. Full presentation of intermediate feasible probes is avoidable work; the verified winning geometry and actual clamped distance/size must survive any staged search. |
| Shell, solid Scale/Mirror, Boolean and plane cuts | Geometry checks followed by complete presentation | Presentation annotations can be deferred. Result counts, retained operands, cut feedback and topology changes need tool-specific early-view handling. These paths are not yet staged. |
| Erode | Erosion/reconstruction, quality checks and complete presentation | New input already interrupts the calculator. Nonvisual presentation can be staged; quality/allowance checks used to judge geometry remain required. |
| Cleanup | Topology removal and full presentation | Mesh could precede topology-count feedback. There is no continuously changing parameter stream. |
| Sketch edits | Constraint solving and ordinary sketch geometry | Solver success is required to draw a valid edit. No solid volume presentation is involved. |
| Selection measurements | Debounced/asynchronous queries of accepted geometry | Separate from the edit calculator; readouts are hidden during modal editing. Stale readouts are ignored, but an already-running measurement is not preempted when editing begins and can still consume CPU. |
| Guide queries | Asynchronous queries used for tool snapping | Separate from the edit calculator. Current geometry and active-tool semantics are required for useful targets; these are interaction inputs, not merely deferred readouts. |
| Decorators and attached metadata | Continuation before a full candidate reply; renderer decoration has its own path | Movement now draws before continuation. Other exact-preview tools still wait for backend continuation. Export-only decoration stays outside ordinary CAD geometry. |

The primary remaining shared bottleneck is `presentation.cpp`: volume,
signatures, surface bounds, thickness, tangent chains and blend/chamfer metadata
are generated together. `booleans.cpp::solids` also computes exact volume during
result extraction, before presentation. Splitting only the serializer therefore
cannot make every tool mesh-first. Each additional tool must preserve its actual
parameter feedback, topology/operand display and validation boundary when adopting
the staged path; no global flag treats incomplete results as accepted bodies.

## Numerical integration

Exact-volume calculation retains the existing integration tolerance and failure
checks. Its default axis ordering avoids directions nearly tangent to spline
faces, using a small derivative sample only as a performance hint. Explicit sweep
axis hints still take precedence. These samples do not estimate volume, certify a
surface, change geometry or relax validation. Exact volume and geometry remain
subject to their existing checks.
