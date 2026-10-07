# Construction planes and plane cuts

Founder-corrected interaction, 2026-09-21. This replaces the original
offset-panel interaction.

Construction planes are independent saved document objects with stable IDs and
orthonormal PlaneFrames. With one planar face selected, Construction plane immediately
creates a plane on that face in one Undo step. Otherwise it picks a world plane,
planar face or saved plane in the viewport. A selected canonical or saved plane seeds
temporary placement immediately, copying its frame into a new plane. Local translation/rotation controls
place the temporary plane; Enter or leaving the tool accepts, Escape cancels.
There is no plane-offset panel. Reselection supports movement, deletion, visibility
and sketch entry. Select a saved plane and use Transform/M for placement,
Enter or viewport double-click for sketch entry, and Delete/Backspace for deletion.
These use the existing selection affordances; there is no floating plane action bar.
Visibility remains view state.

While Revolve is choosing an axis, its own canvas hover and click take priority
over ordinary canonical-plane selection. World-axis clicks therefore stay with
the revolution rather than becoming plane selection or sketch entry.

A sketch begun on a plane copies its evaluated frame and is created on the first
completed drawing gesture. Subsequent plane movement or deletion does not move or
delete sketches or solids. There is no dependency on the original reference face.

Imprint is enabled only for one or more selected faces. Split Body uses the bodies
identified by selected faces, edges or whole-body selections. Both pick a world/saved
plane or any face directly. Plane and analytic face references use their natural
support surface rather than the visible trimmed boundary: cylinders extend along
their axes, cones retain their conical support, and spheres/tori retain their
complete curved support. Bounded spline surfaces retain their native parameter domain; no planar
approximation or speculative spline extrapolation is introduced.
A compact local preview card shows picking/calculating/preview state, section-edge
count and Apply/Cancel; Split also shows the result body count. It stays above the
target's projected bounds, with the shared viewport clearance rules. There is no
separate offset value. Entities lists the target bodies (and selected-face count
for Imprint) and the chosen world plane, saved plane or face cutter. Target
rows and original target surfaces/outlines are blue; the cutter row and evaluated
plane patch or chosen face surface are amber. Imprint highlights only its selected faces.
Temporary calculation correspondence identifies section edges for both planar and
curved cuts; highlight identity never depends on coincident geometric signatures.

Before picking, synchronous infinite-plane/bounding-box checks identify references
crossing any selected body's bounds. Curved faces remain broad candidates; their
exact intersection is evaluated only after picking. No native operations run
during reference discovery. Disjoint and box-tangent planes and hidden references are excluded.
This is a broad filter: concavities, selected-face coverage and existing imprints
may leave ineffective references selectable. Exact validation runs only on picking
a reference. Canonical grids use the single most face-on visibility target, smooth crossfades
and selectable thresholds; saved
plane and face candidate outlines remain visible. Hover adds a blue fill to exactly the reference the shared
click picker would choose, including a face's actual visible surface. Entities rows highlight their own saved
reference. Hover clears on leaving, navigation or tool exit and never changes geometry. Discovery does not create previews or alter history.
Canonical references cover the viewport; saved plane patches can be picked throughout their displayed interiors,
using the nearest eligible reference when patches and planar faces overlap.
Picking stays on the canvas so camera gestures remain available. Canonical references use viewport bounds and saved patches retain adaptive geometry
bounds. Neither has floating labels; saved references remain available
in Entities. At coincident hit depths, an eligible face wins the tie against a patch.
Curved reference inputs store document-local body/face IDs and resolve exact
supports, including face placement, in the original document used for the edit.
Reopen restores these inputs through the same preview path. Scripts supply exactly
one `frame` or `surface: {body, face}` for Split Body and Imprint.

Clicking a valid reference produces a temporary exact preview. Magenta lines show
Imprint's newly created section edges and Split's result section borders, including
borders already imprinted before splitting; boundary subdivisions outside the section and
periodic seams are excluded. Invalid/no-op picks keep the inputs visible, clear
result highlights and disable Apply. Explicit Apply or Enter keeps the highlighted
exact edges selected for subsequent editing; the status confirms application.
Clicking away still clears selection.
Apply, Enter, clicking away, selecting another entity or toggling the active command accepts in one Undo step;
Escape cancels and restores the original selection. Another valid reference replaces
the preview. Leaving before a valid preview exits without changing geometry.

- Split Body creates separate closed bodies.
- Imprint subdivides the selected faces, creating selectable exact edges without
  removing material, adding caps or changing support surfaces. Shared boundary edges
  may subdivide to preserve valid topology.

Failures reject atomically. Automatic cleanup must not erase deliberate imprints;
explicit cleanup remains a separate edit. Acceptance covers selected face sets,
curved/oblique/hollow geometry, exact no-op handling on preview, actual reference picking,
subsequent edge editing, cancellation, Undo/Redo and Save/Open.

Volume conservation retains a relative allowance of 1e-7 (with a unit-volume
floor). Estimated integration errors consume that allowance. If ordinary adaptive
integration disagrees, retry with spline-span Gauss–Kronrod integration from a
shared exterior reference plane. This changes measurement only; source geometry,
split topology and validation precision remain unchanged.

## Cross-section view

**Cross section** in Cmd-F → View uses one selected planar face, canonical or saved plane;
otherwise it picks a world plane, saved plane or planar face in the viewport.
The initial cut removes the camera-facing half. Its direction then stays fixed
while orbiting. Existing XYZ plane handles translate/rotate it by dragging or
numeric entry. **Flip side** reverses the normal 180° at the same origin, keeping
the exact same infinite support plane; it does not orbit the camera.

The section frame belongs to renderer view state, copied from its reference.
Moving it never edits a construction plane, sketch or body and creates no document
Undo entry. While adjusting, local Undo/Redo restores completed placement tweaks
(see [interaction history](edit-lifecycle.md#temporary-interaction-history-founder-decision-2026-10-02)). Enter/Done keeps the section visible and releases placement; **Adjust
section** reopens its handles, **Choose section plane** replaces the reference,
and **Turn off section** restores the full view. Escape/Cancel restores the view
from before adjustment, including restoring no section after first activation.
Invalid numeric input must be corrected or cancelled. A new section starts from
selection; an existing section resumes at its last placement.

Clipping updates during drag. After release, the existing exact section query
fills the exposed solid cross section, including holes; these fills are visual,
not new selectable topology. While a new fill is calculating the clipped shell
remains visible. During a body-edit preview, accepted-body fills are hidden until
acceptance to avoid displaying a stale cut surface. Faces, edges, reference patches and sketches on the removed
side do not participate in point picking or snapping. Geometry operations still
operate on whole accepted entities, not visually trimmed fragments.

Sketch mode temporarily uses its own camera-facing clipping and section capture;
returning to Modeling restores the cross-section view. New/Open resets the view.
The section is not saved in the document or included in exported geometry.

Coplanar rendering gives existing body faces priority over generated section fills.
Body faces on the active section support mark stencil bit 4; caps exclude those
samples and write only the solid-silhouette bit 2. Sketch-fill union retains bit 1.
This preserves face selection colors without competing coplanar triangulations;
material stencil state updates when the plane moves, without retessellating bodies.
Filled surfaces, sketch overlays and plane cues interpolate signed clip distances
computed at vertices, avoiding cancellation from interpolated camera-space positions
on thin triangles. The clipping tolerance and actual section plane remain unchanged.
