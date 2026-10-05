# Edit lifecycle and Undo

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## One edit at a time

The entire mutation lifecycle is:

1. While idle, resolve the current selection and start an edit from accepted data.
2. Change a temporary candidate, solve when necessary and validate it.
3. On success, replace accepted data and add one Undo entry. On failure, retain
   the accepted document and display the relevant error locally.
4. Refresh derived geometry and controls, then accept the next edit.

While a calculation is running, disable conflicting edits, including Undo, Clear,
Open and tool changes that mutate geometry. Do not silently queue clicks or replay
them later. If it exceeds about 150 ms, show a busy indicator; that delay is an
initial UX default to test. The window continues repainting; pan/orbit/zoom remain
available except during a geometry drag gesture. Busy does not itself disable
navigation.
The delayed calculation indicator names the operation, shows elapsed time and
offers Cancel/Escape for cancellable calculations. Heavy native work
runs outside the renderer, using a direct call adapter and one request in flight.
There is no need to freeze the operating-system event loop to block editing.

For sketch dragging, the interaction owns one temporary candidate and one original state.
Pointer updates change that candidate, with at most one solver calculation running.
If computation cannot follow the pointer, retain only the latest pointer target
for this gesture, never a queue of intermediate edits. Show the last valid solved
candidate; do not advertise unverified snapped geometry as accepted geometry.
Release waits for the final target to be validated and makes one edit. Escape or
lost pointer capture before completion discards the gesture. An in-flight call
may finish, but a discarded gesture has no path to acceptance. This is ordinary
gesture ownership, not a document-version or retry protocol.

`ActiveInteraction` is the sole owner of the current edit's phase, displayed
candidate and pointer-capture cleanup. Pointer, rectangle bow, fillet, offset,
trim and numeric controllers acquire it; a second interaction cannot acquire it
until cleanup completes. Concrete controllers still own their geometry and
completion rules. `GestureSolve` publishes only into its owning interaction.
An invalid latest target clears its preview; a cancelled calculation cannot
restore one. Escape routes to the current owner. Window focus loss cancels only
a held pointer gesture (an interaction with pointer capture); released modal
previews, numeric edits and pending calculations survive app switches. Intentional
pointer release is distinguished from lost capture.

Numeric fields acquire an edit while focused. Tab transfers that ownership;
numeric entry during a held drag belongs to the existing pointer edit. Acceptance
and discard finish before ownership is released. Waiting for a final calculation
remains cancellable; an acceptance already sent to the backend completes normally.
The composition root passes a named NumericEdit collaborator to the editor and
connects Dimensions and PointerGestures as its field and gesture owners before
installing input shortcuts. Field focus, commit/cancel and held-drag quantity
changes use this contract; controllers do not install mutable callback slots on
the editor. Missing or disposed owners fail explicitly. Each owner retains its
existing edit lifetime and the composition releases the references on teardown.

This release-time acceptance applies to sketch edits, not to every tool. Extrusion
retains one candidate across successive drags/parameter edits until the user
completes and exits the tool. Its split bodies are temporary until then. Both
lifecycles use the same simple edit acceptance and Undo mechanism.
Extrude, Face Offset and body Fillet/Chamfer share a bounded PreviewRunner: one
running calculation, one latest waiting parameter set and a serial slot for
selection queries. It does not own accepted data, candidates, validity or completion. Extrude interrupts
superseded calculations. Erode also interrupts superseded parameter calculations
and uses the shared cancellation path, with no late candidate publication after
its lease closes. Offset retains its established noninterrupting policy,
last verified distance and selection feedback. Fillet/Chamfer similarly retain verified
size-limit feedback; their pending sizes use the expanded edge selection when
calculation starts. Each controller checks its lease
and request identity before changing presentation. Invalid input clears waiting
targets; cancellation closes the lease before awaiting native cancellation. Modeling
controls never schedule completion-cleanup probes. Standalone Clean up previews and
accepts its own ordinary edit; compatible native/script cleanup flags remain available.

