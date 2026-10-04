import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { writeOrcaProfiles } from "./orca-profiles.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../../..");
if (!process.version.startsWith("v24.")) throw new Error("Activate the repository .nvmrc first");
const angle = Number(process.argv[2] ?? 45);
if (!Number.isFinite(angle) || angle < 0 || angle >= 360) throw new Error("Expected angle 0–359°");
const lineWidth = Number(process.argv[4] ?? 1.5);
if (!Number.isFinite(lineWidth) || lineWidth < 0.2 || lineWidth >= 3)
  throw new Error("Invalid line width");
const output = resolve(process.argv[3] ?? `${root}/.cache/printed-logo/model-v7`);
const slicer = process.env.ORCA_SLICER ?? "/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer";
const resources = process.env.ORCA_RESOURCES ?? resolve(dirname(slicer), "../Resources");
// makeshift-logo-7: orange raised form, white backing and blue inset.
const bodyIds = [
  "5375df97-e555-4e23-aa40-9e09f321fd04",
  "289cf227-d367-443a-9c81-e3341ad6eb24",
  "d0ea065c-370a-446e-b1d9-dd5d41482ca4",
];
const original = readFileSync(`${directory}/source.makeshift`, "utf8");
const saved = JSON.parse(original);
const selected = saved.document.bodies.filter((body) => bodyIds.includes(body.id));
if (selected.length !== bodyIds.length)
  throw new Error("Expected the supplied model's rounded bodies");
saved.document.bodies = selected;
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/selected.makeshift`, JSON.stringify(saved));
writeOrcaProfiles(
  resources,
  readFileSync(`${directory}/source.gcode`, "utf8"),
  output,
  angle,
  lineWidth,
);
await build({
  entryPoints: [`${directory}/export.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${output}/export.mjs`,
});
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${executable} failed: ${result.status ?? result.signal}`);
}
run(process.execPath, [
  `${output}/export.mjs`,
  `${output}/selected.makeshift`,
  `${output}/logo.stl`,
]);
run(slicer, [
  "--datadir",
  `${output}/slicer-data`,
  "--logfile",
  `${output}/orca.log`,
  "--load-settings",
  `${output}/machine.json;${output}/process.json`,
  "--load-filaments",
  `${output}/filament.json`,
  "--arrange",
  "1",
  "--orient",
  "0",
  "--slice",
  "0",
  "--outputdir",
  output,
  `${output}/logo.stl`,
]);
const exported = JSON.parse(readFileSync(`${output}/logo.stl.json`, "utf8"));
const backingIndex = exported.bodyIds.indexOf(bodyIds[1]);
const colorRegions = [0, 2].map((selection) => {
  const body = bodyIds[selection];
  const i = exported.bodyIds.indexOf(body);
  if (i < 0) throw new Error(`Export lost colored body ${body}`);
  return {
    body,
    material: selection === 0 ? 1 : 2,
    minZ: exported.bodyBounds[i][2][0],
    maxZ: exported.bodyBounds[i][2][1],
    triangles: exported.topTriangles[i],
  };
});
writeFileSync(
  `${output}/slice-source.json`,
  JSON.stringify(
    {
      modelSha256: createHash("sha256").update(original).digest("hex"),
      angle,
      lineWidth,
      topSurfacePattern: "monotonic",
      minBeadWidth: "5%",
      minFeatureSize: "1%",
      gapFillTarget: "everywhere",
      bodyIds,
      gcodeSha256: createHash("sha256")
        .update(readFileSync(`${output}/plate_1.gcode`))
        .digest("hex"),
      zShift: exported.zShift,
      meshPrecision: exported.precision,
      baseHeight: exported.bodyBounds[backingIndex][2][1],
      maskBounds: exported.bounds.slice(0, 2),
      colorRegions,
      palette: [
        { name: "Warm white PLA", color: "ECECE8" },
        { name: "Orange PLA", color: "FF6808" },
        { name: "Blue PLA", color: "0011FF" },
      ],
      resources,
    },
    null,
    2,
  ),
);
