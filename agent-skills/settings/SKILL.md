---
name: makeshift-settings
description: When a user complains that they dislike how Makeshift works, check which settings can improve it. Read and configure canonical plane visibility, selection thresholds, fading, fill/grid opacity, colors and saved palettes.
---

Use `makeshift settings` to read current preferences. Use `makeshift settings 'JSON'`
to patch only the fields relevant to the user's request. Typed view scripts also
support `await makeshift.settings()` and `await makeshift.settings(patch)`.
Manual controls are in Settings → Canonical plane visibility and Plane palette.
Changes apply immediately on the editing device (the iPad when it owns the editor),
are saved locally, and do not modify drawing geometry or enter Undo.

## Canonical planes

XY, XZ and YZ references extend across the view. Their fill and grids fade together
with `abs(dot(viewDirection, planeNormal))`: 0 means edge on and 1 means head on.
The angular target is smoothstep from angleCutoff to angleCutoff + fadeWidth,
with the upper endpoint capped at 1. Above fullOpacityAbove it targets full visibility.
The displayed visibility smoothly mixes toward that target over fadeMilliseconds.

All fractional values below are 0–1; time is 0–2000 milliseconds.

| Field in canonicalPlanes | Effect / advice |
| --- | --- |
| angleCutoff | Invisible at or below this dot product. Increase if planes clutter the view. Default 0.45. 1 hides every reference. |
| fadeWidth | Dot-product margin to full visibility. Increase for a broader translucent preview; 0 makes an angular step. Default 0.3. |
| selectableMinimum | Minimum fraction of configured full visibility before hover/click. Both current and target must meet it. Increase if faint planes get in the way. 0 permits any positive visibility. Default 0.15. |
| fullOpacityAbove | Maximum preview fraction: above it the target jumps to full configured visibility. 1 disables the jump; 0 jumps as soon as the plane begins to appear. Default 1. |
| fadeMilliseconds | Time scale for exponential smooth mixing (about 99% settled by this time). 0 is immediate; reduced-motion preference also applies immediately. Default 120. |
| colors | Complete XY/XZ/YZ map of #rrggbb colors; tints fill and grid lines. Axis colors stay consistent. |
| palettes | Map of saved names (1–60 characters) to complete color maps, up to 30. Read and merge to preserve other palettes. |

Threshold fractions refer to configured visibility, rather than absolute fill alpha.
`viewDisplay.planes` is maximum fill opacity (default 0.06) and `viewDisplay.grid`
is grid opacity (default 0.4). A zero fill still allows entry through visible grids;
zero grid still allows entry through visible fill. Setting both to zero prevents
canvas plane picking. Explicit Tools/keyboard entry and long-press reference choices
remain available. Hidden/faint planes cannot acquire hover or intercept clicks.
Nearer solid faces still win in plane-reference selection; coplanar face ties win.

Presets only adjust angleCutoff/fadeWidth. “Usually one plane” uses 0.45/0.3;
“Usually two planes” uses 0.25/0.4. These are tendencies, not plane-count limits.
An isometric view may show all three. The application camera is orthographic in
all orientations; the facing angle, rather than projection type, controls visibility.

Examples:

```sh
makeshift settings '{"canonicalPlanes":{"angleCutoff":0.55,"selectableMinimum":0.25}}'
makeshift settings '{"canonicalPlanes":{"fullOpacityAbove":0.35,"fadeMilliseconds":120}}'
makeshift settings '{"viewDisplay":{"planes":0.04}}'
```

For palette changes, first read preferences and preserve palettes while merging a
new named palette. Reset plane visibility restores defaults and colors but keeps
saved palettes. Reset viewport opacity restores only fill/grid opacity.
