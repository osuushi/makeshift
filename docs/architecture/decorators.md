# Decorators V1

2026-09-24. Current implementation contract and founder-approved scope.
Metric is a diameter-driven family;
compatible split descendants inherit threads; decorator composition is outside V1;
off-table diameters remain exact/nonstandard; decorator code travels in the file.
Mirroring preserves configured handedness; scaling preserves pitch and clearance;
one fit allowance is implemented as hole-side relief. General transform hooks
are deferred.
Nearest-listed coarse pitch supplies the Metric default; compatibility and
consistency under equal settings take priority. End tapers are configurable and
middle-of-rod threads are in scope. Print-in-place support and user-facing phase
alignment controls are deferred. One decorator per face; effects
from different decorated faces may overlap with undefined behavior.

## Requested outcome

Attach editable settings to selected geometry without replacing that geometry.
At export, generate mesh modifications using the accepted geometry
as read-only input. Threads and [knurling](knurling.md) are built-in decorators. JavaScript authors
must be able to implement the same hooks. The built-in [gear decorator](gears.md)
adds pitch-cylinder, pitch-cone and rack tools using the same owner and mesh pipeline. Automatic spur gear groups are described there; approximate cylinder
recognition, shader previews and print-color assignment remain
later work.

Apply to multiple cylindrical faces, internal or external. Reject incompatible
mixed selections with a reason rather than silently dropping targets. Partition
compatible faces into individual continuous thread instances; applying to several
rods creates several instances in one edit. Users normally see threads and their
settings, not the internal grouping noun.

## Preview display and pending work

Application Settings chooses the default display: Geometry, Texture (normal shading),
or Color only. Each Display control offers Default (Geometry/Texture/Color only),
showing the current inherited choice, plus those three
explicit modes. An omitted override follows the device default, including existing
documents. Explicit overrides are saved attachment metadata and use ordinary Undo/Redo;
gear groups own one shared display choice, edited beside their group preview color.
Editing any member applies the choice to its whole group in one Undo step; joining
members inherit the destination group's mode. Ungrouped decorators remain independent.
Mixed selections show Mixed. Overrides do not change geometry settings or presets,
and custom decorators need no executable code enabled to change display.
Settings also offers thread/knurling/custom colors and per-kind opacity. Gear colors
belong to saved, editable [gear groups](gears.md), including all three display modes.
The default and non-gear appearance choices are device preferences outside files and
Undo; none of these display choices turns decorators into native BRep.
The compositor excludes only a surface's own supports when resolving occlusion,
then blends its configured opacity once. Section caps contribute depth from the
complete body shell, so cut material hides previews while cavities remain open.
This depth pass does not change the visible cap patterns or their overlap blending.
In body X-ray mode, every decorator follows
its owning body into the normal or X-ray layer, including fallback color and texture
previews. The body layer opacity then fades the body and its decorations together;
normal-body decorations remain visible through X-ray bodies. Generated previews and
attachment markers cannot intercept analytic face picking.
Texture supports decorator-owned normal evaluation. Threads evaluate analytic helix,
profile and cone-envelope derivatives per display pixel on the original trimmed
support tessellation, with pixel-footprint sampling and distant-detail filtering.
This path requires neither a thread preview mesh nor a fixed-resolution normal map.
Other decorators fall back to generating their preview mesh and baking facing triangle
normals onto the support tessellation in the preview worker. Texture changes
lighting, not the support silhouette, depth, picking, accepted geometry or export.
Texture uses a smoother material finish so specular highlights follow the projected
relief as the view turns; Geometry and Color only retain their existing finish.
Planes, cylinders and cones use continuous analytic charts (with wrapped radial
seams). Their bake rasterizes conservative triangle footprints and intersects only
the normal lines in those footprints; it avoids a mesh-tree traversal per texel.
Other surfaces use a padded triangle atlas with accelerated ray queries. Missing intersections retain
the support normal. Projection selects the closest facing intersection along either
direction of the support normal; overhangs and multiple relief layers cannot all
be represented. There is no parallax displacement or relief self-shadowing.
Fallback live maps target 256 pixels square and settled maps 512; generic atlases may grow
to 1024 to retain padding. Supports above 65,536 triangles report an explicit preview
error and retain attachment coloring. Small features can alias, especially on dense
generic atlases; Geometry remains the full-profile alternative. Maps are cached per
matching preview result, disposed with it, and never rebaked for camera movement.
Resolved per-instance modes participate in preview signatures, so stale replies cannot
restore an earlier display. Mode changes interrupt incompatible worker jobs; Color only
skips generation for that instance while other instances may still generate geometry or textures.
Thread previews omit the auxiliary cylindrical skin and volume-closing facets at
axial ends and adjacent planar boundaries, so those helper surfaces do not color
over rims or end faces. Clipping still uses closed volumes; threaded extent and
exported geometry are unchanged.
Shader clipping keeps a half-pixel display margin at adjacent planar ends to keep
antialias coverage off the end face. Occlusion uses solid depth without its edge-line
display offset; that offset is restored for ordinary drawing.

