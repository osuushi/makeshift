# Application icon

`makeshift-icon.png` is the approved master: an orange and purple printed M on a
white printed base, with transparent surroundings. The product name is **Makeshift**.
The built-in image generation and correction prompts are retained alongside it.
Earlier branding assets remain as historical design sources.

[Printed-logo experiment](printed-logo/README.md) contains the supplied modeled
logo and a reproducible slicer → bead geometry → Blender pipeline for review.

To regenerate the committed macOS ICNS, Windows ICO and browser/host PNG assets
on macOS, from the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node scripts/generate-icons.mjs
```

Generation uses macOS `sips` and `iconutil`; ordinary builds on other systems use
the committed assets and do not require these utilities. Forge uses the platform
icon under `packaging/icons`; Vite copies `assets/public` into the renderer build.