Unconstrained movement and transforms that preserve every existing constraint
exactly can run directly. Use the solver for coupled constrained edits; do not
duplicate a numerical constraint solver in TypeScript for preview. If measured
interaction latency is poor, optimize that calculation or
its adapter. Do not introduce optimistic document editing to conceal it.

No public revisions, expected-revision fields, idempotency keys, retry ledgers,
durable command envelopes, concurrent edits or automatic recovery/replay. A native
call returning an error leaves the last accepted TypeScript document available.
The five-minute native watchdog reports timeout separately from user cancellation. Cancellation
and timeout detach replies immediately, request termination, escalate to forced
termination after 250 ms, and drain process exit before the slot can be reused.
A request waiting for that drain can also be cancelled.
After a worker exit, finish the failed edit as a failure and explicitly restart
the calculator when needed; do not replay the failed edit automatically.

The future embedded agent calls the same edit functions through the app host.
It waits while the editor is busy or receives “busy.” Re-resolve referenced IDs
when an edit starts; missing geometry is an ordinary error. User and agent do not
write the document concurrently. Remote hosting, if later delivered, retains
single-user serialized semantics rather than introducing collaborative editing.

## Unified attempted-operation history (founder decision, 2026-09-17)

DocumentStore owns one in-memory ordered history. Each entry records diagnostic
intent/parameters, time and an outcome: changed, no-op, failed or cancelled.
A changed document entry also owns its before/after document snapshots and its
current applied/undone state. Undo finds the latest applied change; Redo finds the next
undone change. Both skip failed, cancelled and no-op attempts; selection navigation
is described below. There is no separate error log or second Undo stack.

A failure or no-op after Undo preserves the redo path. A new accepted change
marks the undone branch superseded and releases its snapshots, but retains its
operation records for explanation. A failed preview records its actual attempt;
successful preview updates remain temporary, and acceptance records the originating
tool and final accepted parameters (including explicit cleanup), not a bare Accept.
Native-clamped edge finish and face offset measurements replace rejected overshoot
values in accepted intent; input topology IDs and active radius/method choices stay intact.
Cancellation records the abandoned pending operation without an Undo step.

