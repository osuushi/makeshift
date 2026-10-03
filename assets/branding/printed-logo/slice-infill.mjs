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
const output = resolve(process.argv[3] ?? `${root}/.cache/printed-logo/model-v4`);
const slicer = process.env.ORCA_SLICER ?? "/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer";
const resources = process.env.ORCA_RESOURCES ?? resolve(dirname(slicer), "../Resources");
// Latest makeshift-logo-4: backing, colored silhouettes and the new recessed floor.
const bodyIds = [
  "0af104d9-88f5-4cae-8049-37b1780956a9",
  "db057420-a968-4df6-96e0-2453aa601c98",
  "e250592f-5588-4e95-a8de-220c0c634400",
  "49779f96-a80b-480e-8d3d-0e61f379d626",
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
      resources,
    },
    null,
    2,
  ),
);
