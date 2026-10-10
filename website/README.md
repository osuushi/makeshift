# Makeshift landing page

A buildless, static landing page for makeshift.horse. The page is kept here for
review; hosting will use a separate GitHub Pages repository, like the web editor.
No domain or deployment configuration has been changed.

## Preview

From the Makeshift repository root, with dependencies installed:

```sh
source /Users/adacohen/.nvm/nvm.sh
nvm use
npx vite website --host 127.0.0.1 --port 4175 --strictPort
```

Open http://127.0.0.1:4175. The website itself needs no JavaScript, framework,
remote fonts, tracking, build step, or application runtime. The directory can be
served by any static HTTP server. For Pages, publish `index.html`, both CSS files,
and `assets/` at the site root. Keep the app and desktop update feeds on their
existing hosts. Add the custom domain only when configuring the separate host.

## Content and assets

- Product claims follow the repository README, `docs/architecture/web.md`,
  `docs/product/3d-tools.md`, `docs/architecture/decorators.md`, `docs/releases.md`,
  and `COPYING.md`.
- Web links open https://osuushi.github.io/makeshift-web/.
- The primary action downloads the Mac DMG from the verified 20261010T103958Z
  preview release; the browser version is a secondary, quick-try link. Update
  this deliberately when publishing a newer version; GitHub's `releases/latest`
  does not select these prereleases. All releases remains a stable fallback.
- `assets/makeshift.png` is the existing application icon from `assets/public/`.
- `assets/workspace.png` is an unretouched 1440 × 920 screenshot of the public
  Makeshift web editor, captured on 2026-10-10. The model is the document from
  `tests/fixtures/filleted-pocket-move.json`, opened as a version-1 Makeshift
  archive. No product controls or geometry were composited into the image.

The mobile image is cropped around the model for legibility; selecting it opens
the complete screenshot. The page uses native links, semantic landmarks, visible
keyboard focus and a skip link. Keep product status and platform limits accurate.
