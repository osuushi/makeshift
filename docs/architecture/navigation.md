# World navigation

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Canonical plane entry

In Modeling, a single click on a canonical plane selects that reference, clearing
geometry and saved-plane selection. The reference stays selected after hover leaves.
The most face-on canonical grid stays at configured maximum opacity; a faint
secondary provides orientation. View changes crossfade grids while world axes
remain visible. Only the primary above its selectable visibility threshold accepts
ordinary canvas input; explicit plane-selection tools also accept the visible secondary.
Coordinate grids fade subtly with depth away from the view target, scaled to visible
world height; nearer portions remain unfaded and finite camera retreat has no effect. See
[interface preferences](interface-preferences.md) for blending and grid controls.
Enter or double-click enters its sketch workspace; Escape or a click without a selectable reference or geometry clears it.
Plane entry chooses the nearest quaternion orientation among all four in-plane
quarter turns on either side, preserving the accepted plane frame and grid axes.
Profile entry fits the boundary along the chosen screen axes, keeping its center
and margin when a quarter turn swaps the horizontal and vertical extents.
Canonical references remain fixed, while construction planes support placement edits.
Explicit plane-selection modes continue to accept a plane on a single click.
In Mirror and Projection, a nearer planar solid face takes precedence over a
canonical patch behind it; a coplanar face wins the depth tie.
Keyboard/tool-menu plane entry remains available.

### Sketch tool lifetime

Leaving a sketch workspace resets its tool to Select and clears armed creation
intent. Reentering a sketch or choosing another plane therefore starts in Select,
without inheriting Circle, Line, Rectangle, Curve or Trim from the previous session.
Drawing tools continue to take precedence while that session is active. Explicitly
choosing a drawing tool in Modeling can still arm a new plane-first drawing flow.

### Sketch-plane visibility

While a planar workspace is active, renderer clipping makes geometry on the
camera side of its plane absent from the main pass. Bodies and their edges on
that side render into a separate depth-tested buffer, clipped at the same plane,
and composite over the main scene at 20% opacity. Overlapping foreground bodies
therefore do not accumulate transparency. Sketch curves and grids do not enter
this foreground pass. Coplanar and behind-plane geometry remain normally visible;
a 0.0001 mm rendering tolerance retains coplanar geometry.
Skip the empty foreground pass when no visible body geometry or decorator preview
contributes. Lights and empty/hidden groups alone do not require compositing;
showing their geometry restores the same full-resolution pass.
The cutaway follows the current workspace frame and camera side, and clears on
workspace exit. It changes no accepted geometry, selection identity or Undo.

### Orthographic camera depth

Zoom changes the orthographic view size. Before rendering and queued navigation
picking, place the finite camera behind the bounds of visible document/preview
geometry, with a small depth margin, and extend the far limit when necessary.
Retreat only along the viewing direction: screen positions, view size, orientation,
target and rotation pivot stay unchanged. Keeping geometry ahead of the camera
also preserves forward ray picking; a negative near limit alone would not do that.
Bounds cache by displayed document and visibility, conservatively enclosing body
bounds and sketch curves on tilted planes. World origin and visible construction
plane origins also participate. Infinite grids do not determine scene bounds.
Intentional sketch cutaway and cross-section planes remain independent.
Camera-to-target distance is rendering placement, not the orthographic zoom scale.

### Rotation pivot

Mouse-down, cube press and the initial one-finger touch contact supply viewport
coordinates. Hover and selection do not drive acquisition. At drag activation,
ray-cast through that press location and use the frontmost visible surface hit.
If the ray misses, find the nearest projected point on a visible surface, then
cast a new ray there to resolve occlusion. Distance is in screen pixels, including
non-square viewports. Projected body bounds order and prune the search; clipped
render triangles supply the actual nearest point, so holes are not filled by
bounding-box approximations. A subpixel inward offset stabilizes contour rays.

Hidden entities, clipped geometry, offscreen portions, grids and plane widgets
cannot attract the pivot. Resolve before leaving the sketch workspace. If there
are no visible surfaces, use the closest visible curve/edge point for wire-only
work; a completely empty view retains its target. This replaces the earlier
selection-bounds and central-20% sampling rules.

