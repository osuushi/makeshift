import assert from "node:assert/strict";
import test from "node:test";
import { EntityVisibility } from "../src/model/entity-visibility.js";

test("isolation reveals selected owners and exit never hides revealed entities", () => {
  const visibility = new EntityVisibility();
  visibility.hide("body-a");
  visibility.hide("sketch-b");
  visibility.isolate(["body-a", "body-c"]);
  assert.equal(visibility.visible("body-a"), true);
  assert.equal(visibility.visible("body-c"), true);
  assert.equal(visibility.visible("sketch-b"), false);
  assert.equal(visibility.visible("sketch-d"), false);
  visibility.show("sketch-b");
  assert.equal(visibility.visible("sketch-b"), true);
  visibility.endIsolation();
  for (const id of ["body-a", "body-c", "sketch-b", "sketch-d"])
    assert.equal(visibility.visible(id), true, id);
});

test("a deliberate hide during isolation stays hidden on exit; reset clears isolation", () => {
  const visibility = new EntityVisibility();
  visibility.isolate(["body-a"]);
  visibility.hide("body-a");
  visibility.endIsolation();
  assert.equal(visibility.visible("body-a"), false);
  visibility.isolate(["body-b"]);
  visibility.reset();
  assert.equal(visibility.isolating, false);
  assert.equal(visibility.visible("body-a"), true);
});

test("new owners join isolation while existing and deliberately hidden owners stay hidden", () => {
  const visibility = new EntityVisibility();
  const original = { sketches: [{ id: "old-sketch" }], bodies: [{ id: "old-body" }] };
  visibility.observe(original);
  visibility.isolate(["old-body"]);
  const created = {
    sketches: [...original.sketches, { id: "new-sketch" }],
    bodies: [...original.bodies, { id: "new-body" }],
    constructionPlanes: [{ id: "new-plane" }],
  };
  visibility.observe(created);
  for (const id of ["new-sketch", "new-body", "new-plane"])
    assert.equal(visibility.visible(id), true, id);
  assert.equal(visibility.visible("old-sketch"), false);
  visibility.hide("new-body");
  visibility.observe(original);
  visibility.observe(created);
  assert.equal(visibility.visible("new-body"), false, "Restore preserves deliberate hiding");
  assert.equal(visibility.visible("old-sketch"), false, "Restore does not reveal old owners");
  visibility.isolate(["old-body"]);
  visibility.observe(created);
  assert.equal(visibility.visible("new-sketch"), false, "A new isolation excludes known owners");
  visibility.endIsolation();
  assert.equal(visibility.visible("new-plane"), true);
  assert.equal(visibility.visible("new-body"), false);
});

test("body x-ray survives hide/isolate but resets with the document window", () => {
  const visibility = new EntityVisibility();
  visibility.xray.add("body-a");
  visibility.hide("body-a");
  visibility.isolate(["body-b"]);
  visibility.endIsolation();
  visibility.show("body-a");
  assert.equal(visibility.xray.has("body-a"), true);
  visibility.reset();
  assert.equal(visibility.xray.size, 0);
});
