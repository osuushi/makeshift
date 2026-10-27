import { readFileSync } from "node:fs";
import { kernelInput } from "../.cache/sketch-tests/src/backend/kernel-input.js";
import { Client } from "./geometry-performance/client.mjs";

// Opt-in benchmark, after tsc -p tsconfig.test.json. Timings are observations,
// not CI thresholds. Compare the previous kernel using its original full reply
// and the previous unfiltered input with --before.
const fixture = JSON.parse(readFileSync("tests/fixtures/extrude-detailed-body.json", "utf8"));
const client = new Client(process.argv[2] ?? ".build/kernel/bin/makeshift-kernel", 1);
const before = process.argv.includes("--before");
try {
  for (const [label, mode, populated, remote] of [
    ["empty-new", "new", false, false],
    ["populated-new", "new", true, false],
    ["remote-new", "new", true, true],
    ["populated-union", "union", true, false],
    ["populated-auto", "auto", true, false],
    ["remote-union", "union", true, true],
  ]) {
    const document = structuredClone(fixture.document);
    if (remote) document.sketches[0].plane.origin[0] += 150;
    const bodies = populated ? document.bodies : [];
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const input = kernelInput(document, { ...fixture.extrusion, mode, distance: 10 + i }, bodies);
      if (before) input.bodies = bodies;
      if (!before || mode === "new") input.presentation = "visual";
      const measured = await client.request(input);
      if (measured.reply.error) throw new Error(measured.reply.error);
      if (i) samples.push({ ms: measured.milliseconds, phases: measured.phases });
    }
    console.log(JSON.stringify({ label, before, samples }));
  }
} finally {
  await client.close();
}
