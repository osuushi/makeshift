# Materialized solids

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Solid tools and materialized bodies

The first B1 increment separates the active workspace's sketch ID and plane frame
from the XY/XZ/YZ entry presets. Sketching owns point/curve/group selection;
Modeling owns typed whole-sketch or derived-profile selection. Plane equality is
not the identity of an explicitly entered sketch. Whole-sketch placement changes
only its orthonormal frame, preserving local curves and constraints; the existing
document owner validates and accepts that change as one snapshot Undo step.
Placement does not invoke the sketch solver or create dependencies on other objects.

Derived profiles use analytic boundary spans with immediate contained loops as
holes. Modeling hit tests use exact segment/circular ray crossings; triangulation
is only the highlight representation. Profile keys are temporary and selection
clears when accepted geometry changes. They are not persistent operation inputs.

A selected exact face can also contain INTERNAL edges, wires or vertices from
earlier edits. These remain accepted topology, but do not bound swept material.
The shared face-profile path for extrusion, revolve, path sweep and loft removes
removable INTERNAL entities from a temporary copied profile before construction,
preserving true outer/hole boundaries and the accepted BRep. Boundary preparation
does not relax geometry validation or repair invalid solids after sweeping.

B1 now uses a stateless OCCT 7.9.3 calculator for exact profile sweeps and Booleans.
The existing TypeScript document owner supplies current BReps and accepts the
whole candidate, including zero/multiple results, as one snapshot Undo step.
Reported body volumes use adaptive integration of exact surfaces, with spline-span
quadrature for curved bodies. A nearby exterior reference plane along the shortest
bounding-box axis avoids unstable near-zero integrals on cut faces and limits
amplification of boundary tolerances. Planar bodies retain ordinary adaptive
integration. Nonfinite or failed integration rejects; tessellation is not a volume
source. Offset reversal, shell-cap differences, plane-cut conservation and rigid
placement are regression checks for these measurements.
Display meshes/outlines and planar frames derive from the exact geometry. Face
eligibility uses its geometric surface, not how it was generated. Native operation
history supplies immediate face/edge correspondence; one-to-one continuations
retain IDs, while splits/merges receive new ones. Future label policy is deferred.
Use edge copies supported coplanar line/circular geometry into ordinary sketch
curves, attaching unambiguous endpoints by the existing creation rule. Body snaps
supply coordinates only; they create no body/sketch dependency. Hide bodies is a
view control for accessing covered sketches. A local Select face choice resolves
profile/face overlap. These are interaction state, not model relationships.
Accepting Extrude, Revolve or Loft hides each source sketch whose filled regions all
participate in that operation. Partial region coverage, previews, cancellation
and failed acceptance leave visibility unchanged. Open curves do not prevent
full region coverage. The sketch remains available through Show or reopening it
for editing. Undo reveals the automatically hidden source sketch and Redo hides
it again, in the same step as the sweep. The renderer uses the traversed operation
from the existing history; visibility remains per-window state outside Save/Open.
Save/Open serializes exact BReps with their verified topology identity envelope;
meshes are regenerated and no source sketch is replayed. Sketch-only data remains
ordinary curves/constraints. Opening validates a candidate before replacing work.

Every native edit and query sends the same reduced exact-body envelope: BRep plus
ordered face/edge IDs and signatures. Display triangles, polylines, measurements
and analytic descriptors stay out of that input. Replies have request-specific
contracts: queries return their own required fields, and only geometry operations
return materialization results (`inspect` has its own mode). The adapter validates
finite geometry, bounds, topology indexes and typed predecessor references before
exposing a reply. OCCT still owns shape feasibility; reply validation does not run
a second shape inspection. Immediate topology correspondence lives in the shared
body model layer for metadata continuation and is never archived.

Body drawing owns face meshes and feature-edge resources separately from style.
Hover, selection, section stencil ownership and visibility update existing objects.
A retained body object is a fast reuse check; transport copies compare actual
triangle/feature-edge inputs before reusing GPU geometry. IDs locate a drawable
but do not establish geometric equality. Changed presentation replaces that body's
resources; removed bodies and view disposal release them. Edge-finish previews
continue highlighting the accepted source chain when the candidate consumes it.

The founder's 2026-09-15 feedback opens planning of the first solid modeling loop
while further sketch work remains. The [sketch → solid → sketch proposal](../sketch-solid-loop.md)
develops these requirements into interactions, concrete model ownership and bounded
delivery increments. Consult the actual implementation before treating proposals
as delivered behavior.

The following are constraints on future design, not classes or frameworks to
implement during sketch work:

- A planar face is eligible as a sketch support because its geometry lies on a
  plane within model tolerance, irrespective of how the body was created. A face
  with holes still lies on a plane; its trimmed boundary is not the workspace's
  drawing limit. Straight edges can provide axes. Persistent attachment/remapping
  after a body edit is separate from geometric eligibility.
