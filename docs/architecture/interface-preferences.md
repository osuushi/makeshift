# Interface preferences

Settings is available in the editor header and through Tools. User interface scale
applies immediately at 80%, 90%, 100%, 110%, 125% or 150%; Reset to 100% is always
available from this dialog. Opening Settings requires completing the current edit.
The choice is stored locally on the current device/origin under `makeshift.ui-scale`,
outside accepted geometry, document files and Undo. Invalid stored values fall back
to 100%; unavailable browser storage keeps the preference for the current window.
Controls and agent launch configuration retain their existing separate settings.

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
