# Undo and saving

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Undo and saving

Start with before/after sketch data for each accepted user edit. One drag is one
Undo step, a multi-selection move is one step, and a numeric confirmation is one
step. Undo/Redo restores geometry, constraints and group membership together.
Transient previews, focus and camera movement are not history. Clear invalid
selection/handles after restoration and keep the current plane usable.

Use straightforward snapshots initially; optimize memory only after measuring a
real sketch workload. No inverse-operation framework or saved undo log is required.
Opening a document starts fresh Undo/Redo history. That is an intentional simplification
from the old archive, not a claim that old saved history has been migrated.

Save a readable, version-tagged JSON sketch document: units, plane frames, typed
curves, constraints and editing groups. A **file format version** describes its
schema; it is not a document edit counter. Do not serialize meshes, region IDs,
solver memory, command logs or native BReps for sketch-only files. Validate finite
geometry, IDs and references into a temporary document before replacing live work.
Preserve the existing file on failed saves, using the host's ordinary safe-write
path. Save/Open and unsaved-work handling are required product interactions, not
a storage research project. No migration framework for hypothetical old versions.

## Native document lifecycle

Electron uses one window and one complete session per document. Each session owns
its DocumentOwner, Undo/Redo, accepted data and previews, file identity and saved
baseline, agent workspace/process/script connection, export calculators and optional
iPad handoff. Renderer selection, tools and camera live in that window's renderer.
Application preferences, agent installation/settings, menus and updates are shared.
IPC handlers register once and select their session from the actual main-frame
WebContents sender; an active window is never used to route model or agent requests.

New always creates an independent untitled window. Open reuses its originating
window when it is clean and untitled, with no pending geometry, file operation,
agent workspace/lifecycle or iPad pairing. It validates before replacing that blank
document, then reloads the editor to reset tools, selection and camera. Failed Open
retains the blank window. Other Open requests (including further files in a multiple
selection) create a window per file; opening an already open path or
symlink focuses its existing window and preserves its geometry, history and view.
Untitled windows have distinct names. Save As rejects a destination owned by another
open/opening/saving document. Native File/Edit commands target the focused document,
with the last document window retained when an auxiliary window owns focus.

Native Save writes back to that session's current path; first Save and Save As use a
native save panel. A temporary sibling file is fully written before replacing the
destination; failure retains the old identity and dirty state. Open validates and
materializes before replacing blank work or showing a new editor; failure retains
the blank window or closes only its provisional new window and reports the error. The current file's folder is
the default for its file panels; untitled panels use the application's last used
folder, falling back to Documents.

Desktop and paired-browser model transports accept geometry/history requests only.
New/Open use document commands, so geometry replacement cannot bypass file identity,
unsaved-work choices or agent workspace binding. The standalone calculator owner
retains New/Open for browser archive loading and internal session use.

File menu commands and Cmd/Ctrl-N/O/S, Shift-Cmd/Ctrl-S and Cmd/Ctrl-W share these routes.
The title and macOS represented-file/edited indicators reflect the current document.
Dirty state compares accepted archive contents to the saved baseline, including Undo
back to saved contents; previews and navigation do not dirty the document. File dialogs
and loading block edits. Quit, window close and update restart complete a released
active operation through its normal acceptance path before asking about unsaved work.
Canceling the save prompt keeps that accepted operation available to Undo. Failed
completion keeps the window open and the operation available for correction. Held
pointer gestures must finish first. New and Open into another window leave the
current window's tools and agent running, while Save and Close complete released
operations normally.

Close stops only that document's agent before the final unsaved-work prompt, so
final process writes are included. Cancel keeps the document open; a stopped agent
can be started again. Quit and update restart prepare documents sequentially and
close no windows until every document agrees. Cancel, a failed save, an unfinished
gesture or an unresponsive/crashed renderer aborts shutdown. Previously prepared
windows regain editing, and their accepted geometry/history remain intact. A busy
file operation in another window is never unlocked by canceled Quit.

On macOS, Finder/Open With, Dock file opening and the native Open Recent menu feed
the same deduplicated Open route. The bundle declares `.makeshift` and legacy
`.freac` documents. Closing the last document leaves the app available; New/Open
and Dock activation create a document window. The native Window menu lists document
windows. New windows cascade from the active window and use the remembered default
size. Launch restores all windows from the last successful Quit/update, with each
saved file's last saved camera and its window position/size; bounds are clamped to
an available display. Untitled windows restore blank. Individually closed windows
are removed from the restoration set. The former single-document preference is
read on first launch after upgrading. Preferences contain paths, folders and window
bounds, never geometry or Undo. Missing or invalid restored files are reported;
remaining files still reopen, with an untitled fallback if none can open.

