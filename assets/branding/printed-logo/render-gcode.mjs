import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beadMesh, parseGcode } from "./beads.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
if (!process.version.startsWith("v24.")) throw new Error("Activate the repository .nvmrc first");
const input = resolve(process.argv[2] ?? `${directory}/source.gcode`);
const output = resolve(process.argv[3] ?? `${directory}/../../../.cache/printed-logo/orca`);
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
const mesh = beadMesh(paths);
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/beads.json`, JSON.stringify(mesh));
writeFileSync(
  `${output}/source.json`,
  JSON.stringify(
    {
      input,
      offset,
      filamentDiameter: diameter,
      sha256: createHash("sha256").update(text).digest("hex"),
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
      ...(name === "detail" ? ["detail"] : []),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Blender failed: ${result.status ?? result.signal}`);
}
