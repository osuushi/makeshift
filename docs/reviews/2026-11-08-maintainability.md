# Makeshift maintainability and test hygiene review

## Founder summary

The best next step is a focused cleanup of edit lifecycles, duplicated contracts,
and test synchronization. Makeshift already has the right foundation: one document
owner, temporary previews, stable geometry identities, and separate calculators.
The friction comes from representing the same decision differently in several
places. A new tool behavior can therefore require changes whose relationship is
easy to miss.

The first implementation wave should do four things:

1. **Make preview states explicit.** Distinguish calculating, drawable but not yet
   acceptable, ready, limited to verified geometry, and rejected. Keep tool input,
   calculation progress, and document ownership separate. Start with Offset and
   Fillet/Chamfer and their backend preview session.
2. **Give shared rules one definition.** Stop using error-message wording to decide
   whether to search for feasible geometry. Publish script declarations from a
   deliberate public contract, and make exact script requests use the same exact
   policy as typed UI requests.
3. **Make tests wait for the outcome they assert.** Native work finishing does not
   mean a tool has finished accepting. Replace timing races with controlled
   completion, retain meaningful geometry and interaction checks, and remove only
   assertions that repeat configuration without protecting an independent rule.
4. **Correct the map developers follow.** Remove superseded interaction promises,
   document the owners of each async transition, and name numerical thresholds by
   their purpose and units. A 500-line review threshold is reasonable, but better
   state ownership matters more than moving code between files.

Most changes should preserve visible behavior. The small visible proposals are
consistent handling of unfinished numeric text, exposing supported per-axis scale
inputs to scripts, and rejecting impossible exact script requests without first
searching for a value that the script will reject anyway. Positive scripted blend
radii below the supported minimum should reject rather than silently recover a
sharp edge. The main product review point is unfinished input: an empty Mirror
offset should not draw a reference at
zero while acceptance treats the same text as invalid. I recommend hiding that
derived reference until the number is valid. Explicit zero retains its existing
meaning for each tool.

Keep the current action-switch rule: Enter on invalid input stays in the tool;
deliberately invoking another action discards an invalid released edit and
continues. An older chapter promises the opposite and needs correction. This is
a documentation repair, not a proposal to redesign tool switching.

Preserve the measurement/snap worker separation, staged preview presentation,
geometry caches, frame pacing, and documented native optimizations. No benchmark
campaign is needed for this first wave. Final QA should concentrate on rapid edits,
invalid text, cancellation, switching tools, Undo/Redo, and reselection. Further
broad research is less valuable than implementing and reviewing this bounded wave.

## Scope and evidence

