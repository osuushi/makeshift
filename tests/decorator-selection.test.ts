import assert from "node:assert/strict";
import test from "node:test";
import { selectedDecoratorFaces } from "../src/decorators/selection.js";

test("decorator shortcut includes selected supports once and respects partial membership", () => {
  const a = { body: "one", face: "a" };
  const b = { body: "one", face: "b" };
  const c = { body: "two", face: "a" };
  const instances = [{ faces: [a, b] }, { faces: [c] }];
  assert.deepEqual(selectedDecoratorFaces(instances, [{ kind: "face", ...a }]), [a]);
  assert.deepEqual(
    selectedDecoratorFaces(instances, [
      { kind: "body", body: "one" },
      { kind: "face", ...a },
    ]),
    [a, b],
  );
  assert.deepEqual(selectedDecoratorFaces(instances, [{ kind: "face", ...c }]), [c]);
  assert.deepEqual(
    selectedDecoratorFaces(instances, [{ kind: "edge", body: "one", edge: "a" }]),
    [],
  );
  assert.deepEqual(
    selectedDecoratorFaces(instances, [{ kind: "face", body: "one", face: "plain" }]),
    [],
  );
  assert.deepEqual(selectedDecoratorFaces(instances, []), []);
});
