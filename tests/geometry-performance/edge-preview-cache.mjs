import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "./client.mjs";

// Compile tsconfig.test.json first. Baseline can use a saved pre-change binary
// and compiled test tree. All timing is serial; each calculator is owned here.
const executable = resolve(process.argv[2] ?? ".build/kernel/bin/makeshift-kernel");
const compiled = resolve(process.argv[3] ?? ".cache/sketch-tests");
const load = (name) => import(pathToFileURL(`${compiled}/${name}.js`).href);
const { DocumentOwner } = await load("src/backend/document-owner");
const { exactBodies } = await load("src/model/exact-body");
const { prism, square, vertical } = await load("tests/body-edge-fixtures");
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const owner = new DocumentOwner(undefined, executable);
const report = { executable, previews: [], guides: [] };
try {
  const box = await prism(owner, square);
  const captured = JSON.parse(
    await readFile("tests/fixtures/bezier-extrusion-fillet.json", "utf8"),
  );
  const top = JSON.parse(await readFile("tests/fixtures/top-surface-fillet.json", "utf8"));
  for (const [name, body, edges, sizes, modes = ["fillet", "chamfer"]] of [
    ["box", box, [{ body: box.id, edge: vertical(box, 0, 0).id }], [1, 1.2, 1.4, 1.6, 1.8]],
    [
      "captured-bezier",
      captured.document.bodies[0],
      captured.selection,
      [0.05, 0.055, 0.06, 0.07, 0.08],
    ],
    ["captured-top-surface", top.bodies[0], top.operation.edges, [1, 3, 6], ["fillet"]],
  ]) {
    for (const mode of modes) {
      const client = new Client(executable, 1);
      try {
        const times = [],
          preparation = [];
        for (const size of [...sizes, ...sizes]) {
          const result = await client.request({
            kind: "edge-finish",
            mode,
            edges,
            size,
            bodies: exactBodies([body]),
            presentation: "deferred",
          });
          assert.equal(result.reply.error, undefined, `${name} ${mode} ${size}`);
          times.push(result.milliseconds);
          preparation.push(Number(/kernel edge-finish operands ([\d.]+)/.exec(result.phases)?.[1]));
          assert.equal(
            (await client.request({ kind: "complete-preview", bodies: [] })).reply.error,
            undefined,
          );
        }
        report.previews.push({
          name,
          mode,
          coldMs: times[0],
          warmMedianMs: median(times.slice(1)),
          preparationMedianMs: median(preparation.slice(1)),
        });
      } finally {
        await client.close();
      }
    }
  }
  for (const mode of ["fillet", "chamfer"]) {
    const times = [];
    let expected;
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const reply = await owner.call({
        kind: "edge-finish-targets",
        operation: {
          mode,
          edges: [{ body: box.id, edge: vertical(box, 0, 0).id }],
        },
        points: [
          [1, 1, 5],
          [2, 2, 5],
          [10, 10, 5],
        ],
      });
      assert.equal(reply.error, undefined);
      times.push(performance.now() - start);
      expected ??= reply.edgeFinishTargets;
      assert.deepEqual(reply.edgeFinishTargets, expected);
    }
    report.guides.push({
      mode,
      coldMs: times[0],
      repeatMedianMs: median(times.slice(1)),
      values: expected,
    });
  }
} finally {
  owner.close();
}
console.log(JSON.stringify(report, null, 2));
