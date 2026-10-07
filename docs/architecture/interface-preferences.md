# Interface preferences

Settings is available in the editor header and through Tools. User interface scale
applies immediately at 80%, 90%, 100%, 110%, 125% or 150%; Reset to 100% is always
available from this dialog. Opening Settings requires completing the current edit.
The choice is stored locally on the current device/origin under `makeshift.ui-scale`,
outside accepted geometry, document files and Undo. Invalid stored values fall back
to 100%; unavailable browser storage keeps the preference for the current window.
Controls and agent launch configuration retain their existing separate settings.

Canonical XY/XZ/YZ references cover the viewport, including far from the origin.
Fill and grid visibility share a smooth angular target based on the absolute dot
product of the view direction and plane normal. Settings exposes the cutoff (0.45)
and fade width (0.3), a minimum selectable fraction (0.15), an optional full-opacity
jump above the preview ceiling (1 disables it), and smooth mixing time (120 ms).
The angular endpoint is capped at 1; zero width gives a step. Head-on references
reach their configured maximum except when cutoff is 1 (hide all). Reduced motion
and zero time apply immediately. Both current and target visibility must meet the
selectable minimum; positive visibility is always required. Hover cannot increase
an otherwise non-selectable plane's visibility. This also applies to direct picking
in Mirror/Projection/plane-reference tools. Tools and long-press alternatives remain.

“Usually one plane” (cutoff/width 0.45/0.3) and “Usually two planes” (0.25/0.4)
are parameter presets, not hard plane-count limits. Isometric views can show three;
the camera is always orthographic, so facing angle determines the count.
Plane fill defaults to 6%, with independent grid opacity at 40%. Colors tint fill
and grid lines; coordinate axes retain their usual colors. The active sketch has
its own grid and hides canonical references. A zero fill remains selectable through
visible grids, and vice versa; zeroing both disables canvas reference picking.

Settings saves visibility, colors and named palettes under `makeshift.canonical-planes`,
and opacity under `makeshift.view-display`. All are local to the editing device,
outside drawing files and Undo. Reset plane visibility preserves named palettes;
Reset viewport opacity restores only the two opacity values. Existing stored opacity
choices are retained. Invalid stored fields use defaults and unavailable storage
keeps window-local settings. Settings controls refresh after agent changes.

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
