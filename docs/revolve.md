# Revolve

Status: founder-approved, 2026-09-16, including total-height helical sweeps.
Implemented and verified; overlap/axis-crossing follow-up ready for founder review.

## Captured dense-thread limitation (2026-09-20)

Founder review used a radius-6 cylinder with two cylindrical faces: the selected
lower face spans z=0..18 and the whole body spans z=0..52. The agent used the body
extent and attempted a triangular additive helix with radius 5.9 at its base,
radius 7 at its crest, 1 mm axial section height and 1 mm pitch.

The 52- and 26-turn calls hit the native calculator's 10-second deadline. Exact
fixture replay of the 4-turn alternative succeeds five times and fails at the
sixth union (z=20..24). The sixth swept tool and prior-five body each validate;
an isolated OCCT Fuse reports completion without an algorithm error, but its
result has an unorientable face and a non-closed wire. Makeshift's validation rejects
it correctly. The agent's proposed +0.5 mm profile translation fails at the same
sixth union; axial bounding-window overlap was not an established cause.

An 18-turn call also exceeds the shipped deadline, but succeeds in about 15.6 s
with a diagnostic-only 60-second limit. Splitting 18 turns into 4+4+4+4+2 succeeds.
These probes preserve the attempted profile's half-mm end overhangs; they do not
establish a finished thread confined to the selected face or standard thread form.
The diagnosis did not change shipped budgets, validation, or the user's drawing.
Follow-up must address script calculation budgets and union robustness while
retaining cancellation and failed-script rollback; tool availability alone is
not evidence that dense threads are reliable.

## First usable outcome

Draw a closed radial cross-section, leave sketch mode, select it and revolve it
around an explicit axis to make a turned part. Reuse profiles to subtract an
annular groove. Make a partial revolution, sketch on its planar end face and
continue modeling. Results are materialized bodies independent of source sketches.

## Agreed interaction

- Modeling mode only. Select one or several coplanar closed sketch regions or
  planar body faces. Holes remain holes; neighboring selected regions combine.
  A local Revolve icon appears alongside the extrusion affordance.
- Enter Revolve, then explicitly pick an axis: a straight sketch segment (including
  construction geometry), straight body edge, or a world coordinate axis. Hover
  highlights the candidate and shows its infinite axis before selection. No
  automatically chosen axis. The initial scope requires the axis to lie in the
  profile plane; a noncoplanar candidate explains why it cannot be used.
- After axis selection, propose a 360-degree preview with New body as the initial
  result when disjoint, and the existing nonzero-volume-overlap subtraction default
  when intersecting existing bodies. Reuse U/S/I/N and the existing explicit
  Boolean-participant controls. Commutative operations need no target direction.
- Show a local rotation arc and signed angle field near the profile. Drag the end
  handle to reduce the full sweep; type an angle for precision. Positive/negative
  angles choose the two directions around the displayed oriented axis. Limit to
  one revolution in either direction when Height is zero. Nonzero Height permits
  multiple turns; Height is total signed axial travel, not pitch. For example,
  720° and 10 mm produces two turns at 5 mm pitch. A local height handle/field
  adjusts travel along the oriented axis. Zero angle is not a valid revolution.
  Highlight the starting section and current end section for partial sweeps.
- A small axis action re-enters axis picking without losing the input selection.
  Axis direction derives from the picked segment's displayed orientation; changing
  sign reverses the sweep. World axes use their positive world direction.
- Keep the candidate temporary after release. Enter in the field applies the
  angle; Enter outside it, the local checkmark, or a subsequent selection accepts.
  Escape cancels. Pan/orbit/zoom remain available between edits. Window focus loss
  does not accept the body. No parameter panel or Finish wizard.

Profiles may touch or cross the axis. Crossing profiles split at the axis; revolve
or helically sweep each side and union their material. Overlapping turns likewise
union their swept volume. Self-intersection in an intermediate swept shell is not
by itself a reason to reject the requested solid. The final result must still be a
valid, non-self-intersecting BRep; construction failures keep the last valid preview
clearly identified and prevent acceptance. Boolean results may contain multiple
solids; a kernel failure must never be mistaken for an intentional empty result.

## Model ownership and scope

Add a concrete revolve request with captured profile membership or planar face
references, an explicit axis origin/direction, signed angle, total signed height
and Boolean options.
Use the existing document owner, temporary candidate, exact OCCT kernel, body
materialization and immediate topology correspondence. Recompute from original
accepted inputs for every angle/axis/Boolean change; never revolve the last preview.
One accepted result is one Undo. Do not store a feature tree, executable generator,
second document, or a generalized extrude/revolve/loft framework.