Freeze the pivot throughout the drag and rotate both camera position and view
target about it, preserving the pivot's screen location and reversibility. Release
leveling retains the view-axis roll behavior described below. Cube face
clicks retain their existing view target. These are transient camera decisions,
using the ephemeral view Undo contract in [edit lifecycle](edit-lifecycle.md#ephemeral-view-undo-founder-decision-2026-10-03).

### Uniform turntable and explicit roll

Command/Meta + primary drag uses a control radius of half the smaller viewport
dimension. A press stays pending until movement exceeds the selection drag
threshold; a completed Command-click toggles selection without exiting the sketch.
Escape or window blur cancels a pending press. All press locations use the same
turntable: horizontal motion yaws around the signed world X/Y/Z axis selected by
the release-leveling rule, and vertical motion pitches around the starting
camera-right axis. Its horizon stays level during small drags from an already
level view. There is no outer ring or position-based change of rotation mode.
The pointer-down point, camera pose, upright axis and acquired pivot stay fixed
throughout an ordinary orbit segment. Reversing the pointer path restores its
starting pose. Ordinary orbit levels on release.

Holding Option/Alt during an orbit drag switches to continuous camera roll. The
pointer's angular travel turns the image one-to-one about the viewport center, or
about the projected center of selected geometry when a selection exists. Capture
the selected curves/points or modeling-selection center before leaving a sketch;
point owners are not whole-curve selections. The chosen center stays fixed during
the roll segment. Radial travel does nothing, angles unwrap through a full circle,
and travel through a small center dead zone cannot flip the camera.
Option may be pressed or released mid-drag: each change rebases at the last
pointer position and current camera pose without a jump. Returning to orbit reuses
the original acquired geometry pivot. Ending with roll runs the same release
leveling as ordinary orbit, restoring a canonical world axis to screen vertical.
Option modifies navigation only, leaving geometry tools' symmetric sizing intact.

On orbit/roll completion, consider world X/Y/Z axes whose screen projection is
within 20° of vertical. Orient each candidate toward screen top and choose the
one whose unit-length top end is nearest the camera (largest signed view-depth
component). An exactly end-on axis is ineligible. This same signed axis supplies
yaw for the next orbit. Depth ties retain X/Y/Z order.
If none qualify, score each world X/Y/Z axis by `rollRadians² - 0.25 × ln(projectedLength)`.
Projection length is that of a unit axis on screen. This smoothly penalizes
foreshortening, with infinite cost only at exactly end-on.
The weight makes a half-length projection cost roughly as much as 24° of roll.
Choose the lowest fallback score. Put the winning signed axis exactly vertical.
Discrete axis selection still has decision boundaries; orientations are not blended.
Animate over 280 ms with cubic ease-out, or immediately with reduced motion. Viewing direction, pivot, distance
and zoom stay fixed; only roll changes. New navigation interrupts the animation.
Cancellation, Escape and focus loss end the drag without snapping. Releasing Command
mid-drag retains capture. Capture blocks editing, trailing clicks and wheel/pinch.
Camera gestures retain accepted geometry and use the ephemeral view Undo contract. On macOS, Electron’s native
[rotate-gesture event](https://www.electronjs.org/docs/latest/api/browser-window/#event-rotate-gesture-macos)
recognizes a two-finger twist as one 90° view turn about the cursor. The host sends
the current native cursor position with each packet, converted from screen DIP
through the window's content origin and zoom into viewport CSS pixels. Capture
that cursor at recognition; the animation keeps its world point fixed on screen.
Accumulated travel must reach 10° in either direction; smaller motion does not
turn the view.
Once triggered, further rotation packets cannot produce another turn until the
gesture ends. A terminal zero or 200 ms idle rearms recognition. Native twist never
waits for a terminal packet to snap. The quarter-turn and canonical-axis correction
are resolved together before movement, then animated directly to that destination
over 280 ms with monotonic ease-out (immediate with reduced motion). Later twist
packets and release do not restart or correct the animation. Pan and pinch compose
with its incremental roll. Pinch retains its 200 ms idle leveling delay; later zoom packets
restart it, so continued pinch cannot strand an interrupted snap. WebKit's explicit
pinch lifetime holds leveling until its end event. Pointer-down, Escape, blur and
disposal cancel pending leveling; the callback also checks editing/orbit guards.
The narrow host/preload subscription ignores desktop input during tablet handoff,
and the renderer rejects input outside the viewport or during editing/orbit.
The native event is macOS-only; Windows/Linux retain Option-roll.

Tablet one-finger orbit uses the same press-based pivot through pointer events.
Two fingers continuously pan and pinch; twisting 10° triggers one 90° turn about
their midpoint. The animation follows the current midpoint as the pair pans,
keeping the world point under the fingers fixed relative to that midpoint through
rotation and pinch. Further twist in that contact gesture cannot repeat the turn.
The pair is sampled once per frame so separate pointer updates during a pan do
not spuriously cross the twist threshold. Contact-count changes rebase recognition;
the turn animates directly to the leveled destination while preserving the sketch
workspace. Release does not start another correction. Safari's
duplicate gesture events are consumed by the tablet adapter, applying navigation
once. Physical trackpad/iPad gesture feel remains a device-review requirement.

The temporary rotation circle, endpoint markers and diagnostic caption are hidden.

### Control preference and trackpad navigation

The header control dropdown displays the current Trackpad or Mouse choice with a
downward chevron. Its popover has exclusive Trackpad and Mouse choices, remembered
locally with Trackpad as the default. Below a separator, Tablet invokes the existing
desktop handoff; it is an action, never a stored control mode. Browser-only windows
show that action disabled. These preferences do not enter the document or Undo.
Mouse mode maps ordinary wheel input to pointer-anchored zoom and Shift-middle
drag to the existing orbit gesture. Middle and secondary drags still pan. Command
orbit and pinch remain available in either mode. There is no automatic device
classification. A middle press without a drag never replays a selection click.

Two-finger scrolling pans without leaving the sketch plane. Command-click-and-drag
invokes turntable rotation and exits sketch mode.
Two-finger click-and-drag (secondary-button drag) pans.
Pinching zooms about the pointer. Pan and zoom retain the current sketch plane;
orbit exits sketch mode. Camera gestures retain accepted geometry and use the ephemeral view Undo contract.
Middle-button drag remains a mouse pan fallback. The founder selected
secondary-button pan after the three-finger DOM input experiment; no native
trackpad integration or Shift-scroll fallback is needed for this mapping.

See [Electron's swipe API](https://www.electronjs.org/docs/latest/api/browser-window#event-swipe-macos)
and the [WheelEvent fields](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent)
for this input limitation. Founder experiment in the running app (2026-09-14): the attempted two-/three-finger
gestures were reported as scroll events, not distinct touch contacts. This is a
founder-observed result; no raw capture has been reviewed. The temporary Input
experiment pad recorded per-gesture DOM events and exported JSON (commit `0d75c88`);
it was removed after the mapping was settled. Recorder/export
checks pass in Chromium, WebKit and hidden Electron; synthetic touch coverage
checks recorder fidelity only, not hardware delivery.

The input adapter handles [wheel events](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)
with Ctrl for browser pinch and WebKit's [gesture scale events](https://developer.mozilla.org/en-US/docs/Web/API/GestureEvent).
Active WebKit gestures suppress duplicate wheel handling. Scale-only events use
the last pointer position, or viewport center if none exists. Automated tests
exercise pointer/wheel input and synthetic gesture-scale events; they do not
establish physical trackpad or iPad touch behavior.

### Orientation cube

The upper-right cube follows the current camera. Drag with the primary pointer to
use the same turntable rotation and release leveling as Command-drag. Option-drag
roll measures pointer bearing around the cube center, one-to-one in angle; radial
motion adds no roll. Viewport Option-drag retains its model/selection-centered bearing.
A face click
aligns Front (−Y), Back (+Y), Left (−X), Right (+X), Top (+Z), or Bottom (−Z).
The cube has six inset labeled faces, twelve edge bevels and eight
corner bevels. The face half-width is 0.58 of the cube half-width, leaving wider
bevel polygons as the actual pointer/touch targets without overlapping hit regions.
Opposing main faces share their corresponding canonical plane's configured grid
color: Top/Bottom use XY, Front/Back use XZ, and Left/Right use YZ. Color changes
apply immediately; label ink adapts for contrast, while hover/focus retains blue
highlighting and dark labels. Bevels retain their neutral shading.
Labels are projected in each face plane, rotating and foreshortening with the rigid
cube. Edge clicks align to the equal-weight diagonal of their two
axes (flat 45°); corner clicks align to the equal-weight three-axis isometric view.
Bevels have tooltips and accessible names but no visible labels.
A single face click chooses the nearest of its four quarter-turn orientations,
including when already face-aligned. Pointer face clicks wait 250 ms after release;
a second press on the same face within that interval (within 16 CSS px for mouse/pen
or 24 CSS px for touch) suppresses the single-click and aligns directly to canonical
roll on its release. A second press can be held beyond the interval without an
intermediate view change. A drag, pointer cancellation, Escape, blur, another
pointer interaction or wheel/gesture navigation cancels the pending alignment.
Delayed callbacks also reject changed camera/workspace state and active editing
or orbit. Enter/Space remain immediate: nearest roll on approach, canonical roll
when the face is already aligned. Focused cube keys take precedence over
canonical-plane entry shortcuts. Canonical side and diagonal views keep Z upright;
canonical Top uses +Y up and Bottom uses −Y up. Bevel views retain canonical roll.
Cube surfaces are excluded from sequential Tab navigation; Tab is reserved for
editing controls. Direct accessibility activation retains Enter/Space support.
Alignment animates over 280 ms
with cubic ease-out, using the shared camera transition. Reduced motion applies
the orientation immediately; subsequent navigation interrupts the animation.
Navigation retains the view target, distance
and zoom, and exits the planar workspace. Its camera/workspace/selection change uses the ephemeral view Undo contract and creates no geometry edit.
Pointer capture retains drags outside the cube; Escape, cancellation and focus
loss stop without leveling. Active modeling gestures block cube navigation.

## Retained viewport frame

The event-driven renderer retains its last WebGL drawing buffer between redraws.
This keeps canvas captures available and prevents blank regions around local cards
in Chromium. Camera, geometry and viewport changes still trigger ordinary redraws.

Linux CI explicitly selects `MAKESHIFT_TEST_FRAME_MODE=on-demand`. The test driver
sets the renderer flag on initial load and reload; camera animation, scene matrices,
picking, geometry and DOM overlays keep updating. Only GPU presentation is deferred.
Page captures and canvas pixel checks present the current scene at full resolution
before reading pixels, without rerunning interaction refresh callbacks that invalidate
temporary hover highlights. Hover presentation uses the same GPU scheduling path. Ordinary app use and the Mac visual/navigation gate render normally.
