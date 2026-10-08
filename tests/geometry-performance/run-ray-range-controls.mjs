// Untimed per-fixture isolation. Invoke under shared compute lock after compiling
// ray-range-controls.cpp to /tmp/ray-range-controls with the original SDK RPATH.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = process.argv[2];
assert.ok(output, "Expected OUTPUT.jsonl");
const binary = "/tmp/ray-range-controls";
const modules = Object.fromEntries(
  ["control", "range"].map((name) => [
    name,
    resolve(`.cache/geometry-performance/ray-setup/lib/ray-${name}.so`),
  ]),
);
const hash = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
await writeFile(
  output,
  `${JSON.stringify({
    type: "configuration",
    binary,
    binarySha256: await hash(binary),
    sourceSha256: await hash("tests/geometry-performance/ray-range-controls.cpp"),
    modules: await Promise.all(
      Object.entries(modules).map(async ([variant, file]) => ({
        variant,
        file,
        sha256: await hash(file),
      })),
    ),
    diagnosticOnly: true,
    timeoutMs: 20000,
    note: "Raw output and process exits retained. Malformed controls may crash SDK; no expected candidate truth.",
  })}\n`,
  { flag: "wx" },
);
const fixtures = [
  "valid-plane",
  "plane-high-edge-tolerance",
  "malformed-plane-missing-3d",
  "malformed-plane-missing-pcurves",
  "malformed-plane-missing-3d-high-tolerance",
  "valid-cylinder",
  "valid-sphere-degenerate-poles",
  "valid-cone-degenerate-apex",
  "valid-torus",
];
for (const fixture of fixtures)
  for (const overload of ["gp_Lin", "adaptor-bounded-line"])
    for (const boundTolerance of ["0", "1"])
      for (const variant of ["sdk", "control", "range"]) {
        const env = { ...process.env };
        if (variant === "sdk") delete env.LD_PRELOAD;
        else env.LD_PRELOAD = modules[variant];
        const args = [fixture, overload, boundTolerance];
        const result = spawnSync(binary, args, {
          env,
          encoding: "utf8",
          timeout: 20000,
          maxBuffer: 16 * 1024 * 1024,
        });
        await appendFile(
          output,
          `${JSON.stringify({
            type: "process",
            variant,
            fixture,
            overload,
            boundTolerance,
            status: result.status,
            signal: result.signal,
            error: result.error?.message,
            stdout: result.stdout,
            stderr: result.stderr,
          })}\n`,
        );
        console.log(
          `${fixture} ${overload} ${boundTolerance} ${variant}: ${result.status}/${result.signal}`,
        );
      }