When a signature changes, remove its old generated mesh immediately and show the
current trimmed face tessellation in the decorator's color. This marks attachment,
not the final profile. A matching coarse mesh remains visible while settled detail
is being calculated, then a matching result replaces it. Busy feedback reports
actual active/queued preview work. Stale replies cannot restore a moved, removed,
unresolved or hidden attachment. Partial multi-body results only replace markers
for bodies with a drawable generated mesh containing indexed triangles. Custom
previews containing only vertices or no mesh keep the attachment marker. A valid
attachment also keeps its current-face coloring after a preview worker error; the
error notice is explicit and does not claim successful generation. Invalid or
detached attachments use the repair/problem interface instead of a success marker. If all
instances resolve to Color only, pending workers retire; attachment coloring continues
to follow current geometry without expensive preview jobs. Export is
unchanged. Live worker replies include transient durations and sampling hints for
local measurements, not persisted document state or a performance guarantee.

## Ownership and geometry

DocumentOwner owns accepted attachments, settings and bundled source through
ordinary edits and snapshot Undo. Numeric candidates and generated preview meshes
are temporary. The native kernel supplies analytic face descriptors, tessellated
trimmed domains and immediate topology correspondence. Correspondence is consumed
during acceptance; it is not a persistent operation-history graph. Export refines
a read-only copy and coordinates mesh export through a worker. There is no second
document, BRep mutation at export or executable feature history. On Electron and
the local development backend, the worker sends generated meshes and temporary
mesh operations to native Manifold; clients without that capability retain WASM.

## Interaction

1. Select faces and invoke Threads; show eligibility reasons in tool discovery.
2. Create all inferred instances atomically with resolved settings and a preview.
   If default thread settings fail geometry validation, open a provisional settings
   editor with the error in context. Preset/profile/numeric changes remain local;
   only valid settings display a preview and enable Create threads. The editor
   explains that the defaults do not fit and nothing is added until confirmation.
   Switching to another mode/action also uses ordinary validated creation;
   invalid latest settings cancel before the requested action continues. Pending
   validation uses the shared 500 ms Wait/Cancel boundary.
   Create threads accepts all inferred instances in one ordinary owner edit and Undo step.
   Cancel/Escape discards the settings and preview before creation is sent. While the
   atomic application runs, the editor shows Creating threads and retains its interaction
   lease until acceptance completes. Moving between fields does not accept them. Valid initial settings retain immediate application; reapplying to
   already decorated faces opens their accepted settings.
3. A right-side decorator panel shows instances touching the selection, aggregated
   by type. Equal fields show values; unequal fields show Mixed. A change patches
   only that field across affected instances, preserving every other setting.
   Mixed selections show both built-in and custom controls. Editing or removing
   one type affects only that type's instances and selected members.
4. Editing a setting first selects all faces of the affected instances, then
   updates them in one Undo step. Numeric drafts preview; confirmation accepts;
   Escape cancels. Merely focusing a field should not change the document.
   A discrete preset/action first accepts a valid numeric draft or foreign geometry
   preview, then rereads accepted instances and face references. Offset→Metric
   therefore infers pitch from the accepted cylinder diameter. Numeric blur and
   the requested action share one awaited acceptance; invalid input retains its
   text/owner and does not apply an older preview.
5. Clicking a decorator selects its faces. Deselecting some and using the panel's
   Remove thread decorator action removes membership only from the still-selected faces.
   This must not be routed through the viewport's geometry Delete action.
6. Continue threads adds selected faces only when they form one compatible
   continuation with the chosen instance. Otherwise use decorator-specific wording
   and offer separate application; initial multi-rod application remains valid.
7. Removing members keeps the remaining phase and settings. Empty instances vanish.
   Do not automatically merge independently created instances after geometry edits.
8. A face has at most one decorator in V1. Applying Threads to an already threaded
   face opens its existing settings rather than adding another instance. A different
   decorator requires removing the existing assignment first.

The same typed operations serve agents, including inspection of settings, members,
resolved dimensions and diagnostics. Multi-selection does not create a permanent
relationship between separately threaded parts.

