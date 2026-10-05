# Agent shell proposal

2026-09-20 founder discussion. This records requested direction and proposed
implementation boundaries; it is not a claim that every proposal is delivered.

## Requested experience

Bring your own terminal harness, initially a user-installed Codex. Preferences
specify executable, arguments and environment, with an isolated Codex preset and
an explicit ordinary-environment option. Other presets, Claude-specific support,
Git, detached windows and future body/tab organization are deferred.

Codex setup verifies an existing executable and its `--version` before launch.
The default command checks the prepared PATH, the standalone user installation,
and, on macOS, known installed ChatGPT application locations. Application bundle
layout is a discovery candidate, not a packaging guarantee. An explicit configured
path is never replaced on failure; Custom retains its ordinary executable semantics.
The current minimum is CLI 0.155.1, the existing Makeshift runtime/portability baseline;
version recognition does not guarantee compatibility with every future CLI change.
Windows npm `.cmd`/`.bat` candidates use a fixed system `cmd.exe` invocation for
`--version`; native executables use a direct process. Wrapper paths containing
quotes, newlines or command expansion/metacharacter hazards are rejected with a
native-executable/standalone-install alternative. The quote plan follows
[Node 24.15 process guidance](https://nodejs.org/download/release/v24.15.0/docs/api/child_process.html#spawning-bat-and-cmd-files-on-windows)
and [Microsoft cmd rules](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd);
actual Windows execution remains unverified.

Find/Install/Cancel/Retry controls remain machine-local, outside drawings and
Undo. An unchanged default `codex` field can bind a verified discovery result; explicit
paths and edits made while setup runs remain intact, with **Use found CLI** as a
separate choice. Save settings persists the current form and closes it; the terminal
header’s existing Start/Stop controls own launch and termination. There is no
second Launch button in setup. Install is hidden after discovery or ordinary
launch verifies an existing CLI, and for Custom. Install is an explicit
user action using the official standalone vendor script
for macOS/Linux or Windows, with its normal user installation and PATH effects.
The host owns a bounded, cancellable child process, fixed vendor URL and direct argument
array; setup never accepts shell commands or download URLs from the renderer. Ordinary
modeling and document replacement remain available; conflicting agent launch/configuration
waits for installation, and application shutdown cancels and drains it. After verification,
Launch uses the existing separate Makeshift Codex configuration and ordinary CLI sign-in.
App credentials are not copied or assumed to authenticate the CLI. Development acceptance
uses temporary injected downloads/processes only; no vendor installer runs on the developer
machine. Windows/Linux runtime acceptance remains separate from platform plan tests.

The terminal docks right or below, resizes and collapses to a visible header.
Collapsing preserves the process and output; stopping is a separate action.
Founder accepted session continuity on 2026-09-20: collapse keeps the agent running,
document close stops it. The 2026-09-20 review supersedes explicit initial Start:
opening Agent launches the configured harness immediately.
Initially one document owns one agent workspace/session. Future tab scope must be
explicit; changing UI focus must never silently retarget a running agent.

Founder requested suppressing the directory-trust prompt on 2026-09-20. The Codex
preset passes a launch-local `projects` override marking only the canonical current
Makeshift workspace trusted, using the documented
[project trust setting](https://developers.openai.com/codex/config-reference/).
The preset also passes `project_root_markers=[]`, which confines project-config
discovery to the launch directory. This prevents a Git repository above the
workspace (including a home-directory dotfiles repository) from becoming its
project boundary. Custom launches are unchanged. Sandbox and approval settings
remain separate from this trust setting.

The document carries notes, decisions, scripts and optional project skills.
Makeshift supplies concise AGENTS.md guidance, API types and discoverable CLI help.
Basic inspection belongs in these defaults; specialist modeling recipes may become
skills. No MCP is needed for the local application interface.

## Proposed storage and lifecycle

Keep three distinct locations:

- Machine-local preferences, base harness configuration and credentials.
- Document-owned workspace files and conversations, unpacked into a private working directory.
- Regenerable Makeshift CLI/API documentation and temporary render/script output.

The [portable workspace contract](persistence.md#portable-agent-workspace) defines
version-2 ZIPs with model JSON, workspace files and Codex conversation records;
version-1 model-only files remain readable. Save/Open/Save As preserve all portable
bytes. Files and conversations participate in dirty-state tracking outside geometry
Undo. Model ownership and snapshot Undo remain unchanged.

Each document has a local Codex home outside its workspace. Only its session JSONL
records travel; auth, configuration, indexes and caches stay local. Opening Agent
resumes the most recently active main CLI conversation using its UUID and the new
working directory. A new local profile must use that machine's authentication.
Opening a CAD file alone never launches a process. Runtime compatibility is checked
against Codex 0.155.1; there is no claim of a version-independent Codex export format.

## Harness and terminal

Area 1 implementation uses `src/agent/` for the shared canvas dock and
`src/host/agent-*` for desktop settings, document-bound working directories and PTY
lifecycle. Ghostty-web 0.4.0 and node-pty 1.1.0 are pinned npm dependencies; package
licenses were reviewed (MIT), with no upstream source copied. The terminal library
loads on demand. The npm postinstall prepares the shipped macOS spawn helper.
Linux/Windows runtime claims await their own builds and checks.

The Codex preset creates a separate CODEX_HOME with file credential storage by
default, removes inherited CODEX_/OPENAI_ overrides before applying explicit user
environment rows, and disables discovered personal `.agents/skills` through launch
configuration. HOME is unchanged; admin policy/built-ins still apply. This is
configuration separation, not filesystem isolation. Authenticated skill discovery
and login remain founder review items. Custom inherits the ordinary environment.

The first Agent launch allocates a retained private document directory. Stop preserves
it; New/Open/Close stops the process before final capture or replacement. Area 2 adds
portable files and conversations. Settings and environment values remain machine-local.
Conflicting lifecycle calls return busy; terminal ownership does not block ordinary modeling.
Area 3 adds generated orientation and a document-bound status connection below.

Use a PTY in the desktop host, with a narrow preload interface for bytes, resizing
and lifecycle. Spawn executable plus argument array directly. Prepend Makeshift's tool
directory to PATH and pass a private document-bound endpoint through environment.
Child CLI calls inherit scope; no document/session identifiers in normal commands.
On macOS, recover PATH from the user's interactive login shell before resolving
the executable, so Finder launches find shell-installed tools too. Read only PATH
from that shell; retain the configured environment isolation and launch the harness
directly. Explicit PATH preferences bypass discovery. Discovery runs asynchronously
with a five-second limit and falls back to the inherited PATH on failure.
The endpoint expires with its document, uses a local capability, and never falls
back to whichever document is now active. Keep native APIs out of shared frontend.

Candidate: `coder/ghostty-web`. Source observation: its
[CanvasRenderer constructor](https://github.com/coder/ghostty-web/blob/1858a5947767a3e1c9e98dbf53b2ff87fedb2aab/lib/renderer.ts#L128)
uses Canvas 2D; its [README](https://github.com/coder/ghostty-web/blob/1858a5947767a3e1c9e98dbf53b2ff87fedb2aab/README.md)
describes the Ghostty WASM parser and MIT license. This matches the requested
canvas approach. The implemented terminal uses Ghostty-web and node-pty;
[the development guide](../development.md#agent-terminal-checks) describes its runtime checks and limits.

Official [configuration documentation](https://developers.openai.com/codex/config-advanced/)
places config and local state under CODEX_HOME. Set it to Makeshift-owned application
data. [Skill discovery](https://developers.openai.com/codex/skills/) also includes
HOME/.agents/skills and admin/system locations: CODEX_HOME alone is not full skill
isolation. Verify supported discovery controls against the installed CLI before
promising isolation; don't casually change HOME for every child tool. Explicit
skill disabling is documented, but completeness must be tested. Managed policy
still applies. Environment separation is not an OS sandbox.

[Authentication](https://developers.openai.com/codex/auth/) supports file, keyring,
auto and ephemeral storage. Start with login inside Makeshift's configured environment;
never automatically copy personal credentials or archive them. Verify keyring
behavior with the supported CLI. Test propagation of CLI endpoint variables and
PATH through Codex's shell environment policy and sandbox.

## Inspection, scripting and model ownership

Proposed commands: `makeshift inspect`, `makeshift selection`, `makeshift render`,
`makeshift run script.ts`, and `makeshift help`. Return compact structured data with stable
IDs, units and explicit errors. Selection includes ordered point/curve/face/body
targets separately from render-owner IDs. Instructions explain that “this” usually
means the current selection; a command reads selection at invocation, then retains
those explicit targets through the edit.

Render current view without changing camera/selection. Add isolated body contact
sheets with named views, stable-ID labels and a legend, then focused views and
section inspection. Report clipping plane, orientation and whether a section is
visual clipping or exact geometry. These are inspection results, not document edits.

Supply a small public TypeScript API with JSDoc/types plus examples. Explicitly
typecheck before executing; type declarations on disk aren't automatically loaded
into model context. Run user scripts in a separate CLI child process that inherits
the harness's permissions, not in the renderer or DocumentOwner process. Runtime
validation remains necessary even after checking.

Scripts call the same typed operations and kernel as manual tools. Founder accepted
the first contract on 2026-09-20: one script modeling transaction, automatically
accepted on success and undone once when it changes geometry; exceptions,
invalid geometry or cancellation discard its candidate. Filesystem/network side
effects are outside geometry Undo. Acquire exclusive edit ownership for the bounded
transaction, keep repaint/navigation alive and expose Cancel. While Codex merely
thinks or writes files, manual modeling stays available. Active manual previews
return a clear busy response. No revisions, retry ledgers or second app document.

TODO, explicitly deferred by the founder: group modeling changes from one user/agent
turn into one Undo step. This requires harness-specific lifecycle hooks; the first
increment does not infer turns from terminal output or group separate script runs.
Read-only and no-op scripts create no navigable Undo step.

## Proposed delivery sequence and review

Founder accepted the following planning breakdown after rejecting the earlier
overlarge “usable agent loop” step. These are separate design/delivery areas, not
permission to implement the entire sequence before review.

| Area | Deliverable and review route | Depends on |
| --- | --- | --- |
| 1. Terminal and harness launch | Configure and launch Codex; dock, resize, collapse, reopen, interrupt and stop while manual CAD remains usable. Review terminal feel and preferences. | Minimal document-bound working directory and explicit lifecycle below |
| 2. Document workspace | Notes/scripts survive Save/Open/Save As; file-only edits trigger unsaved-work handling. Review portability and close/recovery behavior. | 1; archive/storage decision |
| 3. Agent orientation | A fresh harness discovers Makeshift instructions, help and API files through its environment; an old process cannot reach a replacement document. | 1–2 |
| 4. Basic inspection | Select a face manually, ask what “this” is, inspect dimensions/IDs and obtain the current viewport image without changing the model. | 3 |
| 5. Typed scripting | Type error leaves geometry untouched; a valid script creates geometry or edits selected geometry; cancel/failure, Undo/Redo and subsequent manual editing work. | 4; script transaction review |
| 6. Richer visual inspection | Agent examines isolated bodies, labeled views and sections to answer a concrete geometry question. | 4; can precede some scripting expansion |
| 7. iPad integration | Use the same desktop-hosted session over LAN; verify terminal keyboard/touch, resize and reconnect on physical iPad. | Stable host/frontend boundary from 1; full useful loop from 2–5 |

Future per-tab/body scopes, specialist skills, other presets and detached windows
remain outside these increments. Stage 7 adds the authenticated desktop transport;
it does not require a general remote hosting platform.

## First design: terminal and harness launch

Proposed interaction for review:

- An Agent button reveals the dock. Default placement is right; its header offers
  Right/Bottom placement, settings and collapse. Remember placement and size locally.
  Use a draggable splitter and keep the CAD area usable at the minimum pane size.
- Opening Agent immediately launches the configured harness (Codex by default). Preferences
  contain preset (Codex isolated / Custom), executable path, argument list and
  environment rows. Show the resolved working directory and isolated state location
  as explanatory details. Codex is installed by the user, never downloaded implicitly.
- Initial launch and subsequent Start launch directly in the document working directory.
  Codex owns its login, model choice and approval interaction inside the terminal.
  Missing executables and process exit show an actionable message and Start again.
- Collapse leaves a compact Agent header with Running/Exited status and an output
  activity indicator. Raw terminal bytes cannot reliably tell us “thinking” versus
  “waiting for approval,” so do not invent semantic status from terminal text.
- Ctrl-C is delivered to the terminal. A separate Stop action terminates the process
  tree and retains visible scrollback. Restart is an explicit stop/start operation.
  Changing preferences affects the next launch and never silently restarts a process.
- Terminal focus captures typing and editing shortcuts so they do not alter CAD.
  Returning focus to the canvas restores modeling shortcuts. Copy/paste, text
  selection, Unicode/IME and resize must work with the actual Codex TUI.
- Initial dock opening starts the harness; expanding a collapsed dock preserves it. Opening a CAD file does
  not start an agent. One live session per document initially; stopping does not
  promise harness-level conversation resumption.

No geometry mutation or Undo is introduced by area 1. Its usable review checkpoint
is an actual Codex conversation alongside ordinary manual modeling. Areas 3–5 add
the model interface; terminal completion is not agent modeling completion.

## First design: workspace lifecycle

Proposed transitions, including the dependency between areas 1 and 2:

| Action | Workspace and process behavior |
| --- | --- |
| New untitled document | Allocate a fresh private directory on first Agent use. Never use the app source checkout or user's ordinary project as cwd. |
| Save | Keep the same directory/process; save a stable snapshot of portable files with accepted geometry. If files change during capture, report that Save could not finish and retain dirty state. |
| Save As | Write another archive and adopt its identity; keep the live directory and session. This does not clone a running agent. |
| Open another document | Validate the incoming archive first. Resolve unsaved work in the old document; stop its process and expire its CLI binding before replacement. Cancel retains the old document/workspace. |
| Close or Quit | Stop/revoke the agent first and capture final writes, then use only ordinary Save/Don't Save/Cancel when dirty. A clean document closes directly. Cancel retains the document/files with the agent stopped. Founder decision 2026-09-20 removes the separate running-agent warning. |
| Unexpected exit | Retain the working directory for recovery; never remove potentially unsaved files just because no archive path exists. Recovery UI is designed with area 2. |

For a document replacement that saves, quiesce agent writes before final capture
and recheck dirty state. Do not let a process write after the final saved snapshot
and then silently discard those files. A failed save keeps files and the current
document, although a stopped process may need explicit restart.

Area 1 delivered the retained local directory and process ownership. Area 2 adds
archive persistence and replaces its temporary local-only labeling.

Storage is ZIP with model JSON and workspace files when portable content exists. Portable
content includes project notes, scripts and custom skills; generated API/help files
can be rebuilt from the installed app. Machine preferences and credentials never
travel with the CAD file. Conversations do travel with it, as explicitly accepted
by the founder. Include saved conversation round-tripping in area 2 acceptance;
do not treat portable conversation support as a later optional feature.

Acceptance uses actual Codex and real pointer/keyboard modeling: launch/login,
resize, paste, interrupt, collapse/reopen, selection, image inspection, script type
error before mutation, valid edit, cancellation, Undo/Redo and manual re-edit.
Save/Open/Save As preserve workspace bytes; file-only changes trigger unsaved-work
handling. New/Open cannot redirect an old CLI. Test Chromium/WebKit and hidden
Electron; physical iPad keyboard/IME/selection and reconnect are separate gates.
Check Linux/Windows PTY builds and dependency licensing before claiming support.

Scope estimate: area 1 starts with a bounded PTY/canvas compatibility increment,
then preferences/docking/lifecycle and acceptance. Aim for an interactive terminal
within one session; reassess after 30 minutes without interaction progress. Native
PTY packaging and keyboard compatibility determine the remaining estimate.
Area 2 is a separate persistence increment; later areas are estimated after their
API/interaction designs, not assigned a misleading single-step estimate now.
Session continuity and live orientation are accepted; area 4 inspection is delivered.
The founder authorized proceeding to area 5 with the per-script contract above;
authenticated inspection remains unverified.
Conversation portability is settled; archive layout and harness state mapping are
designed in area 2. Per-script Undo policy is accepted for area 5.

## Delivered orientation contract

The founder authorized area 3 on 2026-09-20 before completing authenticated area 2
review. First launch creates workspace `AGENTS.md` only when absent; existing user
guidance is never overwritten. This portable file participates in file dirty state,
not geometry Undo. Generated CLI/help/types live in a private temporary directory
outside the archive. The launcher uses the app's Electron runtime as Node, so the
user does not need a separate Node installation.

`makeshift help`, `makeshift docs` and `makeshift types` describe the installed interface.
`makeshift status` returns JSON with drawing name, saved/edited state, millimeter units
and available commands. Area 4 adds the inspection commands below; script APIs
remain later work. The declarations do not promise an unimplemented modeling API.
PATH and `MAKESHIFT_CLI`, `MAKESHIFT_DOCS`, `MAKESHIFT_API_TYPES` expose command and documentation
locations. The Codex preset supplies launch-local `developer_instructions` and
`shell_environment_policy.set` entries using the official
[configuration interface](https://learn.chatgpt.com/docs/config-file/config-reference).
This also provides orientation when an existing AGENTS.md or resumed conversation
has different guidance. Makeshift does not overwrite the stored harness configuration.

Each launch has a new private temporary file channel and capability. Requests have
bounded size and timeout; the host accepts explicit inspection and script commands. It checks the captured
workspace identity before reading document status. Stop/restart, replacement and
recovery revoke the channel before proceeding; no current-document fallback exists.
Save As keeps the binding and updates its reported name. Native document ownership
and geometry Undo are unchanged. This is process scoping, not isolation against
other software running as the same OS user.

The Codex preset defaults each launch to workspace-write, on-request approvals and
automatic approval review (Approve for me). Explicit user arguments follow these
defaults and can override them; Custom is unchanged. Fresh and resumed launches
explicitly select the current workspace. MAKESHIFT_WORKSPACE and launch guidance direct
file edits into that portable directory, not a remembered absolute path or its
parent containing application state. Saved harness configuration is not rewritten.
The file channel works in Codex 0.155.1's workspace-write sandbox without network
exceptions. Explicitly restricted temporary directories can require the harness's
normal permission flow. Automatic review does not enlarge the sandbox boundary.
Help/docs/types need only read access. Local sockets were rejected by the tested
default sandbox, so this increment does not depend on socket permissions.

## Delivered basic inspection contract

Agent guidance treats "this"/"these" as the specific current selection unless the
user gives another scope: sketch parts, sketches, faces, edges, bodies, or a mixture.
Agents must preserve target types and bounded extents, without silently promoting
parts to owners or dropping mixed targets. Selection is a reference aid, not an edit
prerequisite: follow-ups retain the conversational target and may explicitly change
the earlier scope. Agents inspect their previous work and current geometry before
asking; empty selection or multiple axial sections alone do not require reselection.
Only material ambiguity remaining after inspection requires a specific clarification.
A fresh selected cylindrical face does not imply the entire body's length.
This rule appears in launch guidance and current CLI docs, including resumed agents.

`makeshift selection` reads the renderer's current ordered explicit targets and selected
world point coordinates. It never substitutes render-owner IDs for whole-curve
selection. `makeshift inspect` returns a compact body/sketch inventory; `makeshift inspect ID`
describes accepted bodies, faces, edges, sketches, curves or editing groups. The
host reads geometry from DocumentOwner, not from a second document store. Raw BRep,
triangles and display signatures are excluded. Sketch coordinates carry their plane;
body bounds are conservative kernel bounds. One or two measurable targets use the
existing kernel measurement path, including its units, approximation flag and errors.
Other selection shapes return geometry with no invented measurement.

A narrow preload request/reply reads renderer-owned selection/camera/visibility.
Requests reject active edits, camera transitions, file operations and a changed accepted
document during an asynchronous read. Existing per-launch revocation remains in force.
Queued redraws, including decorator fades, do not count as camera movement.
No document revisions, retry ledgers or concurrent model mutation are introduced.

`makeshift render` uses the normal composed viewport, including available decorator
previews and sketch foreground passes, to produce a PNG bounded to
2048 pixels on the longest side, without changing camera, selection or history.
HTML controls/labels are excluded; geometry selection highlights remain. Its JSON
includes camera basis/frustum, hidden entity IDs and visual clipping equations.
Visual cutaway is explicitly not an exact geometric section. Images are private
temporary launch files, not portable workspace files; agents may copy an image into
the workspace when requested. The CLI prints the absolute path for an image-viewing tool.

Launch guidance directs resumed agents to current installed help, superseding old
capability notes without overwriting user AGENTS.md. CAD keyboard registration
ignores the agent dock before capture handlers act; terminal Enter/Escape must not
accept/cancel an active model operation. Native Command-Q still belongs to the app.

## Delivered first scripting contract

`makeshift run script.ts` snapshots one source file, checks it using the bundled pinned
TypeScript compiler and the same declarations printed by `makeshift types`, then runs
the emitted module in a CLI child. That process inherits the harness's sandbox;
arbitrary script code never executes inside DocumentOwner or the renderer. Source
stays in the portable workspace; compiler output lives in a temporary directory.
Additional source files/relative imports are outside this first API.

The global `makeshift` API exposes awaited `createSketch`, `extrude`, `revolve`,
`moveFaces`, `offsetFaces`, `transformBodies`, `constructionPlane`, `deleteConstructionPlane`,
`splitBody`, `imprint`, `scale`, `sweep`, `booleanBodies`, `finishEdges`, `shell` and `erode`. It returns explicit generated sketch/profile/body/topology IDs
for later calls. Sketch creation accepts ordinary segments, circles, arcs and cubic
Béziers on an explicit plane; it infers no constraints. Runtime validation and the
existing solver/kernel validate every operation. Unachievable face offsets reject
instead of silently accepting a smaller value.
`moveFaces` takes stable body/face IDs and a world transform, then uses the same
shared boundary reconnection as manual Move. Rejected boundaries abort the script
transaction.

Construction planes take an evaluated frame and optional existing ID; omit the ID
for a new plane. Deletion and repositioning do not affect sketches that copied the
frame. Overview/ID inspection exposes saved planes. Split takes body targets;
Imprint requires explicit face sets and preserves support surfaces/material. Both
use an infinite evaluated plane, without a persistent reference dependency.
Scale shares manual curve/sketch/body/face/edge edits, including constraint rejection,
positive factors and world-space pivots. It returns refreshed sketch/profile IDs
alongside body topology for subsequent calls. Extrude exposes symmetric total depth.
These operations share script rollback, acceptance and Undo; there is no UI tool activation.

Existing-sketch profile discovery uses the same current region calculation as
creation and solid input resolution. Overview, whole-sketch selection and sketch-ID
inspection include `profiles` with directly usable `{sketch, profile}` source fields,
area in mm², and outer/hole spans referring to curve IDs. Span parameters are radians
for circular curves and 0–1 for segments/Béziers; reversed ranges retain traversal.
Open sketches return an empty list. Agents select the intended current region and
must not synthesize profile keys from IDs or indexes. After editing, inspect again
or use refreshed operation results. Inspection is read-only and creates no history.
Missing source sketches and unmatched current region keys have separate errors;
an unmatched key is not assumed to have been valid in an earlier document state.

Revolve exposes the existing manual `Revolution` operation, including continuous
constant-pitch helical sweeps and Boolean modes/explicit targets. The axis lies in
the section plane; signed angle is degrees and height is total axial travel in mm.
Matching angle/height signs give right-handed screw motion about the oriented axis.
This is a general section sweep, not an automatic standard-thread generator. The
agent must not infer missing manual tools from incomplete script coverage, invent
an enable-tool step, or substitute disconnected rings for a requested helix.

### Existing solid tools in scripts

`booleanBodies`, `finishEdges` and `shell` call the same SolidEdits handlers as
manual Boolean, Fillet/Chamfer and Shell. Ordered Boolean operands retain the first
body as the subtraction base. With keepOriginals, subtract retains cutter bodies;
union/intersect retain all originals alongside the result. Returned bodies include
retained and unaffected bodies; generated topology uses ordinary stable IDs.

Edge finishes take explicit body/edge pairs, mode and size. The kernel's tangent
contour behavior remains shared with manual tools. Zero is a no-op; negative,
nonfinite and unachievable sizes reject. The script must achieve its exact requested
size: it discards a clamped manual result and reports failure. No second finish
implementation or unchecked approximation is introduced.

Shell takes a per-body opening-face list (empty means closed hollow) and signed
thickness: negative inward, positive outward. It preserves current native surface
support and collapse checks, with no thickness clamp. Unknown/duplicate targets
reject before calculation. All calls share script atomicity, cancellation and Undo.
These additions do not complete the broader command-catalog/control parity design.

`erode({ids, thickness, method, meshDetail, maxFaces, allowance, keepOriginals})`
creates independent cavity copies and retains originals by default. Remesh (the default)
uses target thickness, mesh detail and a CAD face budget; its thickness is approximate.
Analytic uses minimum thickness and nonnegative extra allowance, both in millimeters.
Cavities may split or disappear, but construction failures reject. Returned bodies
include retained originals, unaffected bodies and new cavities. See
[erosion](erosion.md) for defaults, conversion quality and verification limits.


### Mathematical path sweep

`makeshift.sweep` takes ordinary profile/planar-face sources and 1–256 ordered world-space
line or cubic Bézier segments, plus the same Boolean modes and explicit targets as
Extrude/Revolve. Endpoints coincide within 1e-7 mm; adjacent tangents must agree.
Smooth closed paths are supported. The initial path point lies in the section plane
and its tangent is perpendicular to that plane. No automatic profile relocation,
sharp-corner treatment, custom roll law or fixed-world orientation is inferred.

OCCT MakePipeShell's corrected-Frenet mode transports the section with reduced twist;
this is not a promise of an exact rotation-minimizing frame. See the documented
[SetMode contract](https://www.occt3d.com/dev/doc/refman/html/class_b_rep_offset_a_p_i___make_pipe_shell.html).
Initial profile placement is retained, including holes. The kernel sweeps outer
and inner boundaries, subtracts cavities, and validates positive oriented solid
volume, BRep validity and self-interference before applying requested Booleans.
Swept surfaces are kernel approximations, not polygonal solids. Degenerate paths
or invalid/self-intersecting swept solids reject the script atomically.

The path is only operation input. Scripts can calculate its control points directly;
no path entity or source-feature dependency is saved. Accepted bodies support the
ordinary manual selection, movement, editing, history and archive routes.

DocumentOwner owns one temporary script candidate through `ScriptEdits`. A bounded
`ScriptSession` binds it to one invocation and launch, captures ordered selection
once, and acquires renderer editing exclusion only after checking manual gesture
state. The accepted document stays unchanged until success. The existing store then
accepts once; failures/cancellation discard the candidate and preserve Redo. Failed
runtime attempts retain diagnostics. No-op/read-only scripts add no navigable Undo.
The script API never creates a second accepted document or an independent history.

The viewport keeps repainting and navigating with a Running agent script indicator
and Cancel script button. Escape outside the terminal and terminal Ctrl-C can cancel.
Quit/Close cancels before ordinary save handling. Stop/replacement revokes the launch.
The runner checks connection health; missing heartbeats release the candidate within
five seconds, including during native calculations. Limits are 15 minutes per script,
100 modeling calls, 1000 curves per sketch and 256 KiB source/request payloads.
Each native calculation has a five-minute watchdog. Agent replies outlive the
corresponding operation budget by 15 seconds. Authenticated poll/cancel messages
can pass during a pending calculation. If session cleanup makes a heartbeat fail
before an in-flight operation error arrives, the runner reports the operation error.
A successful operation does not suppress an observed connection failure.
Status reads metadata independently;
inspection and modeling commands acquire one asynchronous lock because inspections
share one measurement worker. Overlapping requests wait rather than returning busy.
At most 16 commands may wait/run; status and script poll/cancel bypass the lock.
Queued requests are discarded when their caller removes the request or the connection
closes. Ordinary CLI replies allow 15 minutes plus grace for waiting and execution.
Help/docs/types are local CLI reads. Application-level edit ownership still applies.
The public API requires sequential calls. Filesystem/network effects are not undone.
Harness-specific turn grouping remains explicitly deferred.

## Full CAD interface: agreed scope and implementation design

The founder's 2026-09-20 scope is **all CAD operations and document controls**,
including selection, camera, visibility and export. The delivered scripting
methods are documented above; the following remains implementation design, not
an available complete API or a claim of parity.

Introduce one typed command catalog used by manual controls and the agent. Each
entry owns its stable name, validated input/result, availability rules, effect
(geometry, view, read or document lifecycle) and shared handler. Installed help,
types and command discovery derive from that catalog. CLI commands and script
calls are adapters to it; neither maintains a separate operation implementation.
Keep the current narrow document-bound transport, not arbitrary renderer execution.

| Family | Required coverage |
| --- | --- |
| Sketch creation and editing | Planes/workspaces; line, rectangle, circle, arc and cubic curves; points and groups; dimensions and constraints; Fuse/Unfuse; move/rotate/resize; trim, offset and corner edits; projection; placement/merge; delete/clear |
| Solids | Extrude including draft and Boolean modes; revolve; Boolean bodies; face offset; body/face/edge movement; fillet/chamfer; shell; cleanup and topology deletion |
| Selection and inspection | Ordered point/curve/region/sketch/body/face/edge targets; select/clear; inspect, measurements and viewport capture |
| View and interaction | Enter/exit sketch planes; camera orientation, pan, zoom and fit; per-entity/global visibility; grid snapping; explicit tool accept/cancel |
| Document | Status, history, Undo/Redo, New/Open/Save/Save As/Close/Quit; portable files and conversations; existing STL/3MF export |

Reuse DocumentOwner and its solver/kernel handlers for geometry. Extract sketch
recipes currently constructed in renderer controllers into shared operations:
exposing a generic full-sketch replacement does not count as Trim or constraint
parity. Pointer gestures supply parameters and previews to those same recipes;
agents supply explicit IDs and values. Do not recreate gesture simulation in the
agent or infer point selection from owning curves. Respect existing unsupported
geometry and return the same errors through either entry point.

Geometry commands inside a script operate on its temporary candidate and commit
once. A standalone geometry command is a one-command script. Selection/camera/
visibility stay renderer-owned and outside geometry Undo. Document replacement,
Undo/Redo and file writes run outside a geometry transaction. New/Open/Close/Quit
must finish their reply/transition without waiting for an endpoint that the same
transition is revoking; the old connection never attaches to the replacement.
Use the ordinary unsaved-document decisions. File reading/writing for explicit
agent paths must retain the calling harness's permissions; do not turn Electron
into an unrestricted filesystem proxy. Export uses the same mesh serialization
as manual export, with output written by the sandboxed CLI.

Parity is enforced at two levels. First, exhaustively classify ModelRequest and
DocumentCommand variants and require each production CAD control/menu/shortcut
registration to reference a catalog operation (gesture-only mechanics map to its
operation). Second, each operation needs paired real-input and CLI acceptance
covering its result and applicable subsequent editing/Undo. A new registered
control without an agent mapping or acceptance case fails checks. A hand-written
allowlist alone cannot guarantee that an unregistered new UI feature is covered;
the UI registration migration is part of completion, not optional follow-up.

Implementation order is shared solid commands through both entry points, shared
sketch recipes, renderer-owned view/selection commands, then lifecycle/export and
the exhaustive control audit. Preserve the existing methods as convenience
adapters. Each increment must include actual CLI-to-geometry or CLI-to-control
acceptance in hidden Electron and applicable Chromium/WebKit routes. Full parity
is only claimable after every family is migrated and the audit passes; it does
not promise CAD features absent from the manual application.

## Agent selection control

Named body face/edge references are exposed as [tagged groups](tagged-groups.md).
Scripts list and edit them with `taggedGroups()` and `editTaggedGroup`; direct
`applyTaggedGroup` operations resolve membership against the current candidate.
Overview and ID inspection include groups, and `makeshift select GROUP_ID` selects
their current members with the ordinary add/remove behavior.

`makeshift select ID...` replaces UI selection; `--add` and `--remove` preserve the
order of unrelated targets, and `--clear` clears it. `--surface cylinder|plane|other`
selects matching exact face metadata across all bodies, including hidden bodies
without changing their visibility. Narrower requests use inspected stable IDs.
The result reports the resulting view context. Selection follows ordinary selection
history; geometry, camera, visibility and geometry Undo are unchanged.

Validation and application run together in the active renderer, through the same
bounded desktop/iPad view connection used for inspection. Active edits reject the
request. Modeling accepts face, edge, body and sketch IDs; sketch mode accepts
curve/group IDs from its active sketch. Invalid or incompatible targets reject the
entire request. Workspace changes remain explicit; point, profile and plane targets
are not yet writable through this CLI command.

## Direct actions and typed face queries

Startup guidance front-loads common commands, a face filter/selection example and
basic modeling semantics. Known actions execute directly; help/docs/types resolve
specific missing information, rather than forming a mandatory startup ritual.
Fresh workspace AGENTS.md contains this operating guide. The same current guide is
injected at launch, so resumed sessions receive updated capability/workflow guidance
without overwriting saved user files. Detailed modeling/decorator references remain
in `makeshift docs`. Guidance describes available operations, target scope and effects
so the agent can choose from the current request and geometry. Do not add
incident-specific corrections or examples of historical mistakes to startup prompts;
put durable operation contracts in the detailed docs and types.

`makeshift faces` returns all accepted faces with stable face/body IDs, edge IDs,
body visibility and discriminated plane/cylinder/other support metadata. Cylinders
include radius, origin, oriented axis and outward sign. Support metadata does not
establish trimmed face extents; `other` is unclassified, not a specific surface class.
Hidden bodies remain queryable. `makeshift context` reads view/selection without measurements.

`makeshift view script.ts` typechecks a single file with `MakeshiftView`: `faces()`, `context()`
and `select(ids, mode?)`, where mode is replace/add/remove. It runs in a separate
CLI child with the caller's permissions, using the ordinary inspection/selection
transport and renderer validation. No geometry transaction is acquired. Calls are
sequential, bounded to 100 and a 60-second execution limit. Empty replacement clears
selection; empty add/remove does nothing. Invalid/busy/incompatible selection rejects
atomically. Successful selection changes apply immediately and retain ordinary
selection history; a later script failure does not undo earlier selection changes.
Modeling methods are unavailable in this mode. `makeshift run` retains its existing
per-script geometry transaction. Queries read current accepted geometry at each call;
view programs do not promise a frozen snapshot across calls.

Behavioral agent evaluations run ad hoc, outside CI. Keep dated cases, model/effort,
interface/prompt versions, outcomes, command counts and timing with limitations.
Cases may evolve; historical results are evidence, not permanent acceptance priorities.
Deterministic API, host-boundary and interaction checks remain in the ordinary tests.

## Composable topology editing

`makeshift.topology` and `makeshift.replaceFace` operate on the script candidate; their
[geometry and reconstruction contract](topology-editing.md) defines the current
analytic replacement domain. These are lower-level inspection/support inputs,
not a named taper command. They retain ordinary script atomicity and stable IDs.

## Mesh references and recovery skill

The Agent header's **Attach file…** control and file drop on the pane share one
route. Each file is copied into `attachments/` in the drawing workspace, with
numbered names for collisions. The resulting workspace-relative path is pasted
at the terminal cursor so the agent can reference the portable copy. For a batch
over 20 MiB, a confirmation explains that the files will enlarge the saved drawing.
The combined 64 MiB workspace limit still applies. Attachments mark the drawing
edited and travel with its portable save; attaching leaves geometry unchanged and
never executes the file. They are workspace files, outside geometry Undo.
The iPad transport retains its 32 MiB message cap, allowing files up to 23 MiB
there after base64 encoding; larger attachments use the computer.

Codex launches install the application's `mesh-recovery` skill into the
document's machine-local Codex home. A 3MF path in an agent request can trigger
that skill; the attachment control does not prescribe a file type or skill.
The packaged skill and standard-library
3MF inspector capture reconstruction and comparison lessons from the pump holder.
They guide supported modeling operations, including reporting missing operations;
they do not introduce a general native mesh importer or recover feature history.