- A tool can consume multiple selected profiles/faces and produce multiple bodies.
  Cutting across the middle of one solid must be able to yield two solids. Empty
  results, touching results and disconnected results need explicit UX in that
  tool's plan. No general `one input -> one body` assumption in shared data.
- Extrude separates sweep distance from Boolean mode. U/S/I/N and the local widget
  select union/subtraction/intersection/new body; positive-volume overlap defaults
  to subtraction. Multi-profile/multi-face semantics, participant bodies and split
  outputs are acceptance cases before extrusion can be called complete.
- Founder decision, 2026-09-15: a visible sketch is an independently movable
  object. Sketching and modeling are distinct modes; limited sketch edits during
  modeling are deferred. Creating a body introduces no ongoing dependency on
  the visible sketch. Moving/editing/deleting it does not change existing bodies.
  This supersedes the earlier source-edit propagation requirement. Materialized
  exact bodies are selected: current geometry is authoritative, not a private
  recipe or executable generator. Face/edge identity and operation correspondence
  must support future labels without requiring construction-history replay. The
  solid-loop design records proposed split/merge semantics and deferred explicit
  post-processing; no scripting engine is authorized for B1.
- Extrusion remains an active adjustment until the user completes and exits it.
  Drag release and quantity edits update a temporary result, including split
  bodies; they do not commit a split or hand off to offset-face. Recompute from
  the original operation inputs, not by repeatedly cutting the previous preview.
  Completion accepts the valid result as one Undo step. Explicit cancel restores
  the original bodies; focus loss alone is not completion. Keep controls local
  and permit camera navigation so the interaction feels continuous. Specify the
  exact accept/exit, cancel and field-Enter gestures before implementation.
  Revolve gets an explicit axis, angle, input and adjustment design.
  [Loft](loft.md) uses multiple ordered sections. Their differing inputs are not extra fields
  bolted onto an extrusion-shaped operation record.
- The agent edits the same model through the same serialized entry points. Source
  access stays a requirement; terminal and remote-workspace implementation follows
  a useful manual editor.

Follow the current user request for the next implementation and founder review.
This design does not authorize a full application scaffold,
new solid tool, old-protocol expansion or background agent infrastructure outside
that agreed sequence.

## Visibility and operation eligibility

Hidden geometry is excluded from UI selection and sweep Boolean participation.
Extrude and Revolve pass the current visible body IDs separately from explicit
Boolean targets, so automatic overlap/contact detection and every chosen mode
ignore hidden bodies. The target picker lists visible bodies with their normal
entity numbers. The global Hide bodies toggle has the same eligibility effect;
a new sweep preview can still display while accepted bodies stay hidden.
Hidden entities remain listed with a Show control, but cannot be selected there.
Visibility remains window state, not document deletion or an Undo edit. Hidden
bodies retain their exact accepted geometry through operations and remain in
saved documents and whole-document exports.

## Sketch-plane cross sections

Entering a planar sketch workspace clips visible bodies at that plane and fills
its material cross sections. A read-only exact solid/plane intersection supplies
separate regions with holes; presentation triangles never define their boundaries.
Section and measurement queries share a serialized read-only kernel worker.
Plane/body/visibility changes invalidate sections; stale replies cannot install them.

In Select, hovering an uncopied section interior highlights that region. Clicking
copies its entire boundary, including holes, into the current sketch (or creates
one on that workspace), in one Undo step. Separate regions remain independently
clickable. Existing sketch handles/curves take picking priority; drawing tools and
navigation retain their gestures. Fully copied regions no longer intercept clicks.
The copied curves are independent, editable ordinary sketch curves with joined
endpoints. Lines/circles/arcs remain analytic; other curves use the existing
0.001 mm bounded cubic approximation. Section endpoints use shared native vertices
projected onto the plane, preserving connectivity across independently evaluated
edge curves. Endpoint corrections consume the existing conversion budget; sketch
region tolerances remain unchanged. Bodies are unchanged and no dependency is
created. Hidden bodies contribute no caps or click targets. The cap itself is
transient view geometry and creates neither a saved object nor an Undo entry.

## Body appearance

Each body has an optional document-owned RGB color and alpha (0–1). Its Entities
swatch opens Color and Opacity (%) fields; Apply accepts both in one Undo step,
while Cancel/Escape leaves the document unchanged. Save/Open preserves appearance.
Geometry edits retain appearance by body identity or immediate operation origins;
copies and split pieces inherit it, and merged results use their first source.
Deleting bodies removes their appearance metadata in the same Undo step.

Surface alpha uses transparent drawing without depth/stencil writes. Outlines stay
visible and pickable even at zero alpha, so transparent bodies can be reselected.
Selection/hover still use the standard highlight colors with the body's alpha.
Section caps and decorator preview overlays retain their existing presentation.
Overlapping translucent surfaces use Three.js object sorting, not order-independent
transparency. Appearance is presentation metadata, not an exported mesh material.
