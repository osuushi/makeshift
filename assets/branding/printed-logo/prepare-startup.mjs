import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beadMesh, parseGcode } from "./beads.mjs";
import { depositionPlan, startupTiming } from "./deposition-timing.mjs";

const directory = import.meta.dirname;
const output = resolve(process.argv[2] ?? ".cache/printed-logo/startup-full");
const source = readFileSync(`${directory}/icon.gcode`, "utf8");
const slice = JSON.parse(readFileSync(`${directory}/slice-source.json`, "utf8"));
const sha256 = createHash("sha256").update(source).digest("hex");
if (sha256 !== slice.gcodeSha256) throw new Error("G-code and color metadata do not match");
const arcTolerance = 0.0005;
const detail = { ringSize: 64, capSteps: 16 };
const paths = parseGcode(source, 1.75, arcTolerance);
const points = paths.flatMap((path) => path.points);
const offset = [0, 1].map(
  (axis) => (Math.min(...points.map((p) => p[axis])) + Math.max(...points.map((p) => p[axis]))) / 2,
);
for (const point of points) {
  point[0] -= offset[0];
  point[1] -= offset[1];
}
const plan = depositionPlan(paths);
const macroFrames = Math.round(startupTiming.macroSeconds * startupTiming.fps);
const stroke = plan.frames[macroFrames].partial.points;
const macroTarget = [0, 1].map(
  (axis) => (Math.min(...stroke.map((p) => p[axis])) + Math.max(...stroke.map((p) => p[axis]))) / 2,
);
const meshes = paths.map((path, index) => ({
  ...beadMesh([path], slice.baseHeight, 0, slice.colorRegions, "ellipse", detail),
  completeFrame: plan.frames.find((frame) => frame.completePaths > index).frame,
}));
const partials = plan.frames
  .filter((frame) => frame.partial)
  .map((frame) => {
    const mesh = beadMesh(
      [frame.partial],
      slice.baseHeight,
      0,
      slice.colorRegions,
      "ellipse",
      detail,
    );
    // A prefix retains the material classification of its complete source path.
    mesh.materials.fill(meshes[frame.completePaths].materials[0]);
    return { frame: frame.frame, ...mesh };
  });
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/paths.json`, JSON.stringify(meshes));
writeFileSync(`${output}/partials.json`, JSON.stringify(partials));
writeFileSync(
  `${output}/deposition.json`,
  JSON.stringify(
    {
      layers: plan.layers,
      frames: plan.frames.map(({ partial, ...frame }) => ({ ...frame, partial: !!partial })),
    },
    null,
    2,
  ),
);
writeFileSync(
  `${output}/beads.json`,
  JSON.stringify({
    ...beadMesh(paths, slice.baseHeight, 0, slice.colorRegions, "ellipse", detail),
    baseHeight: slice.baseHeight,
    palette: slice.palette,
    colorRegions: slice.colorRegions,
    maskBounds: slice.maskBounds,
  }),
);
writeFileSync(
  `${output}/source.json`,
  JSON.stringify(
    {
      sha256,
      offset,
      paths: paths.length,
      layers: new Set(paths.map((p) => p.z)).size,
      fps: startupTiming.fps,
      frames: Math.round(startupTiming.renderSeconds * startupTiming.fps),
      depositionFrames: plan.frames.length,
      firstLayerSeconds: startupTiming.firstLayerSeconds,
      laterLayerSeconds: plan.layers[1].end - plan.layers[1].start,
      macroFrames,
      tessellation: { ...detail, arcTolerance },
      macroTarget: [...macroTarget, 0.12],
      macroOrthoScale: 26,
      macroDriftPerSecond: [1.1, 0.35],
      macroZoomRate: 0.06,
      pullbackFrames: Math.round(startupTiming.pullbackSeconds * startupTiming.fps),
      pullbackStartFrame:
        macroFrames + 1 - Math.round(startupTiming.pullbackLeadSeconds * startupTiming.fps),
      cameraMoveFrames: [macroFrames + 1, plan.frames.length],
      plateFadeFrames: [plan.frames.length, startupTiming.renderSeconds * startupTiming.fps],
      cameraInterpolation:
        "Gently drifting macro opening; 0.9s quintic logarithmic pullback starts 0.25s before extrusion accelerates at 1s",
      wordmarkMilliseconds: 650,
      lighting: "spot-soft",
      appearance: "icon",
      resolution: 2160,
      samples: 64,
      plateMillimeters: [165, 179.25, 2.4],
      plateDetails:
        "Single flat plate with reference-matched stepped outline: broad shallow top rise and angled lower-left step; no raised center, seam or holes",
      cameraOrthoScale: [(245 * 5) / 3, 220],
      mediaToCanonicalIconScale: 5,
      timing:
        "Empty opening frame, then 1s on the first stroke. Original 0.75s first-layer and equal-time later-layer sequence resumes without redrawing material; constant extrusion volume within each layer.",
    },
    null,
    2,
  ),
);
console.log(`Prepared ${paths.length} toolpaths in ${output}`);
