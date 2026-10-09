# Interface preferences

Settings is available in the editor header, through Tools and with Cmd-, on Mac.
It opens a compact modal dialog; Escape, clicking the backdrop or Done closes it. User interface scale
applies immediately at 80%, 90%, 100%, 110%, 125% or 150%; Reset to 100% is always
available from this dialog. Opening Settings requires completing the current edit.
Closing restores focus to its opener unless another control has already taken focus.
The choice is stored locally on the current device/origin under `makeshift.ui-scale`,
outside accepted geometry, document files and Undo. Invalid stored values fall back
to 100%; unavailable browser storage keeps the preference for the current window.
Controls and agent launch configuration retain their existing separate settings.

Floating tool parameter cards have a dimpled left grip. Dragging it (or focusing
it and using arrow keys) stores a screen position per card type under
`makeshift.panel-positions`. Manually placed cards keep that position through
geometry and camera updates and restore it across reloads, including Cmd-R.
Viewport fitting keeps a 24px inset from the sides and bottom and 80px clearance
at the top after dragging or resizing the window. These positions
are local presentation preferences, independent of document files and Undo.

Canonical XY/XZ/YZ references cover the viewport, including far from the origin.
References render only colored grid lines; their invisible meshes remain picking targets.
The most face-on canonical plane is primary at configured maximum grid opacity,
with ties resolved XY, then XZ, then YZ (facing differences within 1e-12 count as tied).
One secondary supplies an orientation cue at a configurable fraction of the maximum
(35% by default), fading near edge-on. On switching, only opacity targets change;
each grid carries opacity and velocity through a critically damped spring with a
240 ms smoothing time (about 0.6 seconds to reach 95% of a settled target).
Camera depth fitting depends on geometry and viewing angle, independently of animated opacity.
Reduced motion and a configured zero smoothing time use immediate changes;
only the primary receives ordinary hover/click. A visible secondary can be picked
in explicit plane-selection tools. Both current and target primary opacity must
meet the selectable fraction (0.15). At steady state at most two grids are visible.
Coordinate grids apply a gentle bounded fade with positive depth from the view
target along the camera direction. Fade distance scales with visible world height,
independently of camera retreat; nearer portions retain full strength. Work grids,
construction planes, world axes and geometry do not receive this fade.
Settings keeps this simple behavior and
exposes grid opacity, secondary plane opacity (0–100% relative to the primary),
line thickness (0.5–3 pixels, default 1), colors and saved palettes.
Grid colors default to XY #d4ae3a, XZ #55bb6e and YZ #b325c1; axes retain their colors.
Thickness also applies to the active sketch grid. A sketch whose copied frame
matches a canonical plane uses that plane’s palette color; other sketch grids stay neutral. World X/Y/Z axes render
independently at fixed thickness and opacity, including when grid opacity is zero. Zero grid opacity disables canvas
reference picking. Explicit tool/keyboard plane entry remains available.

Preferences live on the editing device, outside document files and Undo. On the first
load of the grid-only presentation, previous visibility choices reset to the focused
behavior and old default colors migrate; custom colors and named palettes survive.
Reset plane grids restores visibility and colors while preserving palettes. Reset
grid display restores primary/secondary opacity and thickness. Advanced fade parameters remain available
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
