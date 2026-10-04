import assert from "node:assert/strict";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { type MeshFitInput, validateMeshFit } from "../src/model/mesh-fit.js";
import { sharpBox, sphereFit, torusLayout } from "./mesh-fit-fixtures.js";

const invalid: [string, (input: MeshFitInput) => void, RegExp][] = [
  ["open triangle mesh", (i) => i.mesh.triangles.pop(), /closed manifold/],
  ["open quad layout", (i) => i.layout.quads.pop(), /closed manifold/],
  ["reversed target face", (i) => i.mesh.triangles[0].reverse(), /oriented closed/],
  [
    "inward target",
    (i) => {
      for (const f of i.mesh.triangles) f.reverse();
    },
    /outward orientation/,
  ],
  [
    "inward layout",
    (i) => {
      for (const f of i.layout.quads) f.reverse();
    },
    /outward orientation/,
  ],
  [
    "repeated target vertex",
    (i) => {
      i.mesh.triangles[0][1] = i.mesh.triangles[0][0];
    },
    /Repeated vertex/,
  ],
  ["unused target vertex", (i) => i.mesh.vertices.push([0, 0, 0]), /unused vertex/],
  [
    "collapsed triangle",
    (i) => {
      i.mesh.vertices[i.mesh.triangles[0][1]] = i.mesh.vertices[i.mesh.triangles[0][0]];
    },
    /collapsed|degenerate/,
  ],
  [
    "fractional index",
    (i) => {
      i.layout.quads[0][0] = 0.5;
    },
    /Invalid mesh vertex index/,
  ],
  [
    "out of range index",
    (i) => {
      i.layout.quads[0][0] = 100;
    },
    /Invalid mesh vertex index/,
  ],
  [
    "non-edge crease",
    (i) => {
      i.layout.creases = [[0, 6]];
    },
    /Creases/,
  ],
  [
    "duplicate crease",
    (i) => {
      i.layout.creases?.push(i.layout.creases[0]);
    },
    /Creases/,
  ],
  [
    "different genus",
    (i) => {
      i.layout = torusLayout(20, 6, 8, 4);
      i.maxPatches = 32;
    },
    /same topology/,
  ],
  [
    "zero allowance",
    (i) => {
      i.tolerance = 0;
    },
    /Invalid fit tolerance/,
  ],
  [
    "angle beyond range",
    (i) => {
      i.smoothAngle = 90;
    },
    /Invalid fit tolerance/,
  ],
  [
    "patch budget below layout",
    (i) => {
      i.maxPatches = 5;
    },
    /patch budget/,
  ],
  [
    "disconnected target",
    (i) => {
      const count = i.mesh.vertices.length;
      i.mesh.vertices.push(
        ...i.mesh.vertices.map(([x, y, z]) => [x + 100, y, z] as [number, number, number]),
      );
      i.mesh.triangles.push(
        ...i.mesh.triangles.map((f) => f.map((v) => v + count) as [number, number, number]),
      );
    },
    /connected component/,
  ],
];
for (const [name, change, message] of invalid)
  test(`native mesh fit rejects ${name}`, async () => {
    const kernel = new SolidCalculator(),
      input = sharpBox();
    try {
      change(input);
      await assert.rejects(kernel.calculate({ ...input, kind: "fit-mesh", bodies: [] }), message);
    } finally {
      kernel.close();
    }
  });

test("tight allowance rejects explicitly instead of silently returning an inaccurate shape", async () => {
  const kernel = new SolidCalculator();
  try {
    await assert.rejects(
      kernel.calculate({
        ...sphereFit(),
        tolerance: 1e-5,
        maxPatches: 6,
        kind: "fit-mesh",
        bodies: [],
      }),
      /exceeds requested tolerance.*sampled deviation/,
    );
  } finally {
    kernel.close();
  }
});
test("script boundary rejects non-finite coordinates before JSON serialization", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const input = sharpBox();
    input.mesh.vertices[0][0] = value;
    assert.throws(() => validateMeshFit(input), /Invalid mesh fitting/);
  }
  const input = sharpBox();
  input.tolerance = NaN;
  assert.throws(() => validateMeshFit(input), /Invalid mesh fitting/);
});
