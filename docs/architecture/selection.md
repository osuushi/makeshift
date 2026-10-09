# Sketch planes and selection

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Interaction contracts

The defaults below make the first implementation reviewable. Changes driven by
founder feedback update these contracts before further tools depend on them.

### Plane, tool and selection

- Command/Ctrl-A selects all visible whole bodies and sketches in Modeling; in a
  planar workspace it selects all curves in the active sketch and switches to Select.
  Command/Ctrl-Shift-A selects all visible bodies; Command/Ctrl-Alt-A selects all
  visible whole sketches. These typed variants leave the planar workspace for
  Modeling. All three replace selection, respect individual hiding, isolation and
  global body visibility. Ordinary Select All stays with File/Edit and keyboard
  commands; the body/sketch variants appear in Tools under Select. Reference planes keep
  their separate single-reference selection. Text fields, tool search and the agent
  retain their own selection keys. Selection commands first commit valid released
  modal settings or cancel invalid ones, then select against accepted geometry.

- Hidden sketches and bodies remain selectable in the Entities panel, including
  when all bodies are hidden. Selection does not reveal them; Delete/Backspace
  removes them through ordinary document history. Viewport picking still skips them.
- Isolate selection is a per-window view overlay. Selected curves/points resolve to
  their sketch; selected faces/edges resolve to their body. All owning top-level
  entities are shown and other entities are hidden. Entities eye controls can
  reveal additional entities during isolation. Exiting isolation removes only its
  temporary hiding, so it never hides an entity; entities revealed during isolation
  remain revealed. Isolation does not change the document or geometry Undo.
  An Exit isolation button appears below the orientation cube while isolation is
  active and performs the same action as the View tool.

- Sketch mode is an aligned editing view of the same 3D world, not a separate
  canvas. Use one world origin and coordinate mapping for both. Display a clear
  world-origin marker with consistent X/Y/Z labels and colors. If it moves off
  screen, an orientation/direction cue refers to that same origin; do not move
  the origin to the viewport center.
- XY/XZ/YZ appear as faint infinite grids, fading with distance and angle instead
  of ending at small rectangular patches. Emphasize the active plane without
  replacing the world background. Adapt visible grid density to zoom while
  preserving unit spacing labels, axis alignment and snap locations. Choose a
  coordinate plane through three translucent patches on their actual support planes.
  Each patch projects the bounding box of all visible bodies/sketches into its frame,
  extends 20% beyond each side and retains a 40 mm minimum around its origin. Accepted
  geometry sizes the patches; active gestures freeze them. Plane widgets do not
  contribute to those bounds. Body silhouettes mask plane fill, retaining the faint
  grid where the plane is in front; geometry occludes planes behind it. Explicit
  reference picking can show a stronger fill. World, active-sketch and saved-plane
  gridlines retain visible contrast over both the background and body silhouettes.
  Ordinary body/sketch geometry always wins over plane interiors, regardless of
  which lies nearer the camera. Among otherwise available reference patches, depth
  decides and saved planes win ties. No floating plane labels. Keyboard and
  screen-reader plane entry lives in Tools as Sketch on XY/XZ/YZ.
