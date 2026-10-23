# Interface preferences

Settings is available in the editor header, through Tools and with Cmd-, on Mac.
It opens a separate, reusable Settings window on native desktop and a compact modal
dialog in browsers. Interface, Sketch Grid, View, Decorators, Experimental and Toolbox tabs
support arrow keys and Home/End. The active tab has an accent underline; tabs share a
continuous strip, wrapping at narrow widths without sideways scrolling. Labels sit above their controls; related grid
spacing and color fields share compact Minor/Major groups. Groups stack at narrow
widths. View sliders pair their labels, controls and values on compact rows. Native tab selection applies that pane's preferred size once, together with native
minimum/maximum window sizes. Interface stays compact; Toolbox opens with working room
for its tree. Limits scale with the interface and include native window chrome, clamped
to the display work area. Manual resizing is enforced by the window manager and never
triggers renderer-driven resizing. Re-selecting the active tab preserves the user's size;
switching tabs or explicitly changing interface scale applies the new pane policy once.
Taller content scrolls inside the pane. Interface controls keep their natural row height
at the top even when enlarged. Escape or Done closes Settings; browsers also
allow backdrop dismissal. Native preferences update all open drawings immediately
through storage events, without changing their geometry or Undo history. User interface scale
applies immediately at 80%, 90%, 100%, 110%, 125% or 150%; Reset to 100% is always
available from this dialog. Opening Settings requires completing the current edit.
Closing restores focus to its opener unless another control has already taken focus.
The choice is stored locally on the current device/origin under `makeshift.ui-scale`,
outside accepted geometry, document files and Undo. Invalid stored values fall back
to 100%; unavailable browser storage keeps the preference for the current window.
A separate Toolbox tab shows the full editable tool tree, including nested groups,
selected alternatives and reset to defaults. Its device-local organization is
independent of geometry and Undo; see [toolbox interaction](../design/tool-menu.md#editable-toolbox-2026-10-22).
Controls and agent launch configuration retain their existing separate settings.

Floating tool parameter cards have a dimpled left grip. Dragging it (or focusing
it and using arrow keys) stores a screen position per card type under
`makeshift.panel-positions`. Manually placed cards keep that position through
geometry and camera updates and restore it across reloads, including Cmd-R.
Viewport fitting keeps a 24px inset from the sides and bottom and 80px clearance
at the top after dragging or resizing the window. These positions
are local presentation preferences, independent of document files and Undo.

Canonical XY/XZ/YZ references cover the viewport, including far from the origin.
References render colored grid lines over a white radial fill (30% maximum opacity by default);
their meshes remain picking targets. The fill veils scene geometry behind the grid,
including translucent sketch regions, sketch lines, axes and coordinate labels.
The fill is completely transparent within a central circle whose diameter is one
eighth of the shorter viewport dimension, then ramps smoothly to the configured
maximum at half the shorter viewport dimension. It remains circular in screen
space through orbit, pan, zoom and resize; line fading stays independent.
Geometry in front retains its appearance; orientable widgets remain unobscured.
Coplanar geometry remains unveiled: plane-side classification interpolates signed
geometry distances rather than reconstructing them from quantized fragment depth.
Initially the most face-on canonical plane is primary at configured maximum grid
opacity. Retain it until the viewing direction is within the **Plane switch angle**
of its surface (default 15°), then choose the most face-on plane again. Ties resolve
XY, then XZ, then YZ (facing differences within 1e-12 count as tied).
Only the primary has a nonzero visibility target. On switching, each grid carries
opacity and velocity through a critically damped spring with a 240 ms smoothing
time (about 0.6 seconds to reach 95% of a settled target). Reduced motion and zero
smoothing use immediate changes. Only the primary receives canvas input, including
explicit plane-selection tools; both current and target opacity must meet the
selectable fraction (0.15). Outgoing grids fade away during a handoff.
Camera depth fitting remains independent of animated opacity.
Coordinate grids apply a gentle bounded fade with positive depth from the view
target along the camera direction. Fade distance scales with visible world height,
independently of camera retreat; nearer portions retain full strength. Work grids,
construction planes, world axes and geometry do not receive this fade.
Settings keeps this simple behavior and
exposes grid line opacity, white grid fill opacity (0–100%, default 30%),
line thickness (0.5–3 pixels, default 1), plane switch angle (0–90°, default 15°),
colors and saved palettes. A 0° switch angle retains until edge-on; 90° always
chooses the most face-on plane.
**X-ray vision** has **Global** (off by default), **X-ray front opacity**
(0–100%, default 80%), and **Bleed**/**Radius** (0–100 screen pixels, defaults 100/50).
Global disables the two mask controls. Local mode dilates and blurs visible sketch
contents on the current plane; the cut and front translucency appear only through
that mask. Only sketch/profile selection or an active sketch workspace starts
automatic X-ray vision. Explicit Cross section always remains global.
These choices persist under `makeshift.view-display` as `xrayGlobal`, `xrayBleed`,
`xrayRadius` and the compatible `sectionFrontOpacity`, outside geometry and Undo.
Reset grid display preserves all X-ray choices.
Grid colors default to XY #d4ae3a, XZ #55bb6e and YZ #b325c1; axes retain their colors.
Thickness also applies to the active sketch grid. Sketch grids use their own document colors. World X/Y/Z axes render
independently at fixed thickness and opacity, including when grid opacity is zero. Zero grid opacity disables canvas
reference picking. Explicit tool/keyboard plane entry remains available.

Preferences live on the editing device, outside document files and Undo. On the first
load of the grid-only presentation, previous visibility choices reset to the focused
behavior and old default colors migrate; custom colors and named palettes survive.
Reset plane grids restores visibility and colors while preserving palettes. Reset
grid display restores line/fill opacity and thickness. The legacy secondaryOpacity
API field is accepted but no longer affects visibility. Advanced fade parameters remain available
through the settings API; the legacy planes opacity field always reads zero.

`makeshift settings [JSON]` reads or validates and patches these preferences through
the current renderer; typed view scripts expose `makeshift.settings(patch?)`.
Unknown fields and malformed/range-invalid values reject before any setting changes.
The managed [settings skill](../../agent-skills/settings/SKILL.md) is installed in
the document agent's Codex home and describes troubleshooting plane clutter and
accidental selection. Paired iPad requests configure the active browser's settings.

Decorator previews use the same Settings dialog. Detailed is the default; Color only
marks current attached faces and does not schedule preview workers. Thread, gear,
knurling and custom decorations have separate color and 20–100% opacity choices,
with Reset decorator display restoring shaded defaults. These values are stored
under `makeshift.decorator-display`, independently of interface scale, document
files and Undo. Both the color picker and a keyboard-editable hexadecimal color
field apply valid colors immediately. Invalid/incomplete text retains the last
valid color and restores it on leaving the field. Final exports use the existing
full geometry pipeline regardless of the display preference.

## Presentation and coordinates

The same preference and settings surface run in Electron, standalone web and the
paired iPad editor. Vite's small PostCSS pass scales authored pixel dimensions in
`src` CSS through `--ui-scale`. It parses CSS value tokens, preserving text, URLs,
viewport media queries and zero dimensions. A declaration immediately preceded by
`/* ui-scale: viewbox */` stays in fixed SVG viewBox units; its viewport already
scales the glyph. This prevents scaling a fixed-viewBox font or stroke twice.

Inline projected model positions, scene dimensions and pointer coordinates remain
in viewport CSS pixels. Anchored arrow widgets center through a percentage
translation, and sketch move-marker SVG dimensions and centering scale together.
Measured panel dimensions govern viewport fitting. The Entities sidebar begins
below the measured header so wrapped controls remain reachable at narrow widths.
The sidebar reserves the toolbox's measured natural height first. Entities yields
the remaining vertical space and scrolls its list; toolbox scrolling is a fallback
only when the tools cannot fit with Entities reduced to its title. Resizing,
interface scale, expanded entity children and contextual reference controls all
recompute the allocation.
The agent terminal adjusts its font and fits its cell grid when the preference changes. This is presentation;
geometry dimensions, camera zoom and accepted data are independent of the choice.
New display code should preserve this coordinate boundary rather than applying
CSS/page zoom to the app root or mixing projected positions with scaled lengths.

## Host zoom routes

Electron's explicit View menu retains reload, developer tools and fullscreen;
it exposes no browser zoom actions. The document window uses zoom factor 1,
disables native visual page zoom and suppresses Ctrl/Cmd plus, minus and zero,
including numpad variants. The shared editor suppresses the same key combinations.
Canvas pinch still changes the orthographic camera through the navigation route.
Native rotation cursor coordinates retain the host's DIP-to-viewport conversion.

Desktop WebKit and high-DPI browser checks cannot establish physical iPad/Pencil
behavior or actual monitor accessibility. Those remain device review routes.

Settings includes an Experimental section with **Fast trim checks**, off by default.
The device-local `makeshift.fast-trim-checks` choice applies to new standalone
Subtract operations. Accepted operations record their choice for reopen; changing
the preference does not recalculate existing geometry. Center-of-mass caching
requires no opt-in.

## Sketch grid controls

View options beneath the orientation cube opens a nonmodal popover in both modeling
and sketch views, without selecting a drawing tool. Find also opens it through Grid
or View options. Escape, an outside click or Done closes it. The popover contains document grid sizes, sketch grid colors and snapping.
Minor and major spacings (mm), their independent colors, and Snap to grid belong
to the document. Set default copies those values to device defaults; Settings
also edits those defaults. Built-in defaults are 0.5 mm minor, 10 mm major,
#b8c2cf/#758296, snapping enabled. New documents and older files without grid
metadata adopt the device defaults once. Grid settings persist in JSON and portable
archives, survive renderer reload and geometry Undo/Redo, and do not add Undo steps.
Changing them marks the document edited; initial default adoption does not.

Settings exposes Min pixels per grid square (default 10 CSS pixels), stored on the
device with grid defaults under `makeshift.sketch-grid`. Visible major lines remain
on the configured major lattice, using an integer multiple of its spacing when
zoom requires thinning. Visible minor spacing is the smallest multiple of the
configured minor spacing that meets the pixel minimum and divides visible major
spacing exactly. Incommensurate settings show only the major grid rather than
moving major lines. Equal grids also draw only major lines. Snapping follows the
visible minor spacing (or major when minor lines are hidden). With 0.5/10 mm settings,
zoom can thin minor lines to 1, 2, 2.5, 5 or 10 mm; it never moves major lines to 10.5 mm.
Canonical modeling grids use the same document spacing and visible snap step,
while retaining their plane palette colors. The searchable Toggle
grid snapping command remains available, including during a pen gesture.

## Appearance and color contrast

Appearance in Settings → Interface offers System (default), Light and Dark. The
choice is device/origin-local in `makeshift.theme`, outside document data and Undo.
System follows `prefers-color-scheme` live on Electron, browsers and iPad Safari;
clients without that API fall back to Light and still allow explicit Dark.
Invalid stored values use System. Denied storage keeps the current choice in
memory. Storage events synchronize same-origin windows. Startup resolves the
choice before the app paints; CSS `color-scheme` also themes native form controls.
Native desktop dialogs and the license viewer follow the operating system.

`src/preferences/theme.css` owns semantic interface colors. Panels are opaque:
model geometry cannot bleed through and lower text contrast. The audit covers
all application CSS, SVG controls/labels, sketch ink and axes, preview outlines,
terminal default/ANSI colors, startup backgrounds and the license viewer. The
marketing website is a separate surface and retains its independent design.

`tests/theme-contrast.test.ts` checks WCAG relative luminance: at least 4.5:1 for
normal text (including muted/status/accent text) on panel, canvas, raised, selected
and warning surfaces; at least 3:1 for control borders and opaque viewport ink.
It also prevents new literal colors in application styles outside the palette.
Focus uses the accent token; primary buttons pair accent with on-accent ink.
Terminal colors update without restarting the session. Programs can still supply
arbitrary true-color output or their own foreground/background combinations.

Document body colors, configurable grid/plane/decorator palettes, lit surfaces,
translucent region/section fills and shadows represent geometry or user data;
they are not forced to meet text contrast or rewritten when appearance changes.
Faint grids and occluded geometry are deliberately subordinate. Geometry controls
use opaque ink or light/dark double outlines; orientation face labels choose black
or white against the configured face. Branding, QR images and color swatches keep
their source colors. These exceptions do not justify low-contrast interface text.