A read-only `read-history` request exposes cloned metadata without Undo snapshots;
`window.makeshiftHistory()` and Capture fixture use this same path. Sketch inputs are
retained; Open diagnostics summarize IDs rather than copying complete BReps.
Fixture captures use the system temporary directory in development and production,
independent of the app launch directory; see [diagnostic fixtures](persistence.md#diagnostic-fixtures).
The history survives renderer reload with its backend owner. New/Open starts a
fresh document history; failed Open leaves the existing history intact. Normal
Save/Open does not serialize or replay these records. This is diagnostic memory
and ordinary snapshot navigation, not a revision, retry or event-replay protocol.

Deleting selected bodies or sketches is an immediate document edit; selected solid
topology is an immediate calculation and acceptance in one serialized backend call.
Neither leaves a pending candidate or UI lease. The calculation portion of topology
or mixed deletion is cancellable; acceptance remains atomic. Cancellation retains
selection and records a cancelled attempt, while timeout/geometric rejection records
a failure, without altering geometry or invalidating Redo. Explicit Accept and
committing sketch edits complete normally rather than being interrupted.

Automatic acceptance checks cancellation after geometry and decorator continuation,
immediately before publication. Open checks before replacing the document and its
history. Cancelling after native computation has finished still abandons that edit.
DocumentStore validates whole-document identities and current sketch/decorator
invariants before changing snapshots or history, for manual edits, scripts and Open.

## Reopen the latest accepted operation

Viewport Cmd/Ctrl-R and Tools → Reopen last operation undo the latest accepted
geometry operation to its exact input snapshot and ordered selection, then seed
its ordinary modal controller before local parameter-history tracking. The pending
preview reuses the exact accepted result and its retained measurements; reopening
does not recalculate geometry, cleanup or decorators. Changed parameters resume
normal calculation. Unchanged acceptance retains the saved result. Selection
and camera changes do not hide that operation. A newer unsupported changed edit,
including metadata or direct sketch edits, blocks reentry rather than searching
backward for an older supported operation. New/Open has no operation to reopen.
Cancel leaves the operation undone with its original result available by ordinary
Redo. Acceptance makes the normal new branch; no feature tree or replay is added.

Recorded Extrude, Revolve, Loft, Boolean, Shell, Erode, edge finish, face offset,
cleanup, Scale, Mirror, plane cut, Projection, ordinary body movement, face/edge
movement and construction-plane edits have typed current-use reentry. Parameters
are transient owner history, outside saved geometry. Older sketch placement and
summarized mesh reconstruction lack sufficient interaction inputs; scripts and
other nonmodal edits remain unsupported. Composite or arbitrary-axis body moves
that a single ordinary body gesture cannot represent are also ineligible.

History stores geometric intent, so omitted UI conventions use an honest canonical
display: linked scale follows equal factors while the recorded pivot stays fixed;
Mirror restores its final reference with zero additional offset; inactive erosion
options use current defaults. Topology movement exposes cumulative translation
and face angle, with exact axis/pivot readouts; the gizmo adds further deltas.
Construction planes restore the exact final frame and stable ID, then ordinary
handles add movement. Prior plane gesture ancestry is not inferred.

Standalone Cleanup can be reopened with its recorded selection. API-only combined
cleanup operations fail eligibility before rollback for every controller: ordinary
completion controls cannot retain that intent. Native/script flags and normal
Undo/Redo of those accepted results remain supported. Focused fields, native buttons, menus,
dialogs, composition and the agent terminal retain keyboard ownership. Electron
keeps explicit Reload on Shift-Cmd/Ctrl-R.

## Selection Undo (founder decision, 2026-09-22)

The same DocumentStore history includes ordered selection snapshots. Completed
selection changes remain individually undoable at the history tip, including
blank-click clearing, point choices and modeling targets. Selection-only
Undo/Redo never evicts these entries. A newly accepted document change supersedes
all selection entries, both applied and undone; its own before/after selection
snapshots remain available. Failed, cancelled and no-op edits preserve history.
A new selection after Undo supersedes undone selection steps while preserving
undone geometry snapshots. Selection Redo in the current geometry precedes
geometry Redo; it preserves the ordinary Undo/Redo route for intervening picks.
Geometry Redo retires applied intervening selection steps and restores that
operation's result selection, so later selection Undo cannot restore targets from
the pre-Redo document. Original undone selection steps after that geometry remain
replayable when no intervening selection superseded them. A new accepted geometry
edit still supersedes both geometry Redo and all standalone selection entries.
Double-click intermediate selections need no special history grouping.

The renderer buffers completed selection intent, flushing between gestures and
before each serialized model or history request. Selection writes drain before
a geometry request starts; they do not block further local selection input. The
renderer supplies the editing workspace and ordered typed sketch and modeling
targets; the backend owns their navigation snapshots alongside the
geometry snapshots. Gesture previews and automatic result-selection updates do
not create independent selection steps. Undo restores the operation's input
selection and workspace; Redo restores its result selection. Selection history does not replay tool state, hover or chooser visibility;
ephemeral view history separately restores camera and workspace as described below. These
selection snapshots are in-memory history, not saved document content.

## Ephemeral view Undo (founder decision, 2026-10-03)

A completed view gesture adds one transient entry to the existing DocumentStore
history. It captures the before/after orthographic camera position, target, up and
view height, editing workspace and ordered geometry selection. Camera and current
UI remain renderer-owned; these serializable snapshots are contextual history
beside accepted geometry, not another document or saved file format.

Consecutive completed views form a trailing suffix of the full active history,
including undone future entries. Undo/Redo traverses each view in that suffix.
A new view after partial or full view Undo discards the entire former view suffix,
including applied and undone entries, then starts a new suffix at the visible pose.
A changed selection or accepted geometry edit removes all view entries. Moving
beyond the suffix into ordinary selection/geometry Undo or Redo also removes all
of them, including future entries. Their snapshots and diagnostic records expire;
ordinary attempted geometry/selection records retain their existing lifetimes.
No-op navigation and failed/cancelled/no-op geometry attempts preserve the suffix.
View Undo restores its prior camera/workspace/selection; view Redo restores its
result while it remains in the suffix, before older geometry Redo. Navigation never
erases retained geometry Redo. Geometry Redo still restores that operation's
result selection, and a new accepted geometry edit branches normally.
Restoration animates camera position, orientation, target and zoom through the
existing camera transition, then restores the exact endpoint. Undo/Redo animation
creates no history entry; workspace changes from geometry/selection Undo retain
their ordinary animated alignment. Reduced-motion preference remains respected.

Cube navigation, face double-click alignment, pinch/twist/touch gestures and
canonical workspace entry and exit use this contract. Ordinary pointer orbit/roll,
pan, scroll pan and mouse-wheel zoom do not record view history; they expire stale
view entries. A pointer orbit that exits a planar workspace records the full mode
transition. Continuous pointer or touch contacts complete once at
release/cancellation, after any existing completion animation. Cancellation keeps
its ordinary current view, so a moved canceled gesture can still be undone; a
stationary canceled press adds no entry. Browser pinch and native twist
reuse their existing 200 ms idle or explicit gesture-end lifetime, including
release leveling. Intermediate frames and packets add no entries. Camera pose
roundoff at the current viewport scale is not a view change. Projection range and
viewport aspect remain derived rendering data.

Workspace-driven synchronous selection clearing belongs to the view gesture.
A later independent selection finishes the preceding view intent before recording
its own change, which expires that view tip. Accepted geometry expires prior view
history; if a navigation gesture is still held when the new result is published,
its remaining movement rebases from the accepted camera and result-selection
context. Its eventual Undo cannot restore targets from the previous document.
The existing serialized selection-intent boundary also carries view intents;
there is no additional request queue or history owner.

A trailing view change inside a modal takes priority over older temporary parameter
history. View-only Undo/Redo preserves the tool, candidate and pending operation.
A later parameter edit or local parameter Undo/Redo expires the view suffix,
including undone future states. Calculating
or captured edit guards remain in force; an active captured view gesture also
blocks history navigation. Undo during an uncaptured camera animation finishes
its current visible pose before navigating. Restoring any history context
suppresses workspace/camera recording, including later animation draws. New/Open
starts fresh history and file camera restoration creates no navigation entry.
Normal Save/Open retains the existing saved current-camera format; it does not
persist view history. Automated emitted native events and SDK touch routes establish
software behavior, not physical trackpad/iPad delivery or gesture feel.

## Temporary interaction history (founder decision, 2026-10-02)

Modal modeling tools keep parameter checkpoints inside their InteractionLease.
Releasing a captured pointer, leaving a field and changing a discrete option
complete a tweak. Intermediate pointer positions and keystrokes do not create
separate checkpoints. Undo/Redo while the tool is active restore those parameters
through the controller's ordinary preview path, without accepting geometry or
leaving the tool. At the initial checkpoint, Undo cancels the temporary candidate
and exits the tool without changing accepted geometry. That press does not also
navigate document history; the next Undo follows ordinary document/selection
history, including any selection restoration recorded by the tool's existing
cancellation path. Undo remains available at this boundary through standard keyboard and
menu routes, unless the tool is calculating or holding a pointer gesture. A changed
tweak after Undo branches the local history. Unchanged focus changes preserve Redo. History navigation is disabled during held gestures
and calculations. Focused text fields retain native text Undo until defocus.

Controllers own these temporary parameter snapshots, not another geometry
document. Accepting/completing the tool still creates one backend document Undo step;
Escape discards the candidate and the local checkpoints. Ordinary edits that
already accept on release, including whole-body/sketch movement, retain that
acceptance boundary. Their numeric previews can use local history before acceptance.

This applies to Extrude (including draft, twist, axis, mode and targets), Shell, Erode,
face/edge Move, Face Offset, Fillet/Chamfer, Scale, Revolve, Loft, Mirror, Boolean,
construction-plane placement, plane cuts and cross-section placement. An active
modal tool without tweak history does not accept itself just to service Undo.
