import assert from "node:assert/strict";
import test from "node:test";
import { TransformLayers, transformLayers } from "../src/model/transform-layers.js";
import { addTransformTools } from "../src/tools/toolbox-migration.js";
import { toolboxGroup, toolboxLeaves } from "../src/tools/toolbox-tree.js";

test("tool entry selects one layer without overwriting the last explicitly changed combination", () => {
  const state = new TransformLayers();
  assert.equal(state.enabled("move"), true);
  state.enter();
  assert.ok(transformLayers.every((layer) => state.enabled(layer)));
  state.toggle("scale");
  state.enter("scale");
  assert.deepEqual(
    transformLayers.filter((layer) => state.enabled(layer)),
    ["scale"],
  );
  state.enter();
  assert.deepEqual(
    transformLayers.filter((layer) => state.enabled(layer)),
    ["move", "rotate"],
  );
  state.enter("rotate");
  state.toggle("scale");
  state.enter("move");
  state.enter();
  assert.deepEqual(
    transformLayers.filter((layer) => state.enabled(layer)),
    ["rotate", "scale"],
  );
});
test("the last transform layer cannot be removed or change recalled choices", () => {
  const state = new TransformLayers();
  state.enter("move");
  assert.equal(state.toggle("move"), false);
  assert.equal(state.enabled("move"), true);
  state.enter();
  assert.ok(transformLayers.every((layer) => state.enabled(layer)));
});
test("saved toolbox gets each new transform entry once without resetting customization", () => {
  const old = toolboxGroup("select", "transform", toolboxGroup("circle", "line"));
  const next = addTransformTools(old);
  assert.deepEqual(next.items[2], old.items[2]);
  assert.deepEqual(
    toolboxLeaves(next).sort(),
    ["circle", "line", "move", "rotate", "scale", "select", "transform"].sort(),
  );
  assert.deepEqual(addTransformTools(next), next);
});
