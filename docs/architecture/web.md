# Standalone web mode

Founder direction, 2026-10-03: iPad-first access and a link people can try without
installing Makeshift. The web build runs locally in the browser, without a paired
computer. It shares the sketch/solid editor and existing touch/Pencil gestures.
The agent pane, terminal and LAN handoff controls are excluded from this build.
SSH or other agent connectivity is not part of web mode.

Touch-capable browsers default to the iPad/Pencil interaction: Pencil edits,
one finger rotates, and two fingers pan/pinch/twist. iPhone/iPod instead default
to Pointer so fingers can create geometry without a stylus. The visible Camera/Pointer
toggle switches fingers between navigation and ordinary geometry editing, making
the editor usable without a stylus. An explicit choice overrides the device default
and persists locally, outside document Undo. Mouse/trackpad settings remain available
for attached desktop input devices; the unavailable Tablet handoff action is omitted.

## Ownership and calculation

The existing TypeScript DocumentOwner owns the accepted document and snapshot Undo.
The browser model adapter clones requests/replies, preserving the same separation
between accepted data and renderer copies as the desktop transport. PlaneGCS and
the same adapted OCCT 7.9.3 calculator compile with pinned Emscripten 4.0.20.
They are stateless calculators in module workers; worker termination cancels a
calculation without replacing the document owner or losing accepted work.
One pending calculation per calculator and the existing owner edit gate still apply.

The WASM wrapper reuses the native calculator's JSON protocol and operation code.
OCCT and the C++ runtime form an Emscripten main module; Makeshift geometry
implementation is a separately linked side module in the same worker and memory.
A fixed protocol trampoline connects them. The solver remains a standalone module.
C++ exceptions remain enabled. Inputs use heap memory rather than the small WASM
stack. The web kernel uses one thread and requires neither SharedArrayBuffer nor
cross-origin isolation headers. Manifold and QuickJS use the existing browser WASM
paths for decorated mesh export and custom decorators.

## Loading and deployment

`build:web` produces only static files in `.build/web`. Relative URLs support a
GitHub Pages project subpath. The solver loads when a constrained edit needs it;
OCCT loads when an operation needs exact solid geometry. Mesh/JavaScript decorator
runtimes retain their own worker paths. WASM and generated glue have content hashes,
independent of editor code. OCCT/runtime and Makeshift geometry also have separate
content hashes: implementation changes that preserve the imported OCCT/runtime
interface leave the large download unchanged. The main module retains the symbols
required by the side module rather than exporting all of OCCT. Adding/removing API
usage, upgrading OCCT/Emscripten or changing compiler options may change its bytes.
All modules in a release use the same pinned compiler and exception ABI.
Unchanged modules therefore keep the same URLs across releases. Browser HTTP caching
follows the host's cache headers; there is no service worker or offline-install guarantee.

All build/test/release logic and release assets belong to the main Makeshift repo.
A separate Pages repository contains generated output on `gh-pages`, written with
a deploy key that grants access only to that repository. Its normal Pages branch
publication serves the files. The existing macOS update-feed deployment is untouched.
Web release publication is serialized. Pushes never force overwrite another writer.
Hashed assets from earlier deployments remain available for lazy loads in open tabs;
cleanup of that static asset history must be a deliberate maintenance action.

## Files and device limits

The File / Edit menu and ordinary keyboard shortcuts expose New, Open, Save and
Save As. Opening validates the existing `.makeshift`/legacy `.freac` archive through
the same document owner, including exact BReps. Portable workspace/conversation
bytes are retained without exposing or executing an agent. Unsaved New/Open offers
Save, Cancel and Don't Save. A failed or cancelled save does not replace file identity
or the saved-content baseline. Browser close/navigation gets a beforeunload prompt
where the browser supports it.

Save stores a complete archive in IndexedDB on this browser and origin. First Save
asks for a name; subsequent Save updates the same drawing. Save As asks for a name
and creates an independent copy. Open shows the browser library, newest saved first,
with an Import file action. Imported files acquire a browser identity on first Save.
Names are labels; distinct drawings can share a name. The saved baseline and identity
change only after the storage transaction commits. Failed storage writes leave work dirty.

Download drawing asks for a name and exports a portable copy through a file picker
where available, or a browser download in Safari. Download does not mark unsaved
browser changes clean. Camera and portable workspace bytes travel with both forms
of save; navigation alone is not an edit. Undo back to saved contents is clean.

Browser storage belongs to this browser profile and site; clearing site data removes
the library and private browsing may discard it. Downloaded copies remain the backup
and device-transfer route. There is no automatic recovery of edits since the last Save
after tab eviction or termination. The Home Screen manifest supplies a
standalone window and icon, without promising offline availability. Physical
Pencil/palm behavior and large-model memory limits require device review, even
when desktop WebKit tests pass.
