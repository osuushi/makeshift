# Application icon

`makeshift-icon.png` is the approved master: the modeled v7 logo with a raised
orange form, blue inset, warm white printed backing and a soft spotlight from
above-left. Its surroundings are transparent. The product name is **Makeshift**.
The master is an exact copy of `printed-logo/lighting/spot-soft/icon.png`.
Earlier artwork and image-generation prompts remain as historical design sources.

[Printed-logo pipeline](printed-logo/README.md) contains the source model, actual
Orca Arachne G-code, reconstructed beads, Blender rendering recipe and provenance.
The icon preset defaults to the approved `spot-soft` lighting.

To regenerate the committed macOS ICNS, Windows ICO and browser/host PNG assets
on macOS, from the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node scripts/generate-icons.mjs
```

Generation uses macOS `sips` and `iconutil`; ordinary builds on other systems use
the committed assets and do not require these utilities. Forge uses the platform
icon under `packaging/icons`; Vite copies `assets/public` into the renderer build.

## Document icon

`document-icon/makeshift-document.png` is the approved transparent document master:
a flat, textured gold PEI plate with a clipped corner, handling tabs, a gray-white
purge line and the original Makeshift logo. The plate was generated with ImageGen;
the logo was composited from `makeshift-icon.png` at 66.9% of the 1254 px canvas,
centered at (51.7%, 52.9%). The logo and whole plate have separate drop shadows.

The same generation command creates `packaging/icons/makeshift-document.icns`
with standard and Retina representations from 16 to 1024 px. Forge copies it
into the app's Resources and references it from both the document declaration
and exported UTI. It is separate from the application/Dock icon.
