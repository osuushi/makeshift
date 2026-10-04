# Toolpath-rendered logo

The current [icon](icon.png), [oblique view](icon-detail.png) and
[64/96/128 px comparison](sizes.png) use `makeshift-logo-7.makeshift`, captured
byte for byte as `source.makeshift`. The new concept has a raised orange form,
a blue inset and a neutral backing. All three saved solids are included.
The approved application master in the parent folder is an exact copy of the
soft spotlight render. The canonical PNGs here use that same approved lighting.

The source occupies 40 × 40 × 5 mm, from Z=−2 to Z=3. Export shifts the whole
assembly up 2 mm for the print bed: backing Z=0–4, orange Z=4–5 and blue Z=2–3.
Relative geometry and the original BReps are preserved. The updated corner
fillets tessellate closed directly; every solid and the combined assembly pass
the existing closed/oriented mesh validator. Export uses 3MF to retain native
coordinates: STL's float32 packing collapses a tiny valid fillet facet. The 3MF
has 1,534 triangles in one object, keeping all three solids in assembly placement
during Orca's plate arrangement. No coordinate rounding or validation bypass is used.

`icon.gcode` is an actual OrcaSlicer 2.4.2 Arachne slice: 2 mm nominal widths,
0.2 mm layers, one top outer wall, monotonic surfaces and fixed 45° solid raster.
Minimum bead width is 5%, minimum feature size is 1%, and gap fill is enabled
everywhere without length filtering. Actual widths vary; this slice reaches
0.098 mm. It contains 25 layers and 153 deposited paths. No AI imagery is involved.

## Reproduce

Install repository dependencies, Blender and OrcaSlicer. Build the native kernel
as described in the root README. From the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/render-gcode.mjs
```

Rendering arguments are G-code, output directory, appearance (`icon`, default,
or `realistic`) and lighting preset (`spot-soft` for icons, `current` for realistic
renders by default). Outputs include bead
geometry, source metadata, transparent PNGs
and editable Blender scenes. `BLENDER` overrides the installed macOS binary.

To regenerate the current slice and render:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/slice-infill.mjs 45 .cache/printed-logo/model-v7 2
node assets/branding/printed-logo/render-gcode.mjs .cache/printed-logo/model-v7/plate_1.gcode .cache/printed-logo/model-v7/render icon
```

Slice arguments are angle, output directory and nominal width. The recipe selects
all three current body IDs, reads installed Orca BBL presets, applies settings
from the founder's original `source.gcode`, and overrides the widths, surface
pattern, raster and fine gap-fill limits. User slicer profiles are not edited;
settings and slicer data remain inside the output cache. `ORCA_SLICER` and
`ORCA_RESOURCES` override binary/resource locations.

`slice-source.json` records model/G-code hashes, body IDs, settings, export shift
and precision, backing height, palette and projected cap triangles of the colored
solids. The renderer checks that these color data match the supplied G-code hash.
`icon-source.json` records the render's input hash, settings and geometry counts.
The small PNGs use Lanczos downsampling of the 1024 px render. The comparison
shows the previous application icon alongside the approved soft spotlight icon. The
[corner comparison](corner-comparison.png) enlarges both affected orange areas.

## Appearance and color boundaries

The icon preset uses fully elliptical bead cross-sections, replacing the broad
stadium roofs with curvature across the whole width. Their section height is at
least 40% of width, extending downward into previous layers; it is clamped at the
print bed. Declared widths, path spacing and bead top heights remain unchanged.
This exaggerates rounding without raising the model. It keeps the distant
top-left area light, restrained fill, satin plastic and 0.6 vertical scale. Rendered height is
3 mm: backing top 2.4 mm, orange top 3 mm and blue inset top 1.8 mm. Shader normals
compensate thinning to preserve print-line contrast; cast shadows use actual
geometry. Light targets and the oblique camera target follow the backing height.

Colors are art-directed: warm white and the established orange, with blue from
the new model's saved appearance. Raised paths are classified using the colored
solid's native cap footprint and Z range. The inset's continuous floor strands
cross color boundaries, so a packed 1024 px footprint mask colors those fragments
in the shader using object XY and the inset's Z range. Its shape comes from the
blue solid's native cap triangles; it does not alter the G-code or bead geometry.
The single-extruder file does not encode three-color fabrication.

Blender 4.0 Beta uses Cycles, procedural microtexture, orthographic framing and
RGBA output. Blender's bundled NumPy rasterizes the footprint mask; no external
Python runtime is required for rendering. Background Blender needs macOS graphics
services; a sandboxed launch failed in Metal initialization before Python ran.

## Lighting exploration