- Holding a primary pointer still for 300 ms in Modeling opens an explicit overlap
  chooser. Ordinary clicks retain precedence; movement beyond the normal drag
  threshold cancels the hold (6 px for touch). A delayed progress ring signals it.
  Candidates include front-facing body faces, edges with at least one locally
  front-facing adjacent face, whole bodies, and visible canonical/saved plane
  patches. Back/back edges are excluded; silhouette edges remain eligible. Curved
  faces use the triangle normal nearest the hit on the edge. Candidates are sorted
  by camera distance, including occluded front-facing geometry. Hidden entities
  are excluded.
  Ordinary edge picking and the chooser share projected edge segments, clipping
  and local-facing tests. Ordinary picking additionally checks the covering face
  at each closest edge point; the chooser retains covered candidates and tests
  the best segment of each edge. A synchronous pointer probe reuses face hits only
  for identical screen coordinates within that call. Geometry, camera, clipping
  and visibility changes always start a fresh probe. Immutable face meshes retain
  conservative bounds for ray rejection; render triangle indexes remain temporary.
  A disk grows from its center to a fixed circular outline over the hold delay; it indicates elapsed hold time, not
  processing. The delay is currently fixed; a future preferences window can expose it.
  The chooser grows across the available window with complete thumbnail rows and no
  scrollbar. When the window is full, remaining depth-sorted choices are omitted;
  hiding entities narrows the choices.
  Each choice shows the actual target geometry in the current camera orientation,
  with subdued body context. Thumbnails share full-scene framing while the target
  spans at least half the usable width or height; smaller targets get a centered
  crop at that minimum size, retaining nearby context and the camera orientation.
  Plane thumbnails include
  visible coplanar sketches in their actual positions; hidden sketches are omitted.
  Sketches off the visible defined planes get their own Sketch choice when a curve
  or enclosed region overlaps the press. Coplanar sketches stay represented by the
  plane thumbnail without a duplicate sketch choice. Sketch choices highlight their
  curves and select the whole sketch on release. They share camera-distance sorting.
  Every visible sketch also contributes its exact filled region under the ray,
  including sketches represented by a canonical or saved plane. A second Connected
  regions choice appears when the hit region has a larger transitive closure across
  shared analytic boundary spans within that sketch. Hole boundaries count; isolated
  point contacts do not. The closure selects ordinary constituent profiles together,
  preserving profile actions and keeping curve selection separate. Shift adds the set;
  Command/Ctrl removes it if all members are selected, otherwise completes the set.
  Both choices show filled thumbnails and hover previews with holes preserved.
  Text identifies the type;
  canonical planes additionally name XY/XZ/YZ. Hover/focus highlights that exact
  viewport entity, including occluded targets. Keep the pointer held, drag over a
  thumbnail, and release to choose; releasing outside cancels. Captured touch uses
  screen-coordinate hit testing, so the thumbnail and viewport highlight follow
  the finger. No second click/tap is needed. Shift adds and
  Command/Ctrl toggles geometry. Canonical and saved planes become selected references;
  Enter opens their workspace and saved planes also support Transform. Escape, outside press, navigation,
  view/document changes and window blur dismiss the chooser. The hold's trailing
  click is consumed. This is transient UI state and creates no history entry.
  Sketch point disambiguation retains its existing interaction.
- Entering a sketch animates the camera into its aligned plane view while preserving
  spatial context. The transition interpolates orientation and the view target; a
  region double-click also centers and fits that region. Orbiting out reveals the
  same geometry in place. No independent sketch camera reset, unit change or drawing
  relocation. An eventual face-supported
  sketch has a local origin distinguishable from the world origin; it does not
  redefine the world axes. Grids and markers must not hide outlines or intercept
  geometry picking; explicit plane-entry targets handle plane selection.
  Deliberate entry from canonical patches, Tools, selected sketches/faces, saved
  planes and accepted projections passes through the editor's WorkspaceEntry.
  Deliberate actions first commit valid released modal settings or cancel invalid
  ones, using the shared 500 ms Wait/Cancel boundary for pending calculation.
  WorkspaceEntry then checks the idle state; captured gestures, atomic acceptance
  and nonmodal busy work retain their guards. History restores its recorded workspace
  through its existing cancellation/selection route. Navigation capability is
  declared when each interaction acquires its lease: released modeling tools can
  pan/orbit, while captured gestures block navigation.
- R arms Rectangle without choosing a plane. Explicitly enter XY, XZ or YZ.
  Merely viewing a plane does not save an empty sketch. Orbit exits planar editing;
  pan/zoom retain it. Re-entering a plane resumes its first visible coplanar sketch;
  hidden sketches are skipped. Selecting a sketch highlights other visible sketches
  on that plane and offers a merge control on each peer to merge it into the selected sketch.
- In modeling, a selected whole sketch shows occluded curves and filled regions
  with a dim tint. Its curves and regions take picking precedence over solid faces
  and edges, retaining normal depth order among selected sketches. Clearing selection
  restores ordinary picking; hidden sketches remain excluded. This is view state only.
- Selection occurs on a completed click. In modeling, double-clicking a body face
  or edge selects its whole body; a single face click retains face selection.
  Enter on one selected plane reference, planar face or whole sketch opens its sketch workspace,
  while active operations retain their own Enter handling. In the entity panel,
  double-click renames inline and dragging reorders rows within their group;
  selecting a sketch and pressing Enter enters it. Canvas sketch/region double-click
  continues to enter its existing workspace.
  Curve selection exposes hollow point
  handles; it does not select those points. A clicked endpoint, midpoint, rectangle
  handle or center has its own typed transient target and filled marker.
  One ordered selection stores curve/group IDs or endpoint/midpoint/center/handle
  references. Whole-curve selection, point selection and highlighting owners are
  separate derived queries; no consumer may mutate a second selection collection.
  Rectangle context exposes applicable convenience controls and does not mean
  the entire rectangle was selected. Gesture cancellation restores typed targets
  in one operation, including their order.
  A completed point click switches to Select. In Select, press-drag edits a point
  immediately, including all geometrically coincident point targets at that location.
  This is transient selection, not persistent fusion; the point chooser can narrow
  the drag to explicitly selected point targets. Drawing tools still drag from points to create geometry with a snapped
  start. Hover uses an amber guide and changes neither selection nor the document. An intact
  rectangle also has a center handle/interior group target for moving the whole
  rectangle. Double-click connected linework selects its connected component.