This is a static review of commit
[`b1f5cd0b4a6aa20ba79d9f272e816120797a5779`](https://github.com/osuushi/makeshift/commit/b1f5cd0b4a6aa20ba79d9f272e816120797a5779),
dated 2026-11-08. No builds, tests, benchmarks, or application experiments were run
for this review. Source observations below are distinguished from predicted runtime
effects. The review samples the editing and query paths, host boundaries, native
policy, script surface, tests, and documentation; it is not an exhaustive defect audit.

The October architecture review was used as a locator, then checked against current
source. Previously identified gaps that are now covered—structural native-reply
validation, guarded host document replacement, and decorator worker-cache
invalidation—are not new implementation tasks. See [reply validation][reply-validation],
[host request authority][host-request], and [decorator preview queue][decorator-queue].

## Priorities and implementation order

| Order | Change | Scope | Expected visible effect |
| --- | --- | --- | --- |
| 1 | Repair test readiness and scheduling assumptions | Small | More trustworthy failures; no product change |
| 2 | Introduce typed failure reasons and explicit exact/search intent | Medium, includes native transport | Same modeling limits; exact script failures avoid search, and subminimum scripted blend radii reject |
| 3 | Consolidate preview state transitions in the existing owners | Medium to large, pilot on Offset and Fillet/Chamfer | Same acceptance, cancellation and Undo behavior |
| 4 | Unify the public script contract | Medium | Supported per-axis scale becomes expressible in ordinary checked scripts |
| 5 | Share numeric parsing, reconcile docs, name touched thresholds | Small to medium | Consistent unfinished-input feedback; Mirror reference handling changes |

Treat each row as a reviewed increment. The preview-state work should be split into
backend state ownership and tool-result state, with an end-to-end pilot before
extending to another tool. A rough initial allowance is one to two working days
including focused verification; revise that after the first two increments.
Do not combine a rendering rewrite, geometry-algorithm changes, or a general
scheduler with this work.

## Preview state is spread across independent fields

**Observation and confidence: high.** `DocumentSession` exposes `candidate`,
`visualPreview`, `deferredEdit`, `pendingOperation`, and `reopenedPreview` as
independently writable fields. Their relationships are maintained by assignments
in the session, owner, command dispatcher, and deferred-presentation helper.
`clearPreview`, `discard`, `replace`, navigation, and failure handling repeat
overlapping resets. These paths have intentional differences, especially failure
during Accept and reopening a previous operation, which a mechanical deduplication
would erase. See [DocumentSession][session], [DocumentOwner.execute and dispatch][owner],
and [editPresentation][deferred].

On the frontend, Offset and Fillet/Chamfer both keep `valid` and `invalid` flags.
After a successful limited search, both may be true: there is an acceptable result,
but it differs from the requested value. Other combinations mean pending work,
rejection, or a tool-specific initial state. Some guide paths require
`valid && !invalid`; ordinary acceptance requires `valid`. This is a meaningful
distinction hidden behind misleading names, not evidence that accepting a limited
result is a bug. See [FaceOffsetControls.measure and finish][offset-controls] and
[BodyEdgeFinishControls.calculate, measure and finish][finish-controls].

**Change.** Give the existing backend session a small typed preview state and
transition methods. Account explicitly for preparing work, a visual-only result,
a complete candidate, and reopened accepted work. Project the existing `ModelView`
from that state; avoid changing the public transport just to perform this cleanup.
Keep accepted geometry in `DocumentStore` and calculation ownership in
`DocumentOwner`. The kernel's retained shape remains a disposable calculation cache.
Represent a verified no-op as complete work even when its candidate is the accepted
document itself; absence of a new shape is not automatically a failed preview.

For the two pilot controllers, use named result states such as awaiting result,
exact result, limited result, and rejected input. Store requested and verified
values separately. Derive acceptance and local feedback from those states.
Do not combine result status, pointer capture, interaction lifetime, and paint
readiness into one enormous state enum: these are different responsibilities.
Preserve the useful intermediate drawing while a newer request is calculating;
only its right to be accepted is restricted. Use the existing lease and local
request identity, without document revisions or retry ledgers.

| Owner | Question it should answer | Boundary it must not cross |
| --- | --- | --- |
| Tool controller | What did the user request, and is the verified result exact, limited, or rejected? | It cannot install accepted geometry. |
| InteractionLease | Who owns input, capture, cancellation and tool completion? | It does not determine kernel feasibility. |
| PreviewRunner | Which calculation is running, and what is the latest waiting target? | It does not interpret result validity. |
| ModelClient and DeferredPreview | Has the request, paint opportunity, or metadata completion settled? | A visual reply is not accepted data. |
| DocumentSession and DocumentOwner | Which temporary operation/candidate may be accepted into the store? | Read-only query replies cannot replace this state. |
| GeometryQueries and its consumers | Which worker owns the read, and is its result still relevant? | Cancellation of snap work cannot cancel the edit calculator. |

This is a map of current responsibilities to make explicit, not a proposal for six
new layers. Sources: [interaction leases][interaction], [ModelClient][model-client],
[DeferredPreview][frontend-deferred], and [GeometryQueries][queries].

Keep [PreviewRunner][runner] as the serial calculation mechanism. It already has
one running task and one replaceable pending target. Mirror's separate
`pending/latest/running` drain is a possible later consumer, but adopting the runner
must preserve its reference picking, local history, and cancellation behavior.
Do not migrate every controller just to make them look alike.

**Acceptance.** Existing deferred-preview tests must still establish that a mesh
can draw before metadata, only complete latest geometry can be accepted, Escape
works during a paint wait, and reopening does not trigger unnecessary calculation.
Exercise late completion after Cancel, failed acceptance retaining recoverable
state, and reopened work through the owner's public operations. Assert accepted
geometry and history outcomes; avoid tests that merely assign and reread the new
state fields. Keep real pointer/keyboard coverage for the renderer-to-owner
boundary. Manual routes A and B below apply.

## Geometry decisions depend on diagnostic wording

**Observation and confidence: high.** `FaceOffsetEdit.geometricFailure` matches a
regular expression against English diagnostics. `EdgeSizeLimit.probe` recognizes
the substring `not feasible at this size`. These decide whether to keep searching
or stop. `documentFailure` also recognizes the text `Preview superseded`.
Renaming a message can therefore change control flow. See [FaceOffsetEdit][offset-limit],
[EdgeSizeLimit][edge-limit], and [documentFailure][failure].

**Change.** Introduce a narrow typed failure vocabulary at the native/application
boundary: geometric infeasibility eligible for this operation's search, unsupported
input, invalid request, cancellation, supersession, timeout, and internal/transport
failure. Preserve a separate human-readable message and validated detail such as
erosion allowance. Assign codes where the cause is known; moving the same regular
expressions into one utility would retain the problem.

Scope the initial native changes to the failures consumed by Offset and
Fillet/Chamfer. Preserve their existing geometric fallback ladder and validation.
For example, `constructEdgeFinish` already translates failures after its support,
local, and crossing attempts; that boundary needs an explicit category without
removing those attempts. See [edge-finish construction][finish-construction].

Search only for explicitly eligible geometric failures. Unknown failures must stop;
they must not become a successful smaller result. Keep Offset and edge-finish search
algorithms separate: their seeds, caching, bracketing, and stopping rules differ for
good current reasons. This is a shared failure contract, not a generic optimizer.

**Related observation.** Script finish/offset adapters call the shared operations
without forcing `limit: false`, then reject if the returned size differs. UI typed
input already takes the exact path. Scripts thus can perform a feasibility search
whose replacement value cannot be accepted. Route scripts directly through exact
intent, retaining transactional rollback and the exact-result check as a boundary
assertion. Preserve documented zero behavior. See [scriptSolidTool][script-solid],
[calculateScriptSolid][script-operation], and [exact input tests][exact-tests].

There is a concrete boundary case to verify during implementation: script validation
allows a positive blend radius below 0.001 mm, native blend resizing normalizes that
radius to zero, and the script postcheck compares offset distance rather than the
resulting radius. The static path can therefore heal a supported blend instead of
rejecting the requested microscopic radius. Forcing exact intent activates the
existing minimum-radius rejection. Treat this as an intentional behavior correction,
with a real geometry regression, rather than claiming the script change only saves
work. See [script validation][script-validation], [blend resizing][blend-resize],
and [FaceOffsetEdit.prepare][offset-limit].

**Acceptance.** Verify that diagnostic wording changes cannot enable search, that
cancel/timeouts never turn into smaller geometry, and that invalid exact script
operations leave accepted data and history unchanged. Test the routing decision
with controlled failures and retain a real captured geometric rejection. Avoid
asserting every message string. Manual routes A, C and F apply.

## Script declarations have a parallel source of truth

**Observation and confidence: high.** The in-process `ScriptApi` uses model types,
while `scriptTypes` manually repeats a public interface inside a string.
`ScaleOperation` supports optional per-axis `factors`; the standalone declaration
only has scalar `factor`. `compileScript` writes that declaration into the actual
pre-execution typecheck. A direct object literal using `factors` is consequently
outside the declared public input despite the implementation supporting it.
See [ScriptApi][script-api], [ScaleOperation][scale], [scriptTypes][script-types],
and [compileScript][compile].

**Change.** Define a deliberate, importable public script contract, use it for the
runtime adapter, and emit/package the standalone declarations from that contract.
Do not expose every internal model field automatically: interactive limiting and
experimental Boolean options demonstrate why the public surface needs an explicit
boundary. Keep the `freac` compatibility alias and both modeling/view script modes.

**Acceptance.** Compile a representative valid script through the same declaration
entry point as users, including per-axis scale; reject one invalid input and an
internal-only option. Execute a small real script and check geometry and atomic Undo.
This tests Makeshift's packaging and API agreement, not the TypeScript compiler.
Manual route F applies.

## Tests sometimes confuse idle work with completed interaction

**Observation and confidence: high.** `settled` waits for native busy, camera motion,
and startup. `modalCompleted` additionally waits for the interaction owner to exit.
The real-geometry Offset readiness regression deliberately holds the continuation
after native work ends and proves the difference. Some callers still inspect or
Undo immediately after Accept using only `inspect`, which calls `settled`; examples
include the earlier acceptance path in `ui-body-fillet` and the blend-offset path
in `ui-blend-edit`. See [UI helpers][ui-helpers], [readiness regression][readiness],
[body-fillet journey][fillet-ui], and [blend journey][blend-ui].

**Change.** Give waits names matching their guarantees and update the affected
callers: app/calculator idle, latest preview ready, modal completed, or document
replaced. Do not make every inspection wait for no interaction: many assertions
intentionally inspect an active preview. Keep readiness independent of arbitrary
sleep durations.

The [snap cancellation regression][snap-test] asserts that real snap work is still
running when a measurement finishes. That demonstrates the intended separation on
the current fixture, but it also depends on relative calculation speed. Hold snap
completion behind an explicit test barrier and assert measurement completion before
release. Keep separate real-geometry assertions for valid targets and measurement.
Use a narrow scoped seam or the existing controlled-child test pattern; no production
scheduling framework is needed for this test.

### Tests to retain and assertions to trim

The routine [UI suite inventory][ui-suites] already records an escaped integration
failure, lower-level coverage, and a bounded Electron budget. Historical feature
tours live separately. Do not add a broad browser/platform matrix or purge these
tests because they use a mock or library.

| Example | Recommendation and reason |
| --- | --- |
| PreviewRunner unit tests | Keep serial/coalescing and latest-request invariants. The test callback's own publication guard does not establish that a real controller ignores stale replies; retain owner/presentation coverage for that. |
| X-ray submitted-pass/cache tests | Keep. They test application-owned invalidation and renderer-state restoration; GPU appearance remains separate. |
| Widget projection math using Three.js | Keep. The independent legibility/geometry invariant belongs to Makeshift. Using a library is not testing that library alone. |
| Theme contrast calculated from CSS tokens | Keep. The calculation checks an independent accessibility requirement. Consider treating the hard-coded-color prohibition as lint, without adding a new framework for it. |
| Release version/provenance checks | Keep where they protect artifact identity, compatibility, or an explicit upgrade audit. A pinned version assertion can be an intentional review tripwire. |
| Exact seven-case count in CI partition tests | Remove the redundant count if no separate budget depends on seven. Retain coverage completeness, whole-name matching, and platform policy. |
| Gallery's fixed seven-slide assertions/loops | Prefer the actual inventory plus navigation/decoding invariants unless seven is an explicit product requirement. Retain real media playback and responsive-layout checks. |

Sources: [runner tests][runner-tests], [X-ray tests][xray-tests],
[widget tests][widget-tests], [theme tests][theme-tests],
[release metadata tests][release-tests], [CI partition tests][partition-tests],
and [gallery integration][gallery-test]. These are targeted changes, not evidence
that a large fraction of the suite is low value.

## Numeric drafts and numerical policy need precise names

**Observation and confidence: high on parsing; visual effect is a static prediction.**
Mirror's `queue` treats blank text as invalid, while `update` parses the same blank
with `Number`, producing zero for its reference drawing. Sketch Offset also passes
blank text through `Number`, although its single-curve geometry path rejects zero;
this is not evidence that it accepts a zero offset. Most newer controls already
guard blank input. See [MirrorControls.queue and update][mirror],
[sketch Offset input][sketch-offset], and [offsetCurve][offset-geometry].

**Change.** Use a small shared numeric parser returning unfinished/invalid/value,
then let each tool validate its quantity. The same parsed draft must drive preview
eligibility and reference drawing. Hide Mirror's derived reference for unfinished
text; preserve the text and disable acceptance. Preserve scientific notation,
signed quantities, radius/diameter conversion, and explicit zero where supported.
Do not migrate range sliders, discrete selects, or preference controls merely
because they also call `Number`.

The native [geometry policy][native-policy] already distinguishes physical units
and purposes. The TS finish minimum intentionally mirrors one native constant, and
[small-finish tests][small-finish-tests] already exercise actual boundary behavior.
Keep those tests; do not replace them with source-text equality tests.

Name thresholds in touched sketch geometry by their semantics. For example,
`loop-offset.ts` uses numerical checks on distance, area, and angle; identical
literal values do not make these one tolerance. Likewise, finish recovery,
microscopic topology removal, and generated-vertex adjustment happen to use
0.001 mm but have different contracts. Do not unify them or change values during
housekeeping. See [loop offset][loop-offset] and [numerical geometry][numerical-doc].

**Acceptance.** Test parser output only where it controls a real input contract,
then use a compact UI case to verify focus, text retention, reference display, and
acceptance. Existing geometry-boundary tests remain authoritative for tolerances.
Manual route D applies.

## Documentation and module boundaries

**Observation and confidence: high.** The newer edit-lifecycle chapter and
`completeInteraction` discard invalid released work on an explicit action switch.
The curve-modification chapter still says invalid work retains ownership and blocks
the action. Git blame dates those passages to October 8 and October 4 respectively;
the current sketch mode-switch test describes invalid/rejected cancellation.
Correct the older passage and link to the central lifecycle policy rather than
duplicating it again. See [lifecycle contract][lifecycle-doc],
[superseded passage][curve-doc], [completeInteraction][completion], and
[sketch mode-switch tests][switch-tests].

Extend the implementation map with the specific owners of preview result state,
request progress, query lanes, and script declarations. Keep detailed transition
tables in the affected architecture topics. Current contracts should not require
reading chronological review reports or benchmark logs. Historical reports retain
their dates and evidence; their old next steps do not become current instructions.

The inspected controllers are mostly ordinary classes and owned collaborators,
not a long mixin inheritance chain. `ModelClient extends ModelQueries` is a shallow
split that still exposes a broad client surface; replacing that inheritance alone
would do little to clarify the actual async states. Prioritize those states before
directory moves or a new class hierarchy.

The current source-size warnings are real: `body-edge-finish-controls.ts` is 370
lines; `offset-controls.ts` and `model-controls.ts` are 324; `world.ts` is 315;
`editor.ts` is 311; `face-offset-controls.ts` is 309. Other host/composition files
are just over 300. These are responsibility-review prompts, not a reason to create
forwarding modules. A proposed 500-line warning with the existing 80-line function
review is reasonable. Update the governing process text together if that change is
adopted; this review does not silently change the current 300-line rule.

Useful boundaries own state and behavior together: field draft/quantity conversion,
tool-specific selection refinement, serialized calculation, candidate publication,
and final acceptance. A helper that still reaches into the full editor to mutate
all of these does not establish a boundary merely by living in another file.

## Manual QA for the combined implementation

Use a final build and ordinary controls. Record unexpected choices separately from
implementation failures. The following routes are product review, not claims that
these checks have already passed.

| Route | Actions | Expected result and review focus |
| --- | --- | --- |
| A Surface edits | On a box with a cylindrical hole, type valid and impossible Offset values; use Find Nearest; correct the value; switch radius/diameter. Repeat on an edge with Fillet and Chamfer. | Exact text is never silently substituted. Search occurs only when requested or dragging. A limited verified result remains acceptable. One acceptance produces one geometry Undo step. |
| B Rapid preview and cancellation | Drag and type several values quickly; press Enter while completion is pending; repeat with Escape and with a tool switch. Reopen an accepted operation, change it, cancel, then Undo/Redo. | Latest valid geometry wins; an early mesh is never accepted as a complete body. Cancellation leaves accepted geometry intact. No stale overlay or late result reappears. Reopened values and selections remain correct. |
| C Measurement recovery | Select two faces/edges, start a Fillet snap drag, release/cancel, then reselect measurement targets. Change selection quickly, hide/show bodies, and Undo an edit. | Readouts match current accepted geometry, recover after cancelled snap work, and never overwrite editing errors or geometry. Observe a timeout only with an intentionally controlled failure in engineering verification. |
| D Unfinished numeric input | In Mirror, choose a reference, enter an offset, clear the field, type a minus sign, then enter explicit zero and a valid signed offset. Also clear sketch/solid Offset and a dimension field. | Text remains editable; unfinished text cannot be accepted. Mirror's derived reference hides instead of jumping to zero. Explicit zero follows each tool's existing rules. Tab and radius/diameter focus remain usable. |
| E Leaving a tool | With valid, invalid, and incomplete settings, press Enter; then separately choose another tool, select geometry, and invoke Undo. Browse Tools without choosing anything. | Enter preserves an invalid edit. A deliberate action switch discards invalid released work and continues; valid work uses normal acceptance. Browsing Tools preserves the draft. Existing sketch-preview Undo exceptions remain intact. |
| F Scripting | Run a small per-axis scale script, then an impossible exact Offset/Fillet script. On an existing blend, request a 0.0006 mm radius and then explicit zero. Undo the successful script. | Supported input typechecks and yields the requested geometry. The positive subminimum radius rejects; explicit zero retains sharp recovery. Failure leaves the accepted document intact. One successful script remains one atomic Undo step. |
| G Adjacent presentation | Reselect and move edited geometry; view a cross section and X-ray; inspect a decorated body; Save/Open the result. | Selection IDs, section/overlay visibility, decorators, saved geometry, and subsequent editing still agree. No obvious responsiveness regression. |

Engineering verification should use existing fast unit/native cases first, the
compact hidden Electron routes for the touched integrations, and one focused
WebKit calculator/input check if shared failure transport or numeric parsing changes.
No general platform matrix is implied. Actual platforms and gaps must be reported
with the implementation.

## Appendix on optimizations and deferred investigation

| Preserve | Why the complexity exists | Maintenance rule |
| --- | --- | --- |
| Separate edit, readout, snap and STEP work | Snap searches previously blocked readouts before their watchdog began. Current workers and queues isolate those purposes. | Preserve cancellation ownership. A ten-second measurement watchdog starts at execution, not at queue entry. |
| Mesh-first preview and one retained native shape | Useful geometry can paint before exact volume, serialization and editing metadata complete. | Complete the exact displayed shape; never treat a mesh-only reply as an acceptable document. Preserve hidden-window cancellation of paint waits. |
| Geometry-keyed caches and decorator invalidation | Derived data is expensive and worker state can outlive a request. | Keep geometry, definition, and preference dependencies in cache keys. Source text/ID alone does not establish geometric freshness. |
| Exact-volume/bounds reuse and integration conditioning | Published research documents repeated measurement cost and pathological integration axes. | Shape changes must invalidate measurements. Existing repair paths reset these fields; preserve that discipline. Do not loosen validity or error budgets. |
| GPU frame pacing and X-ray mask reuse | One pending frame and cached stationary masks avoid unnecessary GPU work and input starvation. | Preserve current camera updates before drawing, invalidation, renderer-state restoration, and the fresh-request starvation fix. |
| Validated native specialization | Shell, sweep, loft and topology repair contain geometry-specific correctness and performance work. | Keep those boundaries intact; similar-looking branches are not interchangeable without geometric evidence. |

Evidence and current contracts: [measurement ownership][measurement-doc],
[GeometryQueries][queries], [preview presentation][preview-doc],
[decorator preview queue][decorator-queue], [Result measurement lifetime][kernel-result],
[small-finish invalidation][small-finishes], [microscopic repair invalidation][microscopic],
[FramePacer][frame-pacer], [X-ray cache tests][xray-tests],
[source-pinned performance results][performance-results], and
[WASM/native investigation][wasm-results]. Historical timings establish why these
paths deserve care; they are not measurements of today's checkout.

Two follow-ups do not justify broadening the first wave. Measurements still share a
readout queue with sections and geometry-export preparation; the snap fix does not
promise that every readout is independent. A controlled queued-work test could
establish a reported delay before changing scheduling. Separately, native `Result`
keeps mutable shape and optional cached measurements together: an eventual finalized
result boundary could make invalidation safer, but the inspected repair paths
already invalidate their caches. Neither observation establishes a reproduced bug.

A small transport inconsistency can be handled with typed failures: desktop
`NativeCalculator` recognizes an empty-string error envelope, while the WASM
adapter uses truthiness. The latter can pass that envelope onward instead of
rejecting it at the same boundary. Downstream validation may reject it; this review
does not claim corrupt geometry is accepted. Cover the error-envelope contract
without merging process termination and Worker termination into one abstraction.
See [native calculator][native-calculator] and [WASM calculator][web-calculator].

No performance experiment is required to start. If a later cleanup touches an
optimization in this appendix, isolate that change and use its existing targeted
fixture/comparator after reviewing the reason for the optimization.

[session]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/document-session.ts
[owner]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/document-owner.ts
[deferred]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/deferred-edit.ts
[offset-controls]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/model/face-offset-controls.ts
[finish-controls]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/model/body-edge-finish-controls.ts
[runner]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/model/preview-runner.ts
[offset-limit]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/face-offset-edit.ts
[edge-limit]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/edge-size-limit.ts
[failure]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/document-failure.ts
[script-solid]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/script-solid-tools.ts
[script-operation]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/script-operation.ts
[exact-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/exact-surface-input.test.ts
[script-api]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/agent-script/api.ts
[scale]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/model/scale.ts
[script-types]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/agent-cli/script-types.ts
[compile]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/agent-cli/compile-script.ts
[ui-helpers]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/ui-helpers.mjs
[readiness]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/face-offset-readiness-ui.mjs
[fillet-ui]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/ui-body-fillet.mjs
[blend-ui]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/ui-blend-edit.mjs
[snap-test]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/snap-query-cancellation.test.ts
[ui-suites]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/scripts/ci-ui-suites.mjs
[xray-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/xray-composite.test.ts
[widget-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/widget-projection.test.ts
[theme-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/theme-contrast.test.ts
[release-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/release-metadata.mjs
[partition-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/ci-partition.mjs
[gallery-test]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/website-gallery.mjs
[mirror]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/model/mirror-controls.ts
[sketch-offset]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/offset-controls.ts
[offset-geometry]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/offset-geometry.ts
[native-policy]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/native/kernel/geometry-policy.h
[small-finish-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/small-finishes.test.ts
[loop-offset]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/loop-offset.ts
[numerical-doc]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/docs/architecture/numerical-geometry.md
[lifecycle-doc]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/docs/architecture/edit-lifecycle.md
[curve-doc]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/docs/architecture/curve-modification.md
[completion]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/complete-interaction.ts
[switch-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/ui-mode-switch-sketch-previews.mjs
[measurement-doc]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/docs/architecture/measurements.md
[queries]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/geometry-queries.ts
[preview-doc]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/docs/architecture/preview-presentation.md
[decorator-queue]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/decorators/preview-queue.ts
[kernel-result]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/native/kernel/kernel.h
[small-finishes]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/native/kernel/small-finishes.cpp
[microscopic]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/native/kernel/microscopic-topology.cpp
[frame-pacer]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/frame-pacer.ts
[performance-results]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/docs/research/geometry-performance/results-overview.md
[wasm-results]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/wasm-performance/README.md
[native-calculator]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/native-calculator.ts
[web-calculator]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/web/calculator.ts
[reply-validation]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/kernel-reply-validation.ts
[host-request]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/host/model-request.ts
[interaction]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/active-interaction.ts
[model-client]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/model-client.ts
[frontend-deferred]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/sketch/deferred-preview.ts
[finish-construction]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/native/kernel/edge-finish-construction.cpp
[script-validation]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/src/backend/script-validation.ts
[blend-resize]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/native/kernel/blend-resize.cpp
[runner-tests]: https://github.com/osuushi/makeshift/blob/b1f5cd0b4a6aa20ba79d9f272e816120797a5779/tests/preview-runner.test.ts
