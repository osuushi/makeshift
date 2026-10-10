# iPad document interface

Founder contract, 2026-09-21: keyboard-folio and Apple Pencil first. One finger
rotates, two pan/pinch/twist; Pencil uses the existing geometry pointer routes. Backtick
and tilde alias Escape in CAD, including numeric fields, while terminal and text
editing retain their characters. Ordinary UI buttons remain finger-accessible.
Sketch and modeling selection allow 16 CSS pixels of Pencil tip movement before
dragging (mouse retains 3 pixels). Selection uses the initial contact position,
so lifting the tip off an edge still selects that edge. Modeling recognizes two
Pencil taps within 500 ms and 16 pixels directly; the second tap selects the body
through newly displayed operation widgets without requiring Safari's mouse dblclick. A deliberate drag still creates
from a point in drawing tools. Primary taps do not interrupt plane alignment, and
sketch gestures wait for the transition to finish. During a held sketch gesture,
each completed solve is displayed even when a newer pointer target is waiting;
release drains the newest target before accepting one Undo step.
Two-finger twist triggers one 90° view turn about the finger midpoint after 10° of
angular travel, alongside continuous pan and zoom. The turn latches until the
contact gesture ends. It animates directly to the canonical-axis destination in
280 ms, with no separate release correction. Safari exposes combined
scale/rotation through
[GestureEvent](https://developer.apple.com/documentation/webkitjs/gestureevent);
Makeshift calculates both directly from its existing pointer contacts and consumes
duplicate Safari gesture events. Automated Chromium touch checks exercise this
path; physical iPad twist usability remains unverified.
Physical Pencil/palm rejection and Safari lifecycle behavior require device review.

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
