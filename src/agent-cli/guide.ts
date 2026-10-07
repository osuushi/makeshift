import { scriptGuide } from "./script-guide.js";
import { startupGuide } from "./startup-guide.js";

export { types } from "./api-types.js";

export const guide = `${startupGuide}
## Inspection reference

makeshift selection returns ordered explicit targets, selected point coordinates, geometry summaries,
and kernel measurements for one or two measurable face/edge/curve/region targets.
An empty selection is reported as empty; hover and visible handles are not selection.
Point owners are context, not whole-curve selection. IDs belong to this document;
re-read them after edits. Profile keys are derived from the current sketch geometry.

makeshift inspect lists bodies/sketches and their IDs. makeshift inspect ID describes a body,
face, edge, sketch, curve or editing group. Body bounds/dimensions are conservative
kernel bounding boxes, not exact metrology; body volumes are in cubic millimeters.
Planes/curves and sketch coordinates
are explicit; sketch coordinates are local to the supplied plane. Positions and
camera coordinates are world coordinates. Measurement units accompany each value;
honor approximate and gapReason instead of treating sampled values as exact.
If measurement is null, check measurementError; the target/count may be unsupported.

makeshift render returns an absolute PNG path plus camera, selection, visibility and
clipping metadata. Open that PNG using your image-viewing tool to examine the view.
It captures the current geometry viewport with selection highlights, excluding HTML
controls and labels. Sketch cutaway is visual clipping, not a computed section.
It does not move the camera or selection. Images are temporary and expire with this
launch; copy one into the workspace only if the user wants it saved with the drawing.
Inspection rejects unfinished edits and moving cameras; wait or ask the user to
finish/cancel. Do not change their view or selection to work around that response.
Use makeshift run script.ts for typed modeling; see the scripting section below.
Geometry is owned by Makeshift; never edit an archive or private host files to change it.
Units are millimeters. Manual modeling remains available while you work on files.

Keep project notes, decisions, scripts and project skills in this working directory.
These files and Codex conversations travel with the CAD file on Save/Open/Save As.
File changes mark the document edited, separately from geometry Undo. Credentials
and generated CLI/docs remain local. Do not put credentials in the workspace.

The CLI is bound to this launch and drawing. Save As retains the connection and
updates its name. Stop, restart, New, Open and recovery invalidate the old connection.
If status reports a disconnected session, ask the user to reopen/restart Agent;
do not search for another session's endpoint or target the current drawing by name.
Live commands use a private temporary file channel, requiring temporary-file writes
(Codex workspace-write supports this). The Codex preset defaults to workspace-write
with automatic approval review; explicit user arguments can override those defaults.
Settings apply immediately on the editing device, outside document files and Undo.
Read makeshift settings first; patch only requested values with makeshift settings 'JSON'
or await makeshift.settings(patch) in a view script. See the makeshift-settings skill
when users complain about plane clutter, faint planes or accidental selection.
${scriptGuide}`;

export const help = `Makeshift — document-bound CAD assistant interface
Usage: makeshift [help | docs | types | status | selection | select [OPTIONS] [ID...] | inspect [ID] | render | run script.ts | view script.ts | faces | context | settings [JSON]]

  help     Show available commands
  docs     Print the current interface and workspace guide
  types    Print TypeScript declarations for CLI JSON results
  status   Read this drawing's current name, saved/edited state and capabilities
  settings [JSON]  Read or patch device-local plane visibility, colors and viewport opacity
  context  Read view context without measurements
  faces    Query all accepted faces with typed surface metadata and visibility
  selection  Read ordered selection, geometry and available measurements
  select [--add|--remove] ID...  Change ordered selection (default: replace)
  select [--add|--remove] --surface cylinder|plane|other  Select matching faces
  select --clear  Clear selection
  inspect [ID]  List geometry, or describe one current geometry ID
  render   Capture the current geometry viewport; return PNG path and view metadata

  view script.ts  Typecheck and run face queries/selection outside geometry Undo
  run script.ts  Typecheck and run a script; apply all changes as one Undo step

Inspection, selection control and typed modeling scripts.
Successful commands exit 0; errors go to stderr and exit 1.
`;
