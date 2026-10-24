# Involute gear decorator

2026-09-27. Pitch-surface interaction approved by the founder and implemented.
The tool supports external/internal cylinders, conic bevel faces and planar racks,
including disconnected partial faces. Helical means cylindrical helicals and
inclined racks; conic gears use straight spherical-involute teeth.

## Interaction and ownership

Select faces and invoke **Gear**. The selected geometry supplies a target pitch
surface, not the tooth-tip blank. Teeth add and remove material around it.
Decorators never resize or move accepted BRep geometry. DocumentOwner owns
attachments, fitted dimensions and settings with snapshot Undo; preview and export
consume that same accepted metadata.

External and internal spur cylinders applied together share a saved gear group. Applying Gear
separately joins contacting gear groups as well. Reapplying Gear to selected older
independent gears creates a group. An explicit `gearGroup` on Apply adds selected
cylinders to an existing group. The sidebar lists groups even without a selection;
clicking a group selects all members and discloses body names, face counts, target
and fitted pitch diameters, and individual integer tooth counts. Select new faces
and use **Add selection to Gears N**; removal still acts only on selected faces.
Groups are independent of tagged geometry groups and cross body boundaries.
Remembered spur presets restore printing limits; rotary count, pressure and
phase are fitted to the current cylinders rather than recalled from another gear.
Adding faces to an existing group uses that group's settings.

Shared controls describe printing: **Minimum printable width** (initially 0.4 mm),
**Tooth clearance per gear** (initially 0.05 mm), **Tooth root clearance** (initially
0.15 mm), and **Pitch diameter tolerance** (initially 0.2 mm on diameter). Counts,
module, pressure, tooth depth and contact phases are fitted rather than entered,
including for a single spur gear. The width limit protects the chord between tooth
flanks at the tip circle and the remaining wall behind an internal ring's roots
when a coaxial outer cylinder bounds it. Root clearance is stored in millimeters
and remains fixed when the fitted module changes. Tooth clearance is normal tooth
thinning in millimeters per gear; the pair's clearance is the sum.

The fit minimizes squared pitch-diameter corrections. Among equally accurate fits
it prefers full-depth involutes and then lower pressure; within each profile it
prefers larger teeth. It searches pressure angles 20/25/30 degrees and addendum
coefficients 1/0.9/0.8/0.75/0.7/0.65/0.6. Counts remain within 6–400 and satisfy the
profile's undercut, base-circle and tooth-thickness limits. Contact paths must stay
on the active involutes and provide at least 1.1 transverse contact ratio. The
saved `gearPitchRadius` affects only the decorator's generated geometry. Legacy
module ceilings no longer constrain automatic fits. These are geometric limits;
printer-specific fit still depends on the user's clearance calibration.

Every geometry edit refits the whole group in its temporary candidate, including
other members' tooth counts and profiles. Existing tangent, parallel, axially
overlapping pitch contacts retain current axis spacing and receive tooth/space
phase alignment. An external contacting pair fixes module from its integer tooth-count sum;
an internal ring/pinion pair uses their difference. Other contacts propagate those
signed count relations. Internal pairs rotate in the same direction and align a
pinion tooth with a ring space. Conflicting phase loops reject.
Nothing moves the axes or changes another body's BRep. If fitting cannot satisfy
the limits, the geometry edit remains valid and the group shows **Gear group
cannot fit**. Invalid profiles are withheld from preview/export; changing the group
limits or geometry can repair them. Numerically valid printing limits are saved
even when they cannot currently fit, so adjusting one field never requires first
solving every other field. Fit warnings and invalid-number feedback appear in the
settings panel. Escape cancels a numeric draft; Enter/blur accepts. **Fit contacting
gears** repairs older independent decorations and joins touching groups in one edit.
Resize and its group refit share one Undo step.
Copied groups receive independent IDs. Undo/Redo and save/open retain membership,
limits and fitted dimensions. Sampling error remains separate from fit tolerance.

Automatic fitting covers internal/external spur cylinders with zero profile shift.
Helical, bevel and rack gears retain their independent calculation route; explicit
agent settings with a tooth count retain that route as well. Legacy independent
gears keep their existing dimensions until explicitly fitted. Old module-based
root clearance remains readable (`rootClearance: -1` selects the legacy coefficient);
automatic fitting establishes the millimeter controls. On first conversion, zero
legacy thinning becomes the 0.05 mm printing default; an explicitly saved zero with
millimeter root clearance remains zero. Independent gears retain rotary count,
pressure, helix/hand, phase, thinning, root clearance coefficient and profile shift.
Counts refer to a full revolution even on a sector. The former **Resize to module**
geometry control remains removed: decorator controls never edit BRep.

Racks expose normal module (initially 1 mm), numeric in-plane travel direction,
linear phase in mm and tooth inclination using the helix/hand controls. The
saved plane frame defines zero direction independently of the camera. The trimmed
extent clips a repeating profile. Rotary count and phase controls are hidden
for racks; helix/hand are hidden for bevels. Mixed selections patch only instances
to which a field applies. Numeric typing previews; Enter/blur accepts and Escape
cancels. Reselection, continuation, partial removal and repair share the existing
decorator routes. A face still has at most one active decoration.

## Support and continuity

Partition by body, analytic support and material side. Cylinders share radius
and axis line; opposite parameter-axis signs are equivalent. Cones share apex,
axis, opening angle and nappe. Rack faces share plane and oriented material side.
Native face presentation and agent inspection expose cone apex, direction,
semi-angle in degrees and material side; analytic metadata is derived from BRep.