[Comparison](lighting/comparison.png) shows the current render alongside three
alternatives: [soft studio](lighting/studio/icon.png),
[warm/cool](lighting/warm-cool/icon.png), and [violet rim](lighting/violet-rim/icon.png).
[Small previews](lighting/sizes.png) show each on light and dark backgrounds.
Each candidate also has an oblique render and JSON provenance in its folder.
The founder selected the soft spotlight study below as the application icon.
These earlier comparison boards retain the neutral baseline for reference.

The rigs in `lighting.json` use distant lights, a top-left key and rectangular
softboxes for broader or narrower highlights. Colors are linear RGB light tints.
Ambient colors/strengths, light positions, powers and dimensions are recorded in
each candidate's `source.json`. Model, G-code, bead geometry, materials, exposure
and camera are identical across the comparison; only lighting changes.
Light positions and targets are relative to the origin at rendered backing-top height; dimensions use
the scene's millimeter units. Every creative light is more than 400 mm away.

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/render-gcode.mjs assets/branding/printed-logo/icon.gcode .cache/printed-logo/lighting/warm-cool icon warm-cool
```

Available alternatives are `studio`, `warm-cool`, `violet-rim`, `spot-soft` and
`spot-focused`. These presets
apply to the icon appearance. Editable `.blend` scenes remain in the output cache.

The [soft spotlight](lighting/spot-soft/icon.png) and
[tighter spotlight](lighting/spot-focused/icon.png) interpret the founder's
localized highlight on the original neutral image. The
[spotlight comparison](lighting/spot-comparison.png) includes the original;
[small previews](lighting/spot-sizes.png) show the light/dark icon-size comparison.
Each uses an actual Cycles SPOT light above-left, about 43 cm from its target,
with a 6 mm emitter radius, neutral tint and reduced original area key/fill.
The broad option has a 5.8° cone with 0.8 blend; the tighter option uses 4.5° and
0.85 blend. Light power and position determine illumination in the 3D scene;
there is no image-space brightness mask. The renderer retains its original
art-directed bead geometry, materials and normal compensation.
[Blender's spotlight controls](https://docs.blender.org/manual/en/4.1/render/lights/light_object.html#spot-light)
describe the cone, blend and source-radius settings. Recorded rig values and
editable scenes make the study reproducible.

## Path reconstruction

The parser handles millimeter G0/G1 motion, XY I/J G2/G3 arcs, absolute/relative
positioning and extrusion, G92 resets, retraction repayment and Orca/Prusa width,
height and feature comments. Orca object markers exclude machine priming and
shutdown. Printer commands are read as data and never executed.

Arcs use 0.005 mm chord tolerance and a maximum 5° step, retaining exact endpoints.
The independent implementation follows documented
[center-format G2/G3 semantics](https://www.linuxcnc.org/docs/stable/html/gcode/g-code.html#gcode:g2-g3).
Unsupported deposited arc formats, non-planar extrusion, inch units, firmware
retractions and tool changes fail explicitly within object scope.

Declared widths preserve the slicer's footprint. Without width metadata, width
is inferred from deposited volume using the
[Slic3r rounded-rectangle flow model](https://manual.slic3r.org/advanced/flow-math).
Volume-derived widths remain available for audit. Cross-sections have rounded
ends and overlapping shells at sharp turns or bends tighter than the bead radius.
These tight bends otherwise reverse the inside offset rings, folding faces through
the roof. The repair retains every slicer centerline/width and uses overlapping
rounded deposits at those joins. The G-code is unchanged. Icon strands use convex ellipses;
the realistic preset retains the lightly crowned stadium profile, with ellipses
for strands narrower than their layer. Shells are closed and oriented but are
not Boolean-fused.
This is a kinematic visualization without thermal, pressure, shrinkage or fusion
simulation; mesh volume is not an exact conservation model.

## Previous artwork

[Earlier realistic](styled.png) and [oblique](detail.png) views use the founder's
original `source.gcode` and v2 geometry; their provenance is in `render-source.json`.
Previous icon inputs, renders and scenes remain in Git and `.cache/printed-logo/`.
`generate.mjs`, `slicer.ini` and `fine.png` retain the initial Prusa experiment.

## Checks

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node --test assets/branding/printed-logo/*.test.mjs
node_modules/.bin/biome check assets/branding/printed-logo
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module nodenext --target es2024 --types node --skipLibCheck assets/branding/printed-logo/export.ts
npm exec --yes --package pyright@1.1.414 -- pyright --project assets/branding/printed-logo/pyrightconfig.json
```

Checks cover arcs, the original rounded-tip footprint, object scope, widths,
extrusion modes, resets/retractions, unsupported motions, shell orientation and
sub-layer-width strands, elliptical icon footprints/bed and top bounds, and
upward-facing roofs through bends tighter than the bead radius. The affected
actual infill paths were also checked for finite, closed, consistently oriented shells.
The current native export, top/oblique renders and small
previews were inspected, including orange/blue/white pixel checks. No physical
print was made.