- Shift adds without removing or reordering existing targets; Command/Ctrl toggles
  (also when Shift is held). This applies to sketch/model canvas picks,
  overlap choices and the point chooser. Modified double-clicks retain these
  selection rules rather than entering a sketch or selecting a connected component.
  Body face/edge double-clicks promote to whole-body selection: Shift adds and
  Command/Ctrl toggles against the selection before the first click, preserving
  unrelated targets and order without retaining intermediate face/edge clicks.
  Command-click toggles; Command-drag still orbits after the pointer drag threshold.
  Shift-box adds and Ctrl-box toggles, preserving unrelated selected points.
  Dragging a selection box from empty space
  selects contained geometry. A local overlap chooser resolves coincident targets;
  hover and activation use the same hit result. Picking is not “last array item.”
- In Entities, Shift-click selects the inclusive body/sketch row range in displayed
  order, including hidden rows, replacing the previous selection. Plain and
  Command/Ctrl-clicks establish the anchor; repeated Shift-clicks retain it so the
  range can grow or shrink. Command/Ctrl takes precedence over Shift and toggles
  only the clicked entity. A missing anchor falls back to selecting the clicked
  entity. Saved construction planes retain their separate single-reference selection.
- Point handles, curves, groups and regions are distinct target types. Picking a
  filled region must not silently move whole curves that extend beyond its boundary.
  Geometry transforms operate on selected entities/groups; region selection is
  for profile actions and stays distinct from curve selection.
- Blank click clears selection. Escape cancels an unfinished gesture/field edit,
  then dismisses the active tool/selection on a subsequent press, then exits the
  plane when idle. It never deletes previously accepted drawing.
- Keep the selected set after a move or numeric edit. Delete removes that set and
  its now-invalid constraints in one Undo step. Clear affects only the active
  sketch and leaves its plane usable. Both are actual tested controls.

### Point disambiguation

`selection-target.ts` defines typed targets and their keys; `SelectedTargets` owns
ordered state and resolves selected point coordinates from the current sketch.
`point-query.ts` enumerates intrinsic endpoint, midpoint, center and group-handle
samples without importing viewport picking or Transform controls. Picking owns
screen tolerances and precedence. Rendering owner IDs remain separate from whole
curve selection. Modeling selection state and operation policy similarly live in
`model-selection-state.ts`, apart from viewport face/edge/sketch hit testing.

Click a coincident point location to open a local chooser of incident-edge diagrams.
The ordinary default includes all colocated point targets. Each stored coincidence
component appears as one diagram containing all its incident branches; independent
colocated points remain separate diagrams. Choosing a diagram selects all its point
targets, Shift-click adds the component, and Command/Ctrl-click toggles it as a unit.
Hover highlights all branches of that component. Shift while hovering the junction
reopens the chooser with those choices indicated. Selection does not create point links.

The next point drag uses the chosen targets. Whole-curve multiselection keeps its
existing Shift-add/Command-toggle behavior; a plain point click does not silently
reduce an existing whole-curve selection. Explicit chooser selection does narrow
it. Drawing tools continue drawing from visible unselected endpoints. Point choices
are editor state, never geometry. Their ordered targets participate in selection
Undo; the chooser itself clears on tool/history/plane changes. Escape dismisses
the chooser first while keeping the chosen points.

Point selection fades blue along incident edges; hovering a diagram fades amber
along its branches. Center choices highlight associated curves, and concentric
center diagrams use a shared scale. A rectangle corner is one choice with two
incident edges; coincident independent endpoints remain separate choices. All
candidates are shown with wrapping, not truncated at four. Unfuse is shown only when
the chosen targets have detachable coincidence links. Unfusing a selected component
immediately restores its separate diagrams. Identical overlapping
geometry can still yield identical diagrams; moving a chosen duplicate is explicit.

Selecting the entire physical degree-two endpoint junction offers Tangent for its
two incident edges, including two unfused endpoints that happen to be colocated.
The convenience creates an ordinary tangent relationship without fusing those
points. A junction with any other number of incident edges offers no point Tangent.

The chooser stays stable while addressing the same junction, so Shift-click does
not replace a button during its click. Dimensions/rotation controls step aside
while it is open. Actual geometry edits still use the existing backend/Undo path.
