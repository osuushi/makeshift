import assert from "node:assert/strict";
import test from "node:test";
import type { Body } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";
import { narrowCategories } from "../src/tools/selection-policy.js";
import { ToolSelection } from "../src/tools/tool-selection.js";

test("narrowing retains every member and the order within retained categories", () => {
  const selected = ["body:b", "sketch:a", "body:a", "edge:e"];
  assert.deepEqual(
    narrowCategories(
      selected,
      (s) => s.split(":")[0],
      (s) => s.length >= 2 && s.every((t) => t.startsWith("body:")),
    ),
    ["body:b", "body:a"],
  );
  assert.deepEqual(selected, ["body:b", "sketch:a", "body:a", "edge:e"]);
});
test("excess members and incompatible geometry within one category require explicit picking", () => {
  assert.equal(
    narrowCategories(
      [1, 2, 3],
      () => "face",
      (s) => s.length === 1,
    ),
    null,
  );
  assert.equal(
    narrowCategories(
      [1, 2],
      () => "face",
      (s) => s.every((n) => n === 1),
    ),
    null,
  );
});
test("ambiguous valid category choices require picking, including unequal category sizes", () => {
  assert.equal(
    narrowCategories(
      ["body:a", "body:b", "sketch:c"],
      (s) => s.split(":")[0],
      (s) => s.every((t) => t.startsWith("body:")) || s.every((t) => t.startsWith("sketch:")),
    ),
    null,
  );
});
test("union drops the sketch category, preserves operand order and leaves inspection side effect free", () => {
  const bodies = ["a", "b"].map(
    (id): Body => ({
      id,
      brep: "",
      volume: 1,
      center: [0, 0, 0],
      bounds: [0, 0, 0, 1, 1, 1],
      faces: [],
      edges: [],
    }),
  );
  const data: SketchDocument = {
    units: "mm",
    bodies,
    sketches: [{ id: "s", plane: planes.XY, curves: [], groups: [], constraints: [] }],
  };
  const modeling = new ModelSelection();
  modeling.sync(data);
  modeling.targets = [
    { kind: "body", body: "b" },
    { kind: "sketch", sketch: "s" },
    { kind: "body", body: "a" },
  ];
  modeling.setTool(null);
  const editor = { world: { active: false }, modeling, store: { data } } as unknown as SketchEditor;
  const selection = new ToolSelection(editor, "union", () => {
    const result = modeling.resolve("duplicate");
    return result.available ? null : result.reason;
  });
  const original = [...modeling.targets];
  assert.deepEqual(selection.narrow(), [original[0], original[2]]);
  assert.deepEqual(modeling.targets, original);
  assert.equal(modeling.tool, null);
  modeling.targets = [original[0], original[1]];
  assert.equal(selection.narrow(), null);
});

test("custom decorator entry validates and retains the entire face category before running", async () => {
  const { selectDecoratorInputs } = await import("../src/decorators/selection-action.js");
  const { ActiveInteraction } = await import("../src/sketch/active-interaction.js");
  const modeling = new ModelSelection();
  modeling.targets = [
    { kind: "face", body: "b", face: "f1" },
    { kind: "sketch", sketch: "s" },
    { kind: "face", body: "b", face: "f2" },
  ];
  const editor = {
    world: { active: false },
    modeling,
    store: { data: { sketches: [], bodies: [] } },
    interactions: new ActiveInteraction(() => {}),
    refresh: () => {},
    blocked: false,
    isDragging: false,
  } as unknown as SketchEditor;
  const expected = [
    { body: "b", face: "f1" },
    { body: "b", face: "f2" },
  ];
  let ran = false;
  await selectDecoratorInputs(
    editor,
    "Apply test",
    async (faces) => {
      assert.deepEqual(faces, expected);
      return null;
    },
    (faces) => {
      assert.deepEqual(faces, expected);
      ran = true;
    },
  );
  assert.equal(ran, true);
  assert.deepEqual(
    modeling.targets,
    expected.map((face) => ({ kind: "face", ...face })),
  );
});

test("changing selection during a custom inspection does not apply a stale result", async () => {
  const { selectDecoratorInputs } = await import("../src/decorators/selection-action.js");
  const { ActiveInteraction } = await import("../src/sketch/active-interaction.js");
  const modeling = new ModelSelection();
  modeling.targets = [{ kind: "face", body: "b", face: "f1" }];
  const editor = {
    world: { active: false },
    modeling,
    store: { data: { sketches: [], bodies: [] } },
    interactions: new ActiveInteraction(() => {}),
    refresh: () => {},
    blocked: false,
    isDragging: false,
  } as unknown as SketchEditor;
  let enteredResolve: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  let verdictResolve: (value: string | null) => void = () => {};
  const verdict = new Promise<string | null>((resolve) => {
    verdictResolve = resolve;
  });
  let ran = false;
  const action = selectDecoratorInputs(
    editor,
    "Apply test",
    () => {
      enteredResolve();
      return verdict;
    },
    () => {
      ran = true;
    },
  );
  await entered;
  modeling.targets = [{ kind: "face", body: "b", face: "f2" }];
  verdictResolve(null);
  await action;
  assert.equal(ran, false);
  assert.deepEqual(modeling.targets, [{ kind: "face", body: "b", face: "f2" }]);
});
