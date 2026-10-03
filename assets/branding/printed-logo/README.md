# Toolpath-rendered logo

The current [icon preview](icon.png), [oblique preview](icon-detail.png), and
[64/96/128 px comparison](sizes.png) render `icon.gcode`, a new OrcaSlicer 2.4.2
slice of the rounded model bodies. Infill rotates from 45° to 135° so a top-left
key light crosses the lines. The logo itself keeps its orientation. Arachne,
nominal 1.15 mm extrusions, 0.2 mm layers and one top outer wall remain selected.
The approved application icon remains in the parent folder. No image generation
is involved.

The icon preset emphasizes actual bead geometry with a 35%-of-layer-height crown,
a distant top-left area light across the print lines, restrained fill and
slightly glossier plastic. It exaggerates vertical relief for legibility at small
sizes. Line widths and layer heights retain the founder's slice settings. Across
all 40 layers, the re-sliced external perimeters differ from the supplied G-code
by at most 0.032 mm (symmetric distance between decoded paths).
The previous [realistic view](styled.png) and [realistic oblique view](detail.png)
remain available. They use `source.gcode`, the founder's exact original export.

Both icon lights are ten times farther from their targets than the initial
top-left setup. Their diameters scale by ten and power by 100, keeping comparable
central brightness and angular softness while reducing light-direction variation
and falloff across the logo. The icon render also scales vertical thickness to
60%: the base becomes 3.6 mm and the raised shapes 1.2 mm, for 4.8 mm overall.
This is a render transform applied to the existing G-code geometry. XY contours
and extrusion widths remain unchanged. Shader normals compensate for the vertical
compression to retain bead contrast while cast shadows use the thinner geometry.
The top camera stays fixed; the oblique camera moves to the other front corner to
avoid reflecting the distant key directly. The realistic preset keeps the original
8 mm height and its existing camera and materials.

## Reproduce

Install the repository dependencies and Blender. From the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/render-gcode.mjs
```

Optional arguments are a G-code file, output directory and appearance (`icon`,
the default, or `realistic`). To reproduce the previous flatter appearance:

```sh
node assets/branding/printed-logo/render-gcode.mjs assets/branding/printed-logo/source.gcode .cache/printed-logo/orca-realistic realistic
```

`BLENDER` overrides
the default `/Applications/Blender.app/Contents/MacOS/Blender` executable.
Outputs go to `.cache/printed-logo/orca-icon/` by default: bead geometry, source hash and counts,
transparent PNGs and editable Blender scenes. Only deposited object coordinates
are centered; the source path shapes are preserved. The current slice has 411
deposited paths and 40 layers. `render-source.json` records
the source SHA-256 and the applied XY translation. `icon-source.json` records the
icon preset. Small PNGs use Lanczos downsampling of the 1024 px render; the size
comparison shows them at native resolution alongside the previous close light
and full thickness.

To regenerate the rotated infill, build the Makeshift native kernel as described
in the root README, then run:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/slice-infill.mjs 135
node assets/branding/printed-logo/render-gcode.mjs .cache/printed-logo/infill-135/plate_1.gcode .cache/printed-logo/infill-135/render icon
```

The recipe explicitly selects the backing and the two rounded silhouettes by
their saved body IDs. It reads the installed Orca BBL printer/process/filament
presets, applies configuration values from the supplied G-code, and changes both
infill direction settings to 135°. It writes all settings into the output cache
and uses an isolated slicer data directory. User profiles are not edited.
`ORCA_SLICER` and `ORCA_RESOURCES` override the binary and resource locations.
The recipe was rerun independently and reproduced all 411 decoded deposited
paths exactly; G-code headers can differ in timestamps and generated IDs.

Blender 4.0.0 Beta rendered the previews with the existing satin plastic shaders,
procedural microtexture, softbox lights and orthographic cameras. The background
process requires macOS graphics services; a sandboxed launch crashed during Metal
initialization before Python ran.

## Contour correction

The previous standalone export included all five saved bodies in
`source.makeshift`, including overlapping raised silhouettes. One included orange
body already has the pointed tip: its STL extends to X=3.386 mm there. The old
Prusa slice therefore had a pointed external perimeter before bead reconstruction.
The file's other orange silhouette and the supplied Orca G-code have a rounded tip.
The standalone exporter does not reproduce the app's visible-body selection.

The original corrected render bypassed that ambiguous body selection and used
the supplied G-code directly. The rounded orange top perimeter reaches X=1.002 mm after
centering; its regression fixture verifies both the decoded contour and the swept
bead footprint in both appearance presets. Before the infill rotation, a full mesh
comparison confirmed all 559,776 XY vertex positions and face topology were
identical between the realistic and icon bead profiles. The current real reslice
rotates infill while retaining the rounded silhouettes.

`generate.mjs`, `export.ts`, `slicer.ini` and `fine.png` retain the earlier
experimental Makeshift BRep → OCCT inspection → STL → PrusaSlicer route. That
route exports every saved body and uses different slice settings; it is not the
source of the current previews. Earlier images and scenes remain recoverable in
Git and `.cache/printed-logo/v2/`.

## Deposition and shading

The parser handles millimeter G0/G1 motion, XY I/J-format G2/G3 arcs,
absolute/relative positioning and extrusion, G92 resets, retraction repayment,
and Prusa/Orca feature, height and width comments. Orca object markers exclude
machine priming, calibration and shutdown. Printer commands are read as data;
none are executed.

Arc subdivision uses a 0.005 mm chord tolerance and a maximum 5° step, retaining
exact endpoints. Arc semantics follow the documented
[center-format G2/G3 convention](https://www.linuxcnc.org/docs/stable/html/gcode/g-code.html#gcode:g2-g3);
the implementation is independently authored. Unsupported deposited arc formats,
non-planar extrusion, inch units, firmware retractions and tool changes fail
explicitly within the object scope.

Slicer-declared bead widths preserve the slicer's intended footprint, including
its flow calibration. Without width metadata, width is inferred from deposited
filament volume using the
[Slic3r rounded-rectangle flow model](https://manual.slic3r.org/advanced/flow-math).
The volume-derived width is also retained for audit when metadata is present.

Cross-sections have a crown (4% of layer height in `realistic`, 35% in `icon`), rounded ends, and
rounded overlapping deposits at sharp turns. Individual closed shells overlap;
they are not Boolean-fused. This is a kinematic visualization, without heat,
pressure, cooling, sagging, shrinkage or fusion simulation. Mesh volume is not
an exact conservation calculation.

Colour is an art-directed shader assignment: the backing through Z=6 mm is
white; raised silhouettes receive orange and violet based on their exterior
contours. The single-extruder G-code does not encode a three-colour fabrication
plan. `render.py` owns shading and framing independently of toolpath decoding.

## Checks

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node --test assets/branding/printed-logo/*.test.mjs
node_modules/.bin/biome check assets/branding/printed-logo
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module nodenext --target es2024 --types node --skipLibCheck assets/branding/printed-logo/export.ts
npm exec --yes --package pyright@1.1.414 -- pyright --project assets/branding/printed-logo/pyrightconfig.json
```

Tests cover circular arcs, the actual rounded tip and its bead footprint, object
scope, declared widths, extrusion modes, resets, retractions, relative XYZ,
unsupported motions and shell closure/orientation. Both current views were
rendered in Blender and visually inspected. No physical print was made.
