import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beadMesh, parseGcode } from "./beads.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
if (!process.version.startsWith("v24.")) throw new Error("Activate the repository .nvmrc first");
const appearance = process.argv[4] ?? "icon";
if (!["icon", "realistic"].includes(appearance)) throw new Error("Expected icon or realistic");
const lightingPreset = process.argv[5] ?? "current";
const lightingPresets = JSON.parse(readFileSync(`${directory}/lighting.json`, "utf8"));
if (lightingPreset !== "current" && (appearance !== "icon" || !lightingPresets[lightingPreset]))
  throw new Error(`Unknown icon lighting preset: ${lightingPreset}`);
const input = resolve(
  process.argv[2] ?? `${directory}/${appearance === "icon" ? "icon" : "source"}.gcode`,
);
const output = resolve(
  process.argv[3] ?? `${directory}/../../../.cache/printed-logo/orca-${appearance}`,
);
const crownRatio = appearance === "icon" ? 0 : 0.04;
const beadProfile = appearance === "icon" ? "ellipse" : "stadium";
const text = readFileSync(input, "utf8");
const diameter = Number(text.match(/^; filament_diameter\s*[:=]\s*([\d.]+)/m)?.[1] ?? 1.75);
const paths = parseGcode(text, diameter);
const coordinates = paths.flatMap((path) => path.points);
const offset = [0, 1].map(
  (axis) =>
    (Math.min(...coordinates.map((p) => p[axis])) + Math.max(...coordinates.map((p) => p[axis]))) /
    2,
);
for (const path of paths)
  for (const point of path.points) {
    point[0] -= offset[0];
    point[1] -= offset[1];
  }
const slicePath = `${dirname(input)}/slice-source.json`;
const slice =
  appearance === "icon" && existsSync(slicePath)
    ? JSON.parse(readFileSync(slicePath, "utf8"))
    : null;
const sha256 = createHash("sha256").update(text).digest("hex");
if (slice?.gcodeSha256 && slice.gcodeSha256 !== sha256)
  throw new Error("Slice color metadata does not match the supplied G-code");
const baseHeight = slice?.baseHeight ?? 6;
const mesh = beadMesh(paths, baseHeight, crownRatio, slice?.colorRegions ?? [], beadProfile);
if (slice?.palette) mesh.palette = slice.palette;
mesh.baseHeight = baseHeight;
mesh.colorRegions = slice?.colorRegions ?? [];
mesh.maskBounds = slice?.maskBounds ?? [
  [-20, 20],
  [-20, 20],
];
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/beads.json`, JSON.stringify(mesh));
writeFileSync(
  `${output}/source.json`,
  JSON.stringify(
    {
      input,
      appearance,
      lightingPreset,
      lightingSettings: lightingPresets[lightingPreset] ?? null,
      crownRatio,
      beadProfile,
      beadSection: mesh.section,
      palette: slice?.palette ?? "white backing, orange left and detached right, violet main arrow",
      baseHeight,
      offset,
      filamentDiameter: diameter,
      sha256,
      paths: paths.length,
      segments: paths.reduce((n, p) => n + p.widths.length, 0),
      layers: new Set(paths.map((p) => p.z)).size,
      features: [...new Set(paths.map((p) => p.type))],
    },
    null,
    2,
  ),
);
const blender = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
for (const name of ["styled", "detail"]) {
  const result = spawnSync(
    blender,
    [
      "--background",
      "--factory-startup",
      "--disable-autoexec",
      "--python",
      `${directory}/render.py`,
      "--",
      `${output}/beads.json`,
      `${output}/${name}.png`,
      name === "styled" ? "1024" : "768",
      name === "styled" ? "64" : "32",
      appearance,
      `lighting=${lightingPreset}`,
      ...(name === "detail" ? ["detail"] : []),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Blender failed: ${result.status ?? result.signal}`);
}
