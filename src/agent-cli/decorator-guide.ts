export const decoratorGuide = `
## Gear design

The built-in freac.gear v1 decorates pitch cylinders (external/internal), cones
(straight spherical-involute bevel) and planar racks. Decorators never change BRep.
Default external spur application creates compatible groups across cylinders,
joining contacting groups even when applied separately. Apply with gearGroup adds
to that saved group. Group members expose gearGroup and gearPitchRadius. The
shared settings module (maximum), diameterTolerance and minimumTooth (tip chord
width) bound fitting; counts and phase are resolved automatically. Geometry edits
refit all group members in the same Undo step. An unsatisfiable fit remains an
explicit problem and blocks generated preview/export until repaired. Read actual
fitted pitchRadius/module through inspection; support.radius stays the BRep radius.
Explicit tooth settings and other gear types retain independent controls.
Read its schema through decorators(). Use inspectDecorator with definition,
version:1, faces, settings and optional normalModule to obtain resolved rotary
dimensions and requiredPitchRadius. Tooth counts are integers per full revolution,
including partial faces. Helix uses the normal module/pressure-angle convention;
inspection transversePressure and halfWidth are radians. Phase/direction settings
are degrees. Rack phase and normal module are mm. Helical cones are unsupported.
Outside automatic external spur grouping, calculate matching modules, pressure angles, tooth counts,
centers and hands; explicitly adjust geometry with replaceFace/offsetFaces and
placement operations, then editDecorator in the same awaited script transaction.
The unshifted external reference center distance is r1+r2; an internal pair uses
rRing-rPinion. Shifted gears require operating-distance calculations. Pairwise
interference, assembly and load capacity are not inferred from individual gears.

## Authoring bundled JavaScript decorators

A definition has id, version (positive integer), name, fields, source and optional
preview:true. IDs use letters, digits, dots, underscores and hyphens; the legacy
freac. namespace remains reserved for stable built-in IDs. Source is one
self-contained ES module with a default-exported object.
Optional dependencies:{continuation,preview} declares geometry read by those hooks:
"faces" means selected trimmed faces; "adjacent-faces" adds edge-sharing neighbors;
"bodies" means full support-body geometry. Face scopes must not read body center,
bounds, volume or other geometry. Instance/settings/state and source enablement
still invalidate previews. Omitted continuation uses support bodies; omitted
preview conservatively uses the whole document. Declare each scope independently.
Its synchronous hooks are:

- partition(context): return {groups:[{faces:[{body,face}],state?}]} or {reason:string}.
  Cover every selected face exactly once, with one body per group. state is optional
  JSON continuity data, at most 64 KiB. Return updated state explicitly to preserve
  it across partition calls. To reject Continue, return a useful reason or more
  than one group; the host only continues when the union forms one group.
- validate(context): return [{severity:"warning"|"error",message,faces?,edges?}].
  faces are {body,face} references; edges are {body,edge} references. Highlighted
  geometry must exist in the selected bodies. Errors block application/generation;
  warnings remain visible in the settings panel. At most 100 diagnostics.
- generate(context): return [{operation:"add"|"subtract",mesh}]. Each modifier is a
  closed, consistently oriented triangle mesh; the array may be empty. The host
  applies these modifiers to the original body mesh at STL/3MF export, or STEP
  export with Include decorators (AP242 mesh bodies, with an editability warning).
- preview(context): optional when preview:true; return one triangle mesh, null,
  or {mesh, state}. state is optional transient JSON under 16 KiB. Open meshes
  are allowed. Preview is translucent and never replaces picking on exact faces.
  With livePreview:true, context.live is true during a gesture and context.preview
  contains targetMs and up to three previous {durationMs,state} samples for this
  group. Adapt detail using those samples; returning a bare mesh remains valid.

A mesh is {vertices:[[x,y,z],...],triangles:[[i,j,k],...]}, with world millimeter
coordinates and zero-based integer vertex indexes. Reject degenerate triangles;
use consistent outward winding. Each mesh is limited to one million vertices and
two million triangles; generate returns at most 100 modifiers.

Every context has units:"mm", selection:[{body,face}], bodies, instance and resolved
settings. instance contains id, definition, version, faces, settings, frame and
optional state/problem. frame is {origin,u,v} with world-space vectors. The host
transports it through modeling moves and copies; use it for phase continuity.
bodies includes each selected body with id, volume, center, bounds, faces and edges,
but no opaque BRep string or kernel handles. bounds is [minX,minY,minZ,maxX,maxY,maxZ].
Each face has id, edges (edge IDs), vertices (flat triangle coordinates, nine numbers
per triangle), plane (frame or null), optional cylinder {origin,axis,radius,outward},
and optional offsetHandle {center,normal}. cylinder.outward is +1 for an exterior
surface or -1 for an interior surface; a plane's u/v cross product alone need not
be its outward normal. Edges have id, points (flat polyline coordinates), and curve
(line with a/b, arc with a/b/mid, circle with center/normal/radius, or null).
Preview/export also supply quality:"preview"|"export" and tolerance in millimeters
(currently 0.08/0.004; live preview suggests 0.2). These are sampling suggestions,
not fit allowances. Live preview callbacks have at most 100 ms of JavaScript time;
targetMs may be smaller when several groups update. A paused gesture renders an
ordinary full-quality preview. Preview state/history are never saved or exported.

Fields are declarative number or enum controls. Give every field key, label, type,
and default; numbers can specify min/max/unit, enums require options with value
and label. visibleWhen:{key,values} controls conditional display. Mixed selection
edits update the chosen field for all selected instances. Unknown fields and
out-of-range settings reject. Up to 32 fields, 64 definitions and 256 KiB source
per definition are allowed. Source and state are saved in the Makeshift document.

Hooks run in a fresh isolated JavaScript VM with JSON input/output. No imports,
DOM, file, network, timers or host APIs are exposed. Bundle helpers into source.
No promises or global state surviving calls; use instance.state for continuity.
Each call has 128 MiB memory, 512 KiB stack, 32 MiB JSON and a ten-second deadline.
No hook receives another decorator's generated result. Independent modifications
on different faces can overlap with undefined behavior; composition is not V1.

Geometry changes remap compatible descendant faces, transport the frame, then
repartition and validate. Ambiguous merges remain unresolved for explicit repair.
Mirror retains configured thread hand and scale retains physical pitch/clearance;
general transform hooks and print-in-place phase alignment are deferred.
Installation never executes code. After authoring, install the definition, explicitly
enable its exact source, inspect selected geometry, apply it, then validate through
export. Reopening requires code enablement again. A failed authoring script discards
its source/settings/membership changes and its pending code enablement together.
`;