Save a reference frame, settings and support kind/material side. Cones also save
an axial reference range at application; its far section defines the reported
module and physical thinning. Partial removal does not change that reference.
Rigid transforms carry the frame; copies receive independent instance IDs.
Scaling independent gears preserves integer count, angles, phase, clearance/profile
coefficients and physical thinning; grouped gears refit within the shared limits. Reflection
preserves configured hand. Ineligible surface changes and ambiguous merges become
unresolved. Explicit reassign establishes a new frame/reference section.

Use immediate topology correspondence to retain compatible split descendants.
Never restart phase at face seams or gaps, or merge independent instances after
an edit. Trim each selected patch independently, including holes and separated
axial domains. Existing adjacent-plane/cylinder clipping keeps modifiers out of
unselected boundaries. General arbitrary curved-neighbor extension remains the
same limitation as the thread domain pipeline.

## Geometry and calculation affordances

Cylindrical profiles use involute flanks with explicit root/tip transitions.
Helical lofts rotate cross-sections by z*tan(beta)/pitchRadius, with the chosen
hand. Racks use the matching normal-system straight flank profile. Roots below
the base circle connect radially; generated cutter trochoids/root fillets are
not implemented. Combinations requiring undercut, pointed/overlapping teeth or
internal tips below the base circle reject with a reason.

Bevel profiles use a spherical involute of a base cone, not a stretched planar
involute. With pitch semi-angle delta and pressure alpha,
sin(deltaBase) = sin(delta)*cos(alpha). A great-circle tangent unwrapped from
that base cone gives the flank azimuth. Teeth follow rays from the common apex.
Coverage must stop before the apex; supported semi-angles are 3–80 degrees.
Spiral bevels reject explicitly. Sampled 1:1, 90-degree bevel engagement is checked;
this is not universal pair compatibility or a manufacturing-standard certification.

Agent `decorators()` lists the built-in `freac.gear` v1 schema. `inspectDecorator`
returns resolved rotary module, pressure angle, pitch/base/tip/root dimensions,
lead and support/frame information. Its optional `normalModule` returns
`requiredPitchRadius` without editing geometry. Cone results include the saved
reference section and cone angles. Transverse pressure and half-width results
are radians; user settings use degrees. Original face domains remain available
through ordinary geometry inspection.

For cylinders, d = z*mn/cos(beta), mt = mn/cos(beta), and
tan(alphaT) = tan(alphaN)/cos(beta). Unshifted external reference center distance
is r1+r2; internal reference distance is rRing-rPinion. Rack transverse pitch is
pi*mt. Profile-shifted pairs require operating-distance calculations. Positive
profile shift moves the generating reference outward: it thickens external
teeth and widens internal tooth spaces. The same exact calculations supply panel
readouts and agent inspection. Agents can `replaceFace`/`offsetFaces`, move bodies
and `editDecorator` within one awaited script transaction and one Undo step.

Export sampling uses the minimum of 0.004 mm, smallest normal module/100 and
positive thinning/8, with a 0.00001 mm floor. Preview uses a coarser profile.
Numerical Boolean precision and tessellation error remain separate from intended
thinning/clearance. Export retessellates a read-only snapshot, retains closed-mesh
validation and does not mutate accepted data. Long jobs use existing worker status
and cancellation. Bounded sampling and pair probes are not a general proof of
maximum deviation or physical fit.

Mathematical references: [KHK gear dimensions](https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/)
and the published [spherical-involute equations](https://journals.sagepub.com/doi/10.1177/16878140211037120).
No upstream implementation code was copied.

## Verification and limits

`tests/gear-groups.test.ts` and `tests/gear-group-resize.test.ts` use the founder's
13/7 mm capture for both application orders, legacy matching, shared sizing,
engagement, STL/3MF encoding, native resize, fit limits, repair and atomic Undo.
`tests/gear-groups-ui.mjs` checks real group disclosure/addition, layout, numeric
cancellation, removal and cylinder offset followed by warning repair in hidden
Electron.

`tests/gear-ring-fit.test.ts` loads the founder's 20/10 mm ring/pinion capture,
checks both application orders and legacy repair, 2:1 counts at unchanged diameters,
ring wall/tip width, physical clearance changes, save/open and atomic Undo. It checks
preview profiles and exported solids over a tooth period and encodes STL/3MF.
The default capture fits 18/36 teeth at 20 degrees with 0.8-module addenda; increased
printing clearances can select shorter teeth while preserving the ratio.
`tests/ui-gear-printing.mjs`, exercised by the existing gear-group UI route, checks
saved unsatisfiable limits, subsequent repair, local feedback and the four controls.

`tests/gears-ui.mjs` exercises real pointer/keyboard creation, gear/rack/bevel
settings, numeric cancellation, Undo/Redo, reselection,
removal, save/open, previews and STL/3MF downloads in headless Chromium/WebKit and
hidden Electron. Native tests cover internal/external and helical export,
disconnected sectors/axial patches, continuation, copied placement, agent dimension
inspection and atomic geometry/settings scripts. Engagement tests sample spur,
opposite-hand helical, internal, rack/pinion and straight-bevel pairs.

The separate [agent gear-train evaluation](../development.md#gear-train-behavioral-evaluations)
exercises fresh agents building pairs/compound spur trains and relocating an existing
axis. Its geometric grading and ordinary re-editing checks evaluate the resulting
models; transcripts separately establish what the agent actually verified.

These checks do not establish arbitrary gear-chain interference, assembly, load
capacity, physical printer fit, or iPad input. Agents remain responsible for
choosing and checking arrangements outside automatic spur-group fitting. The wall bound covers coaxial cylindrical
ring exteriors with overlapping axial coverage; it is not a general wall-thickness
analysis. Sampled interference checks do not certify arbitrary close-ratio internal
trains or load capacity.
