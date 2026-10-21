# iPad document interface

Founder contract, 2026-09-21: keyboard-folio and Apple Pencil first. One finger
rotates, two pan/pinch/twist; Pencil uses the existing geometry pointer routes. Backtick
and tilde alias Escape in CAD, including numeric fields, while terminal and text
editing retain their characters. Ordinary UI buttons remain finger-accessible. In Modeling, a stationary finger tap
selects at its initial contact; two taps within 500 ms and 16 CSS pixels enter a
sketch, canonical/saved plane or planar face. Sketch ink has a 22 CSS-pixel
entry radius measured on screen, independent of the 16-pixel inter-tap drift limit. The second tap retains entry intent across
newly displayed controls. Movement of 6 CSS pixels, multiple contacts, cancellation
or a 300 ms hold disqualifies a tap; navigation and the overlap chooser retain
ownership. Touch/Pencil taps are independent of prior mouse-orbit click suppression.
Viewport taps focus the canvas so a stale numeric field cannot consume ⌘Enter.
Sketch entry, tool search, document commands, Undo/Redo and Copy also handle
iPad's keypress command route. Handled keydown events cancel their default action;
ordinary text fields retain text editing and clipboard ownership.
Browser `beforeinput` historyUndo/historyRedo commands also route to document
history when focus is outside text editing. The original event target can be an
earlier text field; current focus determines ownership. Open menus, dialogs and
the agent retain their input. Physical iPad delivery of this fallback needs review.
On iOS, tool search uses and displays ⌘P; ⌘F remains with Safari Find after device
feedback showed that Safari consumed it. Desktop tool search retains ⌘F/Ctrl+F,
with ⌘P also accepted as a Mac alternate. Ctrl+P retains browser Print.
iPad detection includes desktop-mode MacIntel with multiple touch points.
HTTP LAN sessions do not expose the async browser clipboard API. Founder approved
an in-tab geometry clipboard fallback on 2026-10-16: Copy records geometry and
attempts system copy; keyboard/menu Paste uses the local copy on HTTP. It survives
New within the same tab, but not reload or another tab. Ordinary text fields keep
native clipboard ownership. HTTPS uses the system clipboard. No extra paste dialog.
Undo/Redo accepts Cmd/Ctrl-Y as well as Cmd/Ctrl-Shift-Z. New uses and displays
Ctrl-N on iPad after device testing found Cmd-N unavailable; desktop retains Cmd-N.
Touch browsers, including standalone web mode, use these controls automatically.
The Camera/Pointer toggle defaults to Camera (fingers navigate, Pencil edits).
Pointer sends finger input through ordinary geometry tools for use without Pencil;
the preference persists locally and does not change the document or Undo history.
Sketch and modeling selection allow 16 CSS pixels of Pencil tip movement before
dragging (mouse retains 3 pixels). Selection uses the initial contact position,
so lifting the tip off an edge still selects that edge. Modeling recognizes two
Pencil taps within 500 ms and 16 pixels directly; the second tap selects the body
through newly displayed operation widgets without requiring Safari's mouse dblclick. A deliberate drag still creates
from a point in drawing tools. Primary taps do not interrupt plane alignment, and
sketch gestures wait for the transition to finish. During a held sketch gesture,
each completed solve is displayed even when a newer pointer target is waiting;
release drains the newest target before accepting one Undo step.
Two-finger twist triggers one 90° view turn about the finger midpoint after 30° of
angular travel, alongside continuous pan and zoom. The turn latches until the
contact gesture ends. It animates directly to the canonical-axis destination in
280 ms, with no separate release correction. Safari exposes combined
scale/rotation through
[GestureEvent](https://developer.apple.com/documentation/webkitjs/gestureevent);
Makeshift calculates both directly from its existing pointer contacts and consumes
duplicate Safari gesture events. Automated Chromium touch checks exercise this
path; physical iPad twist usability remains unverified.
Physical Pencil/palm rejection and Safari lifecycle behavior require device review.
Sketch arrow taps and Tab/Shift-Tab between unchanged numeric fields focus and
select the destination synchronously in the initiating input handler. Do not insert
an idle promise before focus: iPad's native keyboard activation depends on the user
gesture. Changed values still finish through the ordinary asynchronous edit owner
before advancing; invalid values retain the current edit.

## One document and one active surface

The desktop DocumentOwner, native calculators, snapshot history and agent workspace
remain authoritative. The iPad button starts an ephemeral IPv4 LAN listener serving
only built frontend assets. A cryptographically random 256-bit QR token authenticates
one WebSocket editor. The desktop renderer reloads into a connection-only screen;
host IPC also excludes its model, document commands and terminal input. The shared
browser adapters expose the same model, files, script events and inspection APIs.
The agent's selection/camera/render requests go to the active browser.

Handoff requires an idle editor without a modal operation. The QR/status remains
visible while connected or disconnected. Return to computer closes the listener,
revokes the token, drains work and reloads the desktop view. Browser transport IDs
only correlate request/reply messages; they are not public document revisions or
an operation retry ledger. Geometry commands continue through the existing owner.

Disconnect closes pending browser prompts, cancels scripts/calculations and discards
unfinished previews, waiting for in-flight handlers before another connection can
acquire control. Completed edits and Undo persist. The browser blocks input and
requires reconnect/reload; it reads accepted state and never retries an edit.
Camera, selection and other renderer-local state restart. A running agent process
may remain alive; no disconnected renderer can supply fresh input.

Deliberate computer Close/Quit/update restart goes through the connected browser's
ordinary file-command route. It completes a released tool before the unsaved-work
choice. Cancel keeps browser control, the accepted result and its Undo; failed
completion leaves the operation available for correction. With no connected editor,
Close first stops hosting and then uses the computer's normal file lifecycle.

## Computer files and agent

Each computer document window owns its own pairing/listener and prompts. New/Open
create or focus a separate computer window; the iPad remains paired with its current
document and displays that behavior explicitly. Return to computer and select the
other window's Tablet control to work on it. Opening an already open file never
replaces the paired document or its Undo/agent state.

Save/Open/Save As and agent executable/recovery choices refer to computer paths.
A session dialog adapter routes file listings and prompts to the active surface;
the document/agent lifecycle retains validation, workspace capture, ordinary
save/discard choices and one edit at a time. Desktop
use retains native dialogs. The initial browser picker traverses existing folders
and accepts typed paths; folder creation is not provided. Mesh export retains the
shared browser download path. Safari's own paste event supplies iPad terminal paste.

## Explicit temporary security boundary

The founder deferred TLS/certificate verification and approved a prominent
**Only use on secure Wi-Fi** warning on both surfaces. This version uses HTTP/WS,
not verified TLS. The QR bearer token excludes unpaired clients but offers no MITM
or passive-interception protection. Anyone obtaining it may exercise the document,
computer file and agent APIs. The warning states that exposure explicitly. Keep
the listener off except during requested iPad use. Same-origin WebSocket checks,
bounded messages, public-asset-only HTTP serving and single-client ownership are
implemented, but are not substitutes for authenticated encryption.

The future trust bootstrap remains unresolved. A matching code displayed by JS
served over an unverified connection does not authenticate that JS. No DNS forwarding,
certificate installation, home-grown authenticated key exchange or trust claim is
introduced by this increment.

A stationary 300 ms finger/Pencil hold in Modeling opens the overlap chooser.
Before the chooser opens, touch movement cancels the hold and retains navigation;
a second contact cancels it for pan/pinch. Once open, drag the held finger/Pencil
over a thumbnail and release to select. Release outside or pointer cancellation
dismisses without selection. Captured touch hit-tests screen coordinates to keep
hover feedback and release selection on the same item. Browser automation covers
pointer delivery and Chromium touch events;
physical iPad/Pencil behavior still requires hardware review.

Body/topology Move, plane and whole-sketch placement, and axial arrows use the same
16 CSS-pixel Pencil tap tolerance, captured at press. Drift within that distance
opens and selects the numeric field on release rather than accepting a drag;
mouse gestures retain their 3-pixel threshold. Transform handoff preserves this
distinction when accepting one handle's edit before beginning the next. Numeric
entry on whole-sketch placement ignores held-pointer movement until a new gesture.
