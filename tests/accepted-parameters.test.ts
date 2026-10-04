import assert from "node:assert/strict";
import test from "node:test";
import { acceptedParameters } from "../src/backend/accepted-parameters.js";
import { describeOperation } from "../src/sketch/operation-history.js";

test("accepted edge size records the verified clamp without changing mode, inputs or cleanup", () => {
  const original = {
    ...describeOperation({
      kind: "finish-edges",
      operation: {
        edges: [{ body: "input", edge: "source-edge" }],
        size: 99,
        mode: "chamfer",
      },
    }),
  };
  original.parameters.cleanup = true;
  const normalized = acceptedParameters(original, { edgeSize: 2.5 });
  assert.deepEqual(normalized.parameters, {
    cleanup: true,
    operation: {
      edges: [{ body: "input", edge: "source-edge" }],
      size: 2.5,
      mode: "chamfer",
    },
  });
  assert.equal((original.parameters.operation as { size: number }).size, 99);
});
test("accepted offset preserves original face IDs and exact radius while recording verified distance", () => {
  for (const radius of [undefined, 0.75]) {
    const operation = describeOperation({
      kind: "offset-faces",
      operation: {
        faces: [{ body: "input", face: "source-face" }],
        distance: 99,
        ...(radius === undefined ? {} : { radius }),
      },
    });
    const normalized = acceptedParameters(operation, { offsetDistance: -3 });
    assert.deepEqual(normalized.parameters.operation, {
      faces: [{ body: "input", face: "source-face" }],
      distance: -3,
      ...(radius === undefined ? {} : { radius }),
    });
    assert.equal((operation.parameters.operation as { distance: number }).distance, 99);
  }
});
test("unrelated accepted intent is unchanged and missing/nonfinite measurements fail closed", () => {
  const operation = describeOperation({
    kind: "cleanup",
    selection: [{ body: "input", whole: true, faces: [], edges: [] }],
  });
  assert.equal(acceptedParameters(operation, {}), operation);
  const offset = describeOperation({ kind: "offset-faces", operation: { faces: [], distance: 3 } });
  for (const value of [undefined, NaN, Infinity])
    assert.throws(
      () => acceptedParameters(offset, { offsetDistance: value }),
      /verified measurement/,
    );
});
