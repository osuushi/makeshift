import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { materialize } from "../.cache/sketch-tests/src/backend/kernel-result.js";
import { NativeCalculator } from "../.cache/sketch-tests/src/backend/native-calculator.js";
import { revolve, sweepCases } from "./wasm-performance/sweep-cases.mjs";

// Run after compiling tsconfig.test.json. Optional executable, case filter and
// sample count let the same requests compare isolated Release wrapper builds.
const kernel = new NativeCalculator(
  resolve(
    process.argv[2] ||
      `.build/kernel/bin/makeshift-kernel${process.platform === "win32" ? ".exe" : ""}`,
  ),
  "Sweep benchmark",
);
const cases = [...sweepCases];
const samples = Number(process.argv[4] ?? 3);
assert(Number.isInteger(samples) && samples > 0);
try {
  if (!process.argv[3] || "helix-18-union".includes(process.argv[3])) {
    const bodies = materialize(
      [],
      await kernel.calculate({
        kind: "extrude",
        normal: [0, 0, 1],
        distance: 18,
        mode: "new",
        bodies: [],
        profiles: [
          {
            outer: [
              { kind: "circle", center: [0, 0, 0], radius: 6, normal: [0, 0, 1], axis: [1, 0, 0] },
            ],
            holes: [],
          },
        ],
      }),
    );
    cases.push([
      "helix-18-union",
      { ...revolve(6480, 18), mode: "union", bodies, targets: [bodies[0].id] },
    ]);
  }
  for (const [name, input] of cases) {
    if (process.argv[3] && !name.includes(process.argv[3])) continue;
    const milliseconds = [];
    let geometry;
    for (let i = 0; i <= samples; i++) {
      console.error(`benchmark ${name} ${i === 0 ? "warmup" : i}`);
      const start = performance.now();
      const reply = await kernel.calculate(input);
      if (i > 0) milliseconds.push(performance.now() - start);
      assert.equal(reply.results.length, 1);
      const result = reply.results[0];
      assert(result.volume > 0);
      geometry = {
        volume: result.volume,
        faces: result.faces.length,
        edges: result.edges.length,
        triangles: result.faces.reduce((n, face) => n + face.vertices.length / 9, 0),
        brepBytes: result.brep.length / 2,
        brepHash: createHash("sha256").update(result.brep).digest("hex"),
      };
    }
    const sorted = [...milliseconds].sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        name,
        milliseconds,
        median: sorted[Math.floor(sorted.length / 2)],
        ...geometry,
      }),
    );
  }
} finally {
  kernel.close();
  await kernel.cancel();
}