STEP export offers an explicit choice when visible bodies have decorators:
include their final meshes as AP242 tessellated geometry, or omit decorators and
export the underlying exact solids. Undecorated bodies remain exact. The warning
explains mesh editability and receiving-app support limitations; no export hook
or accepted BRep changes. See [STEP export](persistence.md#step-export).

## Thread geometry contract

Equal reference diameters plus the same resolved thread definition must produce
compatible male/female profiles, with independently chosen lengths. Resolve
profile, pitch, hand, start count (one initially), reference convention and fit
allowance consistently; independent defaults per face must not break mating.

| Reference mode | Exterior rod | Interior hole |
| --- | --- | --- |
| Cut into rod | Remove material inward from the reference cylinder | Add complementary ridges inward into the hole |
| Cut into hole | Add ridges outward from the reference cylinder | Remove complementary grooves outward into the wall |

This describes the zero-clearance reference construction. Hole radial relief is
one outward radial offset applied to the entire female profile, including roots,
crests and flanks; it is not a normal-to-flank offset or an ISO fit class. The rod
receives no second allowance. The control displays millimeters.
The shared Cut into control has only Rod and Hole options. Selecting the same
option for equal-diameter mating faces uses the same reference construction;
the label does not switch by face type.
Thread cuts clear intersecting material in their owning body within the thread
volume and axial extent. Compatibility does not promise assembly through other
bodies, unthreaded portions or blind-hole bottoms outside that extent.

Confirmed: Metric is the preset family; cylinder diameter determines thread size,
rather than a preset such as M10 overriding the modeled cylinder. An off-table
diameter such as 10.3 mm remains exactly 10.3 mm and produces a nonstandard thread.
The chosen cut mode affects the relation between reference diameter and standard
major/minor diameters; that mapping must be explicit. Never silently relabel a
nonstandard result. Diameter changes update the reference diameter and its dependent
envelope dimensions using the same rule in preview and export, while resolved pitch
and clearance remain fixed. A preset supplies concrete settings; changing geometry
does not silently reapply that preset or choose a different pitch. Confirmed:
initialize Metric pitch from the nearest listed diameter's coarse pitch without
snapping the modeled diameter. Use one deterministic lookup and tie rule for both
internal and external threads. Applying equal settings to equal reference
diameters must resolve consistently, whether applied together or separately.

FDM fine/coarse, Metric and Custom are the available presets. Preset values, not
just a mutable preset name, are saved. Do not infer print direction from camera
orientation or claim guaranteed physical fit. Separate Print upright/Print sideways
presets were removed by the founder on 2026-10-04. Future orientation compensation
within FDM settings requires a separate design; no physical calibration is included.

Threads now default to FDM fine with 1 mm pitch; FDM coarse uses 1.5 mm pitch.
Both derive from the founder's 1 mm radial triangular envelope. At the rod's
outer crest, truncate 0.1 mm radially inward. Flatten the matching hole groove
by removing hole material near its outer root, keeping its maximum radius.
The opposite tips retain the original sharp profile. Relative to the unmodified
triangle, tip truncation removes material from both parts and increases their
local gap; it does not replace the separate radial hole clearance. Neither
preset changes the modeled diameter or depends on layer/nozzle
dimensions. Both FDM presets begin with 0.25 mm hole-side radial relief. Choosing a preset
explicitly restores its default clearance and the 0.1 mm truncation.
Saved explicit clearance values remain unchanged. The simple panel shows preset,
handedness, Cut into and a Clearance field for this relief. Its hint asks users
to adjust clearance for their printer and orientation.
Pitch, profile, tip truncation and tapers are in collapsed Advanced controls. Changing an FDM preset's pitch,
profile or tip truncation marks it Custom; clearance, handedness, cut and
extent edits keep the chosen preset. Older documents without tip truncation
retain their sharp profile until a preset is explicitly reapplied. Edits use
the same owner/Undo path.

Decorator panels use one Preset menu, grouping built-in choices under Global and
named document-local presets under Document. Save as document preset creates a
copy through a focused name dialog. Rename… in the same menu edits a document
preset name in that dialog; no permanent duplicate name field is shown. Automatic
copies use “copy”, “copy 2”, “copy 3”, including copies of copies. The thread
reference-diameter paragraph is omitted; actionable geometry warnings and their face-selection controls remain.
A preset stores resolved settings for one definition/version, so
reusing it preserves explicit dimensions rather than re-inferring them. The last
accepted choice per definition/version is saved with the document and reused on
application. Editing a built-in creates a local copy. Editing an unshared local
preset updates that copy; editing one used by other parts forks it so their settings
remain unchanged. Preset selection, copies, names, and last choices participate in
ordinary Undo and archives. Numeric preview/cancellation does not save a preset.
These settings snapshots do not link geometry or automatically resize mating parts.
Automatic [spur-gear groups](gears.md) recall shared fitting limits and pressure,
then refit integer counts and profiles to the group dimensions independently of placement.
Phase remains attached to each part. Their group membership,
rather than preset sharing, maintains compatible generated profiles through resize.

The Metric 60° and rounded profiles retain their prior depth rule; the FDM
triangle's 1 mm radial envelope is fixed across pitch edits.

Older saved `print-upright`/`print-sideways` settings open as Custom. The archive
reader changes only the preset label; saved pitch, profile, clearance, handedness,
cut, truncation and extent values remain unchanged. Settings read directly through
other APIs use the same label normalization. Retained layer/nozzle values are inert
compatibility metadata and are not shown as controls. Missing metadata remains
absent. Neither metadata edits nor geometry changes reapply
the retired heuristic. Explicitly choosing FDM fine/coarse or Metric applies that
current preset's dimensions through the ordinary owner/Undo path.

## Thread extent and ends

Confirmed: thread cuts apply to the whole owning body within the thread's axial
extent, without clipping to selected face domains or neighboring surfaces. An
internal thread uses a filled bore cutter, clearing inward shelves and crossbars
as well as the groove envelope. An external Cut-into-rod thread uses its radial
groove cutter, including buried material within that envelope. Other bodies are
untouched. Added thread material still follows the selected trimmed face domains.
Start/end taper lengths are configurable; built-in presets set both to half their
resolved pitch on rods and zero on holes, independent of Cut into mode. Recalling a
built-in choice resolves taper defaults for the new support. Explicit taper edits,
local preset snapshots and saved documents retain their values. Tapers clip the unchanged thread profile against a linear cone:
rod radii are capped with min(profile, cone), hole radii with max(profile, cone).
The end cone reaches the rod root or hole groove envelope, always removing
material in either Cut into mode. Mesh facets follow the cone/profile intersection
and the meeting point of overlapping end tapers. This changes preview/export
meshes only, not the underlying BRep. Tapers do not restart at face seams or
angular interruptions such as flattened sides.

Middle-of-rod threads remain a V1 case; a thread need not reach the rod end.
This does not guarantee that mating parts can be assembled in every surrounding
geometry configuration.

New threads cover the full selected face; inset controls are no longer exposed.
Saved start/end insets remain supported along the saved thread axis so existing
documents retain their threaded band. Cuts cover the full axial band, including
intervening material; additions intersect selected face domains and do not fill
flats or gaps. Apply optional
tapers at its axial ends and preserve helix phase when changing extent. Exact
behavior at separated axial patches must remain consistent with one continuous
helix and the requested face coverage.

Body splitting and partial decorator removal retain the previous axial reference
in the saved thread frame. Insets and tapers use that reference, while generated
coverage is clipped to surviving faces; a split outside the band can have empty
coverage without becoming unresolved. Continuing onto additional faces expands
the reference when necessary. Reassigning starts from the replacement geometry.
Rigid transforms transport the frame; scaling scales the inherited reference,
while pitch, relief, inset and taper settings retain their physical values.

Founder decision: defer print-in-place support, including user-facing phase
alignment controls and captive-pair acceptance. V1 promises compatible thread
forms, not clearance between independently decorated parts in their current
exported positions. Internal phase continuity within each thread instance remains
required across selected patches, topology changes and extent edits.

## Continuity, boundaries and editing geometry

Partition by body, cylindrical support (axis line and radius within documented
tolerances) and material side. Opposite parameter-axis signs do not imply different
supports. Disconnected selected patches can share one instance: angular gaps,
flats and separated axial sections do not restart the helix.

Save a thread reference frame and phase when first applied. Do not derive phase
again from the first remaining face or its parameter seam. Transport this frame
through rigid movement; copying creates independent instances with copied settings.

Use actual trimmed face domains, including holes and sloping ends, for additions.
A full cylinder would fill flats and bridge gaps. Cuts deliberately use the full
thread volume across the owning body, bounded by the saved thread extent.
Thread-specific diagnostics can inspect adjacent original geometry and report
implicated face IDs. This is distinct from cross-decorator overlap handling below;
V1 does not require detecting or diagnosing overlaps between decorator outputs.

The panel reports the exact reference diameter and its rod-major/rod-minor meaning
for the selected cut mode, identifying diameters absent from the coarse table as
nonstandard. Current nonblocking geometry warnings check opposite coaxial walls
with overlapping axial coverage against maximum removal depth. These are
conservative local checks, not collision or assembly certification. Each warning
selects both decorated and implicated faces through ordinary selection. The flat
obstruction warning is removed: the cutter clears that material directly.

The built-in constructs one body-wide removal volume and separate radial masks
for additions to selected trimmed patches. Additions retain adjacent planar and
cylindrical clipping; cuts are never clipped back to the original face footprint.
The same operands drive preview and export. Preview computes the resulting body
and uses transient Boolean mesh provenance to separate newly generated thread
surfaces from remaining original surfaces. The latter replace the owning body's
occlusion mesh, so openings reveal the thread while untouched material continues
to hide its far side. These temporary mesh IDs are not document identities.
Only axial end planes clip antialiased preview fragments; longitudinal or oblique
planes must not clip away body-wide cuts. Decorator membership, analytic picking,
accepted BRep and Undo are unchanged. `tests/thread-flat-preview-ui.mjs` covers
rod and hole openings, remaining-flat occlusion, original face picking and native
3MF export in hidden Electron. Model tests cover off-center open holes, body-wide
crossbar removal, separate-body preservation and complementary watertight exports.
Thread cuts can still pierce thin walls; their diagnostic is retained.

Confirmed topology policy: follow compatible split
descendants, preserve phase and exclude newly generated unrelated faces. For
merges with unselected regions or conflicting settings, retain an unresolved
instance and identify the repair needed rather than expand coverage silently.

Explicit solid Cleanup protects boundaries between different active decorator
instances and between decorated and undecorated faces, while it may merge faces
belonging to the same instance. Other modeling operations still use the unresolved
repair policy when their topology merges incompatible regions.

Consume immediate operation correspondence when accepting the geometry edit;
do not add a persistent operation-history graph. Undo restores geometry and
decorator assignments together. Body deletion removes its decorations. Explicit
face deletion also removes a decoration when all its assigned faces were selected
for deletion and none survive; other lost supports retain the repair diagnostic.

Invalid decorators show red warning stripes on surviving affected faces, including
when deselected; selection lightens the red while retaining the pattern. Geometry
Threads never open the automatic repair panel or its select/reassign/discard controls.
Selecting the face opens the normal thread fields with the validation message and
advanced controls expanded. A valid settings edit clears that validation failure
in the same Undo step. Settings edits do not clear topology ambiguity or lost supports.
Geometry edits revalidate stored settings failures: restoring a valid radius or
length clears the error in the temporary candidate and accepted result without
changing thread parameters. Undo/Redo restores validity with the geometry.

Unresolved topology attachments remain in the document with their repair reason, even when
their original faces no longer exist. For non-thread decorators the panel can select surviving affected
geometry, reassign an attachment to selected compatible faces, or remove that
individual attachment. Unresolved attachments reserve no active face assignment.
Threads with surviving faces use their ordinary selection editor and removal action;
there is currently no thread reassignment UI for lost or ambiguous supports.
They block export until repaired or removed, but do not hide valid previews on
other faces. Kept Boolean originals retain their own attachments; resulting bodies
receive independent identities through the same correspondence rules.

Confirmed V1 transform behavior: reflection preserves the configured handedness;
uniform scaling preserves physical pitch and clearance while the decoration follows
the changed cylinder diameter and face extent. The final decorated object therefore
need not be a literal reflection or scaled copy of its former exported mesh.
Transform the geometric placement/reference frame without implicitly reversing the
handedness setting or scaling those numeric settings. Do not retain a stale standard
size designation after the diameter changes.

General decorator hooks for transform-specific behavior are future work, not part
of the V1 interface. Axial stretch and equal radial scale retain cylindrical supports
and attached decorators, preserving thread pitch/clearance and knurl settings.
Gear groups retain their ordinary diameter-dependent fitting behavior. Nonuniform
scale that destroys cylindrical eligibility must visibly invalidate the affected
threads. Geometry and decorator parameter edits remain distinct operations.

## Small extension contract

Persist instance ID, definition ID/version, target references, validated settings,
and only the decorator-specific continuity data needed (thread frame/phase).
Preview meshes, kernel handles and geometric diagnostics are derived, never
authoritative. An unresolved attachment and its repair reason are persisted model
state so a later save/open cannot silently restore an ambiguous assignment.

Definition responsibilities:

- Settings schema: a bounded JSON-schema-shaped subset, units, labels, ranges,
  enums, defaults and conditional applicability; host owns Mixed-value behavior.
- Eligibility and partition: reasons, implicated targets and stable continuation
  information; Continue uses the same geometric rules plus its existing instance.
- Validation: structured errors/warnings with optional face/edge highlights.
- Optional preview: mesh overlay from the same geometric definition at coarser
  resolution; never selectable or hoverable. The compositor handles coincident faces.
- Export: read-only original selected geometry context; generate independent
  mesh modifications for host application to the body mesh. No hook receives
  another decorator's output, and no identity-preserving BRep output is required.

Expose useful immutable geometry queries/descriptors, with exact BRep queries
prepared before mesh generation if necessary. Passing a BRep string alone does not
give JavaScript authors a usable geometric API. No BRep mutation in this pipeline.

Run geometry work outside the UI thread, with bounded inputs and cancellation.
Use a single sequential export pipeline from one accepted snapshot. Opening a
saved file must not automatically execute unknown embedded JavaScript. Confirmed:
bundle decorator code with the document. Packaging uses a self-contained
module and declarative manifest, stored once per definition/version, with no
network dependency resolution at export. Pin source bytes; updating code is an
explicit document change, not an installed plugin silently changing old exports.
Code replacement and settings edits are atomic owner edits with Undo. A script
can combine them in one accepted transaction; executable definitions are not
independently watched agent workspace files.
A Worker alone is not a security sandbox. Missing definitions
retain data, identify the missing dependency and block affected export rather
than silently omit a decoration. No marketplace or general plugin platform needed.

The interpreter is QuickJS through pinned `quickjs-emscripten-core` and
`@jitl/quickjs-wasmfile-release-sync` 0.32.0 (MIT; the WASM package includes the
QuickJS license). The wrapper creates a fresh VM for each synchronous hook,
installs no host callbacks, denies external imports, and exchanges only JSON.
Current bounds are 256 KiB source, 32 MiB input/output JSON, 128 MiB VM memory,
512 KiB stack and a 10-second hook deadline. Optional `livePreview: true` opts
a preview hook into temporary modeling gestures. Its context includes `live: true`,
a coarser suggested tolerance and `preview: {targetMs, history}`. History holds up
to three measured group durations and optional plugin-returned JSON state under
16 KiB. State is view-only, reset on membership/settings changes and never saved
or exported. A legacy mesh/null return still works; `{mesh,state}` carries the
optional record. The per-group target shares a 100 ms update budget. QuickJS live
callbacks have at most 100 ms, bounded further by that group's target. Built-in
threads use measured cost to adapt angular and axial preview resolution; export
sampling is unchanged. Without live opt-in, previews wait for 100 ms of inactivity.
Paused candidates and accepted geometry request ordinary full-quality previews.
One retained worker computes serially, coalescing pending candidates to the latest
one; it never delays a new live job until motion stops. A preview request carries
per-instance support signatures. Built-in threads depend on their owning body's
faces, so moving an unrelated body neither regenerates their mesh nor restarts
their transition. Live/full-quality state is tracked per group: beginning or ending
a gesture changes only groups whose support changed or whose own live preview must
settle. Identical candidate geometry is skipped. Custom previews can
inspect the full document, so their signature includes it and the enabled-source
key. Each view and worker queue memoizes serialized inputs by immutable support
body/document identity. Multiple thread groups sharing a body serialize its faces
once; unchanged support objects reuse those bytes through selection and unrelated
edits. This cache owns only derived strings and keeps the existing signature
dependencies and bytes. Transport copies may need serialization again. Each changed group
fades in over 100 ms. A stale preview fades out over 200 ms after its fade-in
finishes, or immediately when a newer preview replaces it. The sketch foreground
pass renders the same preview with its complementary clip, keeping it visible
while the sketch plane cuts the body. The 100 ms callback
deadline is not a wall-clock limit for mesh generation or worker startup, so
long previews can visibly lag. Worker termination remains the outer cancellation
mechanism. Upstream runtime APIs are documented in the
[pinned runtime source](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/packages/quickjs-emscripten-core/src/runtime.ts).
These limits constrain execution; they do not validate returned geometry.

`decoratorDefinitions` stores a manifest, bounded settings schema and exact source
once per ID/version. The ordinary `decorator-definition` owner edit installs,
replaces or removes this bundle with snapshot Undo. Installation and opening do
not execute source. Replacement must preserve valid settings on existing instances;
removal is rejected while instances reference that version. Source-specific
enablement is owner-session state, cleared on new/open and excluded from archive
and Undo snapshots. Custom apply/settings/continue edits pass through the owner;
partition and diagnostic outputs are validated before acceptance. Export applies
validated closed modifier meshes to the original body mesh. Optional previews
can return open meshes and remain non-pickable. The library imports JSON bundles,
offers enable/disable/apply controls, and uses the manifest's settings fields.
The [raised-pad example](../../examples/decorators/README.md) exercises this path.
The read-only `decorator-inspect` query resolves eligibility/partition and
diagnostics through enabled code without changing the document or Undo. The
read-only `decorator-draft` query validates custom numeric settings through the
same enabled hooks. Built-in and custom numeric controls share a temporary
interaction: typing previews, Enter or blur accepts one edit, and Escape cancels.
Pending custom validation coalesces to the latest input; cancelled or obsolete
results cannot replace the current preview. Draft queries do not alter owner
candidates, accepted data or Undo.
The library disables Apply while checking, displays rejection reasons, and discards
results for replaced selections/documents. Selected custom instances show their
diagnostics with ordinary affected-face/edge selection. Highlight references must
exist on the selected bodies; invalid references reject the hook result. Highlighting
keeps the decorated faces selected so their settings remain available, and removes
duplicate targets. Custom topology continuation
uses the same immediate predecessor mapping as threads. Compatible descendants
are passed to partition/validation with the previous instance settings/state and
transported frame; returned groups receive independent IDs where necessary.
Merges with unrelated faces remain unresolved. Disabled code never runs during
continuation: the attachment remains repairable through enablement and reassign.
The work pending between native calculation and hook validation is ephemeral,
not serialized history. Manual and scripted geometry acceptance resolve it before
accepting a document. Continue offers the last selected custom instance on a new
face selection and enables only when inspection resolves one compatible group.
Acceptance expands selection to all members. Partial removal preserves remaining
members. The library exposes exact source, portable bundle export and Undoable
removal of unused bundles.

Agent scripts expose `decorators`, `inspectDecorator`, `editDecorator`,
`editDecoratorDefinition` and `enableDecorator`. Catalog and hook inspection read
the current temporary candidate. Edits share the ordinary instance/definition
validators, with script acceptance as one Undo step. Source enablement is forked
for the script and adopted only on success; cancellation/failure cannot change the
accepted session's permission. Enablement itself remains session state outside
Undo and archives. Ordinary inspection lists bundled source/schema, instances and
built-in fields; face inspection includes its attachments. Thread inspection uses
the same cylinder partition, settings resolution and highlighted local warnings.
`makeshift docs/types` carries the authoring and typed command contracts.

## Mesh export and preview

Manifests may declare `dependencies: { continuation, preview }` independently.
Each value is `"faces"`, `"adjacent-faces"`, or `"bodies"`. `faces` covers the
selected face descriptors and trimmed tessellation; `adjacent-faces` also includes
every current face sharing an edge with a selected face; `bodies` covers the full
geometry context (IDs, volume, center, bounds, faces and edges). These are author
promises about hook reads, not restrictions on the supplied context. A face-scoped
hook must not depend on body center, volume, bounds or nonselected edges/faces.
Instance state/settings and bundled definition/source enablement still participate
in preview keys. Missing continuation scope conservatively uses whole support
bodies; missing custom preview scope retains whole-document/source invalidation.
No arbitrary plugin code runs to decide whether a cached preview is still current.

Continuation first checks immutable support identity, then declared geometry
values when a body was rebuilt. Copies, splits and merged supports still consume
topology correspondence. Gear uses selected faces for continuation, adjacent faces
for previews, and independently checks group-wide fitting dependencies, including
the available outer wall behind internal-ring roots. Preview
invalidation compares effective inputs, not document identity or whether fitting
ran. Unchanged meshes remain visible and pending matching results stay valid.
These keys and continuation memoization are transient; no revision or cache data
is added to the saved application document.

The export path captures accepted geometry/settings; prepares geometry context
and sufficiently accurate base tessellation; validates inputs; generates independent
modifications from the original geometry; applies those modifications to
each body mesh; validates results; and encodes through existing STL/3MF paths.
Bodies remain separate export objects. Failure identifies the body/decorator and
produces no partial file. Export changes neither the document nor Undo.

Preview delivery keeps the warm worker's per-instance cache aligned with visible
surfaces. A newer geometry request retains completed results for unchanged support
signatures, including when switching between settled and live preview. Stale mesh
results cannot replace current surfaces. Clearing previews or changing enabled
sources terminates that worker and retires its outstanding replies.

Confirmed: no decorator composition in V1. No ordering UI, modifier stack or
mesh-input decorator signature. Multiple independent decorations on a body are
still supported, with at most one decorator assigned to each face. Confirmed:
overlap between effects on different faces is undefined behavior in V1. Do not
implement cross-decorator conflict detection, special overlap warnings, or an
overlap-based export gate. Internal execution order is not a promised composition
contract. Apply the ordinary mesh validity/error checks to whatever result is
produced. The host's mesh Booleans are not a public composition API.

Manifold 3.5.3 is pinned as a build dependency. Vite bundles its core JS/WASM into
the export/preview workers; the npm package's CLI, glTF and image-conversion tools
are not imported or shipped. Release notices explicitly include its Apache-2.0
license despite the build-only npm classification. Native document/model modules
do not depend on the mesh runtime. No upstream implementation source was copied.

Desktop exports use a separate native Manifold 3.5.3 executable with statically
linked oneTBB. Decorators still generate their original mesh operands; the same
shared integration code either evaluates them through WASM or records temporary
mesh operations for native evaluation, including domain clipping. Native operations
use body-local float32 inputs and return the rounding bound alongside the mesh.
The worker applies the existing precision, packing and validity checks before
encoding. Document ownership and Undo are unchanged. The native backend runs one
body at a time with at most four threads by default. Binary IPC (Electron) or a
localhost binary endpoint (development) avoids JSON expansion of mesh arrays.
Native errors stop export; absence of the capability uses the portable WASM path.
Cancel terminates and drains the native process as well as discarding the worker.
See [native mesh setup, pinned source and protocol](../../native/mesh/README.md).

The initial built-in uses the metric basic 60° profile and nearest coarse pitch
from the [manufacturer reference table](https://sg.misumi-ec.com/tech-info/categories/technical_data/td01/a0063.html).
User-selected clearance is a radial hole-side allowance, not an ISO fit class.

Separate numerical Boolean precision, mesh approximation error and intentional
print clearance. A finer thread mesh cannot recover a coarse base cylinder. Define
an export error budget in millimeters relative to thread depth/fit, and retessellate
the export copy when needed. Avoid silently increasing weld tolerance to fix errors.

The built-in export prepares an accepted read-only snapshot through the geometry
query worker. Only decorated bodies are retessellated; the original BRep, IDs,
settings and Undo history stay unchanged. The linear sampling target is the minimum
of 0.004 mm, pitch/200 and positive hole relief/8; zero relief does not imply zero
numerical tolerance. Requests below 0.00001 mm fail explicitly. Metric mesh edges
follow crest/root transitions; axial rows include taper transitions. Untapered
metric threads bound the mixed radial/angular interpolation error to choose axial
samples; rounded profiles and tapered metric threads retain their curvature-based
sampling. The sampling target and fit allowance are unchanged. Facet samples
are checked against the analytic envelope with a separate allowance of twice the
sampling target. This is measured numerical accuracy, not a general certification
of arbitrary curved neighboring surfaces or physical fit.

Thread addition domains also respect directly adjacent analytic cylindrical
boundaries when the entire selected patch lies on their material side. Hole
boundaries use a circumscribed polygon and exterior limits an inscribed polygon,
with radial deviation below half the sampling target. Coincident supporting
cylinders do not constrain each other's threads. This prevents additions from filling transverse bores
in either external or internal threaded faces; cuts may extend into those bores. Nonconvex patches straddling an
adjacent boundary retain their tessellated domain mask; this is not a general
extension/intersection treatment for arbitrary BRep surface classes.

Mesh Booleans run in body-local coordinates so world placement does not consume
float precision. Their recorded numerical rounding must fit within one quarter
of the sampling target. Float packing can collapse very small Boolean facets;
short edges of actually collapsed facets are normalized within the existing
rounding bound. If a collapsed edge would join two other edges, an original adjacent
facet pair can exchange its diagonal when the new diagonal is unused, its projection
remains convex and the surface change, including prior vertex collapse, fits that
same rounding allowance.
Vertices do not move, and pairs on already nonmanifold input edges are not repaired.
An exactly collinear facet with distinct vertices is re-triangulated
against its adjacent face at the existing middle vertex, without moving vertices
or changing the represented surface. Duplicate packed vertices are resolved first.
If a collapsed zero-thickness sheet leaves exact coincident facets with opposite
winding, those facet pairs cancel; unmatched or nonmanifold facets still fail.
The result must still pass closure/orientation/nondegeneracy checks. STL conversion gets a separate bounded packing check. If world coordinates
exceed that format's float precision, STL rejects with a 3MF alternative; 3MF keeps
the restored world positions. No larger general-purpose weld tolerance is used.

Export preparation and mesh generation show status. Cancel export discards a
pending preparation result or terminates the mesh worker and publishes no file.
It does not undo accepted edits or replace the document with the export snapshot.

A preview compositor reveals recessed surfaces through their own attached faces.
Each visible decorator gets an occlusion-depth pass with only its source faces
hidden; caps, unrelated faces and other bodies remain occluders. Its opaque preview
is tested against that depth and rendered into a shared color/depth target. All
previews compete for nearest depth before one alpha blend over the ordinary scene,
so overlap does not accumulate transparency or depend on decorator order.
Two reusable full-viewport targets bound buffer memory; draw work grows with visible
decorators. The passes preserve clipping, visibility and renderer state. Preview
meshes remain non-pickable, and neither accepted geometry nor Undo changes.
Preview generation reads the currently displayed candidate. Client-only rigid
body placement carries its cylinder descriptors and decorator frames with the
temporary faces; kernel-calculated edits use their continued candidate attachments.
The overlay invalidates when the displayed document changes even if a temporary
body keeps the same accepted BRep bytes. Canceling restores the accepted preview.
The original surface color remains under the translucent result: this is an
illustrative preview, not an export-result replacement. Mechanical interference warnings can be
nonblocking; invalid output remains an export error. General assembly/motion proof
is outside V1; warnings must describe what was actually checked.

## Acceptance scope

1. One external and one internal full cylinder,
   shared procedural definition, both reference modes, panel editing/removal,
   preview, save/open, Undo/Redo and validated STL/3MF. Benchmark final generation.
2. Multi-selection, continuation/removal, interrupted/sloping domains, phase
   preservation and topology edits. This completes the requested geometry scope.
3. Verified Metric/FDM presets, clearance, axial extent and end/runout controls,
   and thread-specific highlighted diagnostics;
   finish print-oriented acceptance. No cross-decorator conflict detection.
4. JavaScript module loading/portability, agent parity and a small independent
   example decorator proving the contract without special-casing Threads.

Acceptance uses real geometry and ordinary pointer/keyboard routes.
Measure preview and export on short/long threads and batches; do not promise
near-instant generation before measuring cold and warm worker runs.

3MF uses lossless ZIP level 3; compression changes archive size, not mesh precision
or contents. Set `MAKESHIFT_BENCH_COMPRESSION=1` for a level 0/1/3/6 comparison
on identical exported contents, with decompressed-byte verification.

The reproducible worker benchmark is `node tests/decorator-performance.mjs` after
`npm run build` and `npx tsc -p tsconfig.test.json`. It creates real native cylinders,
prepares read-only export tessellations, and measures first/repeated preview and
WASM/native 3MF generation in fresh headless Chromium/WebKit contexts, including
the native process and HTTP handoff. The 2026-09-24 macOS
arm64 measurements below used the then-current Metric default. The benchmark now
records the actual resolved settings (currently FDM fine, 1 mm pitch) and supplies
the preview worker's per-instance signatures. Both first and repeat runs create
fresh workers; repeat measures warm browser/module caches, not retained mesh results.
The historical macOS
arm64 measurements for Ø10 mm, 1.5 mm metric pitch were about 0.57–0.62 s for a
10 mm thread, 3.8–4.5 s for an 80 mm thread, and 5.4–6.1 s for six 20 mm threads.
These are approximately 2.5–3× faster than the initial export implementation.
Repeated previews were about 0.1 s, 0.53–0.54 s and 0.66–0.74 s respectively;
native export preparation was 33–61 ms. These are local measurements, not
cross-device guarantees. Large exports still take seconds; status/cancellation
keep that work explicit. The cache JSON retains each measured first/repeat run.

Acceptance includes mating cross-sections and screw-motion checks over specified
travel; both hands and modes; different lengths; multi-rod selection; reversed
axis parameterization; split seams and flattened/gapped cylinders; close neighbors;
thin walls and blind ends; field-level mixed edits; partial removal; move/copy/
mirror/scale policy; save/reopen; missing plugin; cancel/failure/Undo; exported
closure/orientation and geometric deviation; middle-of-rod threads with configured
extent, tapers and clearance. Print-in-place alignment is outside acceptance. Verify
single assignment per face; do not require a particular geometric result from
overlapping independent decorators. Physical printer fit requires a real
print, which software checks cannot certify. Run headless Chromium/WebKit and
hidden Electron where host/plugin boundaries change.
