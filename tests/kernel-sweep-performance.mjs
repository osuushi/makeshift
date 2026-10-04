import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { materialize } from "../.cache/sketch-tests/src/backend/kernel-result.js";
import { NativeCalculator } from "../.cache/sketch-tests/src/backend/native-calculator.js";

// Run after compiling tsconfig.test.json. Optional executable, case filter and
// sample count let the same requests compare isolated Release wrapper builds.
const kernel = new NativeCalculator(
  resolve(
    process.argv[2] ||
      `.build/kernel/bin/makeshift-kernel${process.platform === "win32" ? ".exe" : ""}`,
  ),
  "Sweep benchmark",
);
const polygon = (points) => ({
  outer: points.map((a, i) => ({ kind: "line", a, b: points[(i + 1) % points.length] })),
  holes: [],
});
const square = polygon([
  [-10, -10, 0],
  [10, -10, 0],
  [10, 10, 0],
  [-10, 10, 0],
]);
const triangle = polygon([
  [5.9, 0, -0.5],
  [7, 0, 0],
  [5.9, 0, 0.5],
]);
const cubic = {
  outer: [
    { kind: "bezier", a: [0, 0, 0], c1: [0, 10, 0], c2: [10, 10, 0], b: [10, 0, 0] },
    { kind: "line", a: [10, 0, 0], b: [0, 0, 0] },
  ],
  holes: [],
};
const revolve = (angle, height) => ({
  kind: "revolve",
  profiles: [triangle],
  angle,
  height,
  axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
  mode: "new",
  bodies: [],
});
const twist = (angle, profile = square, offset = 0) => ({
  kind: "extrude",
  profiles: [profile],
  distance: 20,
  normal: [0, 0, 1],
  twist: { angle, origin: [0, 0, 0] },
  draft: { mode: "offset", value: offset },
  mode: "new",
  bodies: [],
});
const circle = {
  outer: [{ kind: "circle", center: [0, 0, 0], radius: 10, normal: [0, 0, 1], axis: [1, 0, 0] }],
  holes: [],
};
// Four exact quarter circles with short straight joins, as from sketch fillets.
const roundedSquare = {
  outer: [
    { kind: "line", a: [-1, -10, 0], b: [1, -10, 0] },
    {
      kind: "arc",
      a: [1, -10, 0],
      mid: [1 + 9 / Math.sqrt(2), -1 - 9 / Math.sqrt(2), 0],
      b: [10, -1, 0],
    },
    { kind: "line", a: [10, -1, 0], b: [10, 1, 0] },
    {
      kind: "arc",
      a: [10, 1, 0],
      mid: [1 + 9 / Math.sqrt(2), 1 + 9 / Math.sqrt(2), 0],
      b: [1, 10, 0],
    },
    { kind: "line", a: [1, 10, 0], b: [-1, 10, 0] },
    {
      kind: "arc",
      a: [-1, 10, 0],
      mid: [-1 - 9 / Math.sqrt(2), 1 + 9 / Math.sqrt(2), 0],
      b: [-10, 1, 0],
    },
    { kind: "line", a: [-10, 1, 0], b: [-10, -1, 0] },
    {
      kind: "arc",
      a: [-10, -1, 0],
      mid: [-1 - 9 / Math.sqrt(2), -1 - 9 / Math.sqrt(2), 0],
      b: [-1, -10, 0],
    },
  ],
  holes: [],
};
const circularTwist = (profile, origin) => ({
  ...twist(90, profile),
  twist: { angle: 90, origin },
});
const cases = [
  ["circle-centered", circularTwist(circle, [0, 0, 0])],
  ["circle-offset", circularTwist(circle, [5, 0, 0])],
  ["rounded-square-offset", circularTwist(roundedSquare, [5, 0, 0])],
  ["revolve-360", revolve(360, 0)],
  ["helix-2", revolve(720, 2)],
  ["helix-18", revolve(6480, 18)],
  ["twist-90", twist(90)],
  ["twist-450", twist(450)],
  ["twist-draft", twist(90, square, 2)],
  ["twist-cubic", twist(90, cubic)],
  ["twist-cubic-draft", twist(90, cubic, 0.5)],
];
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