Autosave, unsaved geometry/crash recovery and persisted Undo remain unimplemented.
The saved camera is a validated file-envelope field outside accepted geometry and
Undo. Navigation alone does not dirty the document; Save/Save As captures the current
view. Dirty state includes portable agent content as described below.

Standalone [web mode](web.md) uses the same archive codec with upload/download and
an optional browser save picker. New/Open protect unsaved changes; native filesystem
and dialog APIs stay behind the preload bridge. Browser session restoration remains
unimplemented; beforeunload cannot protect work from mobile tab eviction.

## Mesh export

STL and 3MF export visible accepted solid bodies at their current world positions.
Both individual body visibility and the global body visibility toggle apply.
Sketches and temporary operation previews are excluded;
export is disabled during active interactions and with no visible bodies. No document or
Undo mutation occurs. Conversion/compression runs in a disposable browser worker,
shared by web and Electron; download uses the same host route as Save.

Both formats use the accepted kernel-derived face tessellation (current mesher
settings: 0.05 mm absolute linear deflection, 0.2 rad angular deflection). Export
welds coordinates within 1e-7 mm across faces, checks finite/nondegenerate triangles
and closed, consistently oriented edges, and reports failure instead of emitting
an open mesh. These are mesh integrity checks, not a general printability or
self-intersection certificate. There is no export-quality setting yet.

Binary STL stores float32 coordinates in millimeters; STL itself has no unit field
or separate-body semantics. 3MF explicitly declares millimeters, shares vertex
indexes and keeps one model object/build item per body in an OPC ZIP package per
the [3MF Core specification](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md).
Placement is baked into vertices. Exports contain geometry only, without printer,
material or slicing settings. Exact editable geometry remains in the Makeshift file.

## STEP export

STEP exports the same visible accepted bodies and world placement as STL/3MF,
excluding sketches and temporary previews. The native OCCT writer produces AP242
with explicit millimeter units and separate body products. This is geometry
exchange, without Makeshift IDs, constraints, decorator code/settings, feature history,
entity names, colors or a product assembly hierarchy. Export does not change the
accepted document, dirty state or Undo.

When a visible body has decorators, a modal offers **Include decorators** or
**Exact bodies only**, plus Cancel/Escape. Including decorators runs the existing
mesh pipeline and writes each decorated body's entire final mesh as native AP242
tessellated geometry. Undecorated bodies retain exact BReps in that same file.
The warning explains that decorated bodies are meshes rather than smooth editable
CAD solids, and receiving apps may not support them. Do not substitute the nominal
solid as an alternative representation of the modified mesh.

Exact bodies only explicitly omits decorators and writes the underlying exact
solids for every visible body. It does not execute decorator code or require
decorator resolution. Including decorators retains the existing repair/missing-code
export failures. Hidden decorators do not cause a warning or block visible-body
export. There is no triangle-to-BRep conversion, analytic reconstruction of meshes,
or target-app compatibility certification in this increment.

Conversion runs in a disposable worker for decorator meshes and a cancellable
native child for STEP serialization. Temporary exact/mesh items come from one
captured accepted snapshot; later document edits cannot alter that export. Cancel
export stops mesh/STEP work and suppresses late downloads; a pending shared
geometry-refinement query may finish. The host APIs remain
behind the existing model transport; browser/WebKit and Electron use the same path.

## Portable agent workspace

Area 2 adds version-2 ZIP files when a document has portable content. `model.json`
contains the version-tagged accepted model (exact BReps, no display meshes),
`workspace/` carries project files and `conversations/codex/` carries only
`sessions/**/*.jsonl` and `archived_sessions/**/*.jsonl`. Empty/model-only documents
continue using version-1 JSON. Browser upload/download preserves portable bytes even
without a terminal host; its codec runs in a disposable worker.

The host's AgentWorkspace owns these files independently of geometry Undo. A recursive
watcher updates dirty state; Save rescans all portable files. It checks inode, size
and modification/change times before/after reading and rescans the directory listing.
Changes during capture reject visibly, retaining the previous file and dirty state.
Writes after capture are detected by a further scan and remain unsaved. Save As keeps
the live workspace and process. New/Open/Close asks about unsaved changes and agent
termination, stops before a final saved capture, and rechecks after shutdown when the
initial document was clean. Cancel preserves the current data; cancel after stopping
may require Start again. A failed save never discards local workspace bytes.

