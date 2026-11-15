import assert from "node:assert/strict";
import test from "node:test";
import { MeshCalculator } from "../src/backend/mesh-calculator.js";
import { MeshPlan } from "../src/decorators/mesh-plan.js";
import { decodeNativeMesh, encodeMeshPlan } from "../src/model/mesh-wire.js";

function tetrahedron(shift = 0) {
  const plan = new MeshPlan([10, 20, 30]);
  const solid = plan.from({
    vertices: [
      [10, 20, 30],
      [11, 20, 30],
      [10, 21, 30],
      [10, 20, 31],
    ],
    triangles: [
      [0, 2, 1],
      [0, 1, 3],
      [1, 2, 3],
      [2, 0, 3],
    ],
  });
  const result = shift
    ? solid.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, shift, 0, 0, 1])
    : solid;
  return encodeMeshPlan(plan, result.index, 0.001);
}

test("native cancellation drains the child before the export slot can be reused", async () => {
  const calculator = new MeshCalculator();
  try {
    const pending = calculator.calculate(tetrahedron());
    const rejected = assert.rejects(pending, /cancelled/);
    await assert.rejects(calculator.calculate(tetrahedron()), /busy/);
    await calculator.cancel();
    await rejected;
    const result = decodeNativeMesh(await calculator.calculate(tetrahedron()), [10, 20, 30], 0.001);
    assert.equal(result.triangles.length, 4);
    assert.deepEqual(
      result.vertices.map((p) => p.join(",")).sort(),
      ["10,20,30", "11,20,30", "10,21,30", "10,20,31"].sort(),
    );
  } finally {
    await calculator.cancel();
  }
});

test("malformed native input fails without poisoning subsequent exports", async () => {
  const calculator = new MeshCalculator();
  try {
    const invalidRoot = tetrahedron();
    new DataView(invalidRoot).setUint32(8, 100, true);
    const invalidIndex = tetrahedron();
    new DataView(invalidIndex).setUint32(80, 999, true);
    const nonfinite = tetrahedron();
    new DataView(nonfinite).setFloat32(32, NaN, true);
    for (const input of [invalidRoot, invalidIndex, nonfinite, tetrahedron().slice(0, 40)])
      await assert.rejects(calculator.calculate(input), /Invalid|Nonfinite|Truncated/);
    assert.ok((await calculator.calculate(tetrahedron())).byteLength > 20);
  } finally {
    await calculator.cancel();
  }
});

test("native output retains precision and payload integrity checks", async () => {
  const calculator = new MeshCalculator();
  try {
    const result = await calculator.calculate(tetrahedron());
    assert.throws(() => decodeNativeMesh(result.slice(0, -4), [0, 0, 0], 0.001), /Invalid/);
    new DataView(result).setFloat64(12, 0.01, true);
    assert.throws(() => decodeNativeMesh(result, [0, 0, 0], 0.001), /precision budget/);
  } finally {
    await calculator.cancel();
  }
});

test("native Boolean output positions survive handoff without float32 rounding", async () => {
  const calculator = new MeshCalculator();
  const shift = 2 ** -26;
  try {
    const result = await calculator.calculate(tetrahedron(shift));
    const mesh = decodeNativeMesh(result, [10, 20, 30], 0.001);
    assert.equal(Math.max(...mesh.vertices.map(([x]) => x)), 11 + shift);
  } finally {
    await calculator.cancel();
  }
});
