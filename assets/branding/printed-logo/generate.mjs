import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../../..");
const source = resolve(process.argv[2] ?? `${directory}/source.makeshift`);
const output = resolve(process.argv[3] ?? `${root}/.cache/printed-logo/v2`);
const resolution = process.argv[4] ?? "1024";
const samples = process.argv[5] ?? "64";
const slicer =
  process.env.PRUSA_SLICER ?? "/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer";
const blender = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
if (!process.version.startsWith("v24.")) throw new Error("Activate the repository .nvmrc first");
if (!existsSync(`${root}/.build/kernel/bin/makeshift-kernel`))
  throw new Error("Build the Makeshift native kernel using README.md before exporting");
mkdirSync(output, { recursive: true });

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${executable} failed: ${result.status ?? result.signal}`);
}

await build({
  entryPoints: [`${directory}/export.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${output}/export.mjs`,
});
run(process.execPath, [`${output}/export.mjs`, source, `${output}/logo.3mf`]);
for (const [name, options] of [
  ["fine", []],
  [
    "styled",
    [
      "--nozzle-diameter",
      "0.8",
      "--layer-height",
      "0.4",
      "--first-layer-height",
      "0.4",
      "--perimeters",
      "2",
      ...[
        "extrusion",
        "perimeter-extrusion",
        "external-perimeter-extrusion",
        "infill-extrusion",
        "solid-infill-extrusion",
        "top-infill-extrusion",
        "first-layer-extrusion",
      ].flatMap((key) => [`--${key}-width`, "1.15"]),
    ],
  ],
]) {
  const prefix = `${output}/${name}`;
  run(slicer, [
    "--datadir",
    `${output}/slicer-data`,
    "--load",
    `${directory}/slicer.ini`,
    ...options,
    "--center",
    "0,0",
    "--export-gcode",
    "--output",
    `${prefix}.gcode`,
    `${output}/logo.3mf`,
  ]);
  run(process.execPath, [`${directory}/beads.mjs`, `${prefix}.gcode`, `${prefix}-beads.json`]);
  run(blender, [
    "--background",
    "--factory-startup",
    "--disable-autoexec",
    "--python",
    `${directory}/render.py`,
    "--",
    `${prefix}-beads.json`,
    `${prefix}.png`,
    resolution,
    samples,
  ]);
}
writeFileSync(
  `${output}/source.json`,
  JSON.stringify(
    {
      source,
      sha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
      resolution: Number(resolution),
      samples: Number(samples),
    },
    null,
    2,
  ),
);