POSIX harness launches verify their private terminal session before executing the
configured program. A quiet process keeps that session identifiable after natural
root exit; a private FIFO closes that member when the host exits. The host checks
its process-group and precise birth identity before
signalling the session's groups, including interactive shell jobs. Natural exit
also drains this cleanup. Exited/Start availability and final file capture wait for
it. The read-only `makeshift-agent-scope` helper reports OS process identity; it owns no
document and makes no termination decisions. This covers ordinary POSIX jobs;
programs that deliberately create another OS session are outside that scope.
Windows retains the existing ConPTY shutdown path and needs target verification.

The macOS adapter uses the group and birth fields declared in Apple's
[proc_bsdinfo](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/sys/proc_info.h#L54-L77).
The Linux adapter reads session/group/start-time fields from
[/proc/pid/stat](https://www.man7.org/linux/man-pages/man5/proc_pid_stat.5.html).
These are OS interface observations; the launch gate, retained member and cleanup
policy are Makeshift's implementation. No upstream implementation was copied.

Open checks ZIP metadata/expanded limits/CRC and model structure, prepares files in
an isolated directory, then uses the normal model validation/materialization path
before adopting the prepared workspace. No archived file is executed during Open.
Archives accept unique regular files, with portable paths, no links or special files,
no absolute/traversal/Windows device paths and no case-folded or file/directory conflicts.
Limits are 4096 portable files and 64 MiB expanded model plus portable bytes. Directories
are implicit in file paths; empty directories and executable mode bits are not preserved.
The writer uses uncompressed ZIP entries; the reader also supports compressed entries.
The same expanded limit applies to model-only JSON on Save and Open. A failed size
check happens before the destination write and preserves file identity and Edited
state. ZIP headers have a separate 8 MiB encoded allowance; they do not raise the
expanded-content limit.

Each document gets its own local Codex home beside (outside) its workspace. Base
Makeshift configuration and auth are copied there at launch and synchronized locally on
Stop/restart. Only session JSONL records enter the archive; credentials, preferences,
SQLite indexes and caches do not. Resume selects the latest activity timestamp among
main CLI conversations, excludes subagent sessions, and invokes `codex resume UUID
--cd CURRENT_WORKSPACE`. It does not rewrite historical paths inside messages.
Unknown records remain intact; unsupported/missing metadata cannot select a resume ID.
This adapter is verified with Codex 0.155.1, not promised across arbitrary CLI versions.
Custom harnesses preserve workspace files, not external harness-specific chat stores.

Working directories are retained rather than deleted automatically. Agent Settings
provides Recover agent files: select a retained document folder and confirm importing
its files/conversations into the current document, preserving geometry and marking
it unsaved. Save then embeds the recovered content. Recovery also handles area 1 flat
workspace folders and selects matching session metadata from Makeshift's former shared
Codex home. It never imports personal Codex homes. Geometry autosave/crash recovery
and automatic recovery selection remain outside this increment.

## Diagnostic fixtures

Capture fixture is available in production and preserves the active tool, preview,
accepted model and Undo. It writes a self-contained, timestamped JSON fixture under
the OS temporary directory (makeshift-fixtures), independent of the working directory.
Accepted/preview .makeshift sidecars remain available for local reproduction. The result
provides native Electron file drag, reveal, download and copy path; browsers download
the same JSON bytes. Native actions resolve only the last capture for that window,
never a renderer-supplied path. Captures are local, retained for attachment and subject
to OS temporary-file cleanup; they are never automatically uploaded.

## Makeshift naming compatibility

New saves use `.makeshift` and the `makeshift` archive tag. The readers also accept
the existing `freac` version 1 JSON and version 2 portable ZIP tags. Built-in
decorator IDs, browser preference keys and the macOS bundle identifier remain
stable. Existing desktop user-data directories are reused, keeping private agent
settings, workspaces, window size and the last-opened drawing. An explicit
`--user-data-dir` continues to take precedence. The former `freac` CLI command,
scripting global and agent connection environment names remain compatibility aliases.
Native SDK receipt names and recipe provenance retain their original vocabulary,
allowing the same audited SDK to be reused without changing its contents.
The earlier binary prototype format remains unsupported and unchanged.