The frontend owns profile/axis picking and local angle interaction. The kernel
owns exact region wires, sweep validity, Booleans and result topology. Reuse profile
lowering and existing Boolean behavior where their semantics match. Source sketches
remain independently editable; changing one does not regenerate an accepted body.

Helical sweeps use the same radial section, rotated while translating along the
axis at constant pitch. Overlapping turns must not silently yield an invalid solid.
Special thread standards, arbitrary noncoplanar axes, variable pitch, and persistent
feature-history editing are outside this first increment.
Do not start Loft or extend the embedded agent while implementing Revolve.

## Acceptance and next review

Use ordinary controls to make a full shaft and hollow ring, a 90-degree sector,
and a groove subtraction. Make a two-turn helix with total height, both rotation
and height signs, and verify the end section follows the requested screw motion.
Cover line/arc profiles, multiple regions, explicit axis picking and replacement, signed numeric/drag angles, Boolean modes, release
without acceptance, cancel, one-step Undo/Redo and Save/Open. Independently check
volumes and angular extent. Sketch on a partial result's planar face and extrude.
Replay the two founder captures, including the axis-touch pentagon at 20°, and
verify overlapping circular turns and profiles crossing the axis. Include holes
whose swept cavities are partly filled by another turn. Reject empty or invalid
section results rather than silently losing material.
Verify exact full-revolution seams are excluded from ordinary edge display/picking.
Helical Boolean results can retain valid surface patch edges; cleanup is deferred.
Run headless Chromium/WebKit and hidden Electron; device/platform claims stay separate.

First running geometry/interaction slice should fit about one hour, complete
acceptance about two; report a concrete obstacle before expanding that scope.
The next gate is hands-on review of the turned-part/groove/partial-face/helix loop.
The implementation has reached that gate; the acceptance route above describes
the behavior to exercise. Automated checks do not establish founder acceptance.

## Edit Profile

In Modeling, select a turned body, a face of its connected exterior, or a
through-bore wall and choose **Edit Profile**. The tool recovers a section
from the current BRep in a plane through the selected axis. Visible bodies are
sectioned in that plane, including the current preview. Other bodies can be
used as projection references. Orbit to inspect the part, then choose **Look at
Profile** or press Cmd/Ctrl-Enter to align the same sketch plane head-on.

Use the ordinary sketch tools to edit the temporary profile. Sketch gestures
and their Undo/Redo stay in the profile. Completed gestures refresh the solid
preview. **Apply** accepts the body in one document Undo step. Cancel and Escape
ask before discarding a changed profile. Enter applies the profile from the
canvas. Active sketch tools and numeric fields own their usual shortcuts. Saved
drawings contain the materialized body.

Edit Profile fills and revolves the closed region nearest the axis. If several
regions touch the axis, the fill favors the one with the smallest outer radius.
The axis and the bore end guides can close a region. Curves can extend past
intersections or branch off the boundary and remain in the temporary sketch.
Closed loops can also enclose holes in the region.

Flat end caps are editable lines from the rim to the axis. Move them to change
the body's length or fillet the corner where a cap meets the wall. The sketch
snaps to the axis for new cap endpoints. Recovered caps have a horizontal
constraint and the side curves are selected on entry for radial edits.
After revolving the edited region, the kernel re-cuts separate spherical
dimples, complete through-bores, lengthwise cylindrical cuts and supported planar
notches from the original supports. A lengthwise cut can open through the side
and the caps, or appear in several disconnected patches. For a split cut, the
kernel recovers a meridian clear of the cutter and verifies that revolving and re-cutting it
reproduces the original solid. Recesses that miss or merely touch are omitted.
The preview counts omitted dimples.

An intact meridian supplies the complete cap for a turned part with a planar
notch. The kernel rebuilds a convex cutter from the notch's walls parallel to the
axis and any visible depth plane. It verifies the combination against the
original solid and re-cuts the edited cap against those stationary planes.

A solid fillet stored as a closed spline can also contribute to the profile.
The kernel sections the body through its axis and compares the reconstructed
solid with the original. The recovered fillet uses ordinary cubic sketch
curves within the projection tolerance.

A through-bore profile follows a connected inward revolved wall with two
separate closed openings. Its end guides sit just beyond the stock. The kernel
recovers the stock by filling the bore and verifies that the recovered profile
can reproduce the original solid. Applying an edited profile cuts the recovered
stock and recomputes both openings on its existing surfaces. An edit with no
closed region, a failed retrim or an invalid solid blocks Apply.
