import assert from "node:assert/strict";
import test from "node:test";
import { modelingShortcut, modelingShortcutLabel } from "../src/model/modeling-shortcuts.js";

const event = (key: string, shiftKey = false) => ({
  key,
  shiftKey,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
});

test("common shortcuts distinguish shifted Boolean from existing keys", () => {
  for (const [key, shift, id, label] of [
    ["e", false, "extrude", "E"],
    ["s", false, "shell", "S"],
    ["S", true, "subtract", "⇧S"],
    ["U", true, "union", "⇧U"],
    ["I", true, "intersect", "⇧I"],
    ["l", false, "loft", "L"],
    ["f", false, "fillet", "F"],
    ["F", true, "chamfer", "⇧F"],
    ["R", true, "revolve", "⇧R"],
    ["o", false, "offset", "O"],
    ["m", false, "transform", "M"],
  ] as const) {
    assert.equal(modelingShortcut(event(key, shift), null), id);
    assert.equal(modelingShortcutLabel(id), label);
  }
  assert.equal(modelingShortcut(event("E", true), null), null);
  assert.equal(modelingShortcutLabel("erode"), "");
  assert.equal(modelingShortcut(event("O", true), null), "offset");
  assert.equal(modelingShortcut(event("M", true), null), "transform");
  for (const key of ["u", "i", "n", "r"]) assert.equal(modelingShortcut(event(key), null), null);
});

test("new global entries leave active tools in control before event interception", () => {
  for (const [key, shift] of [
    ["u", true],
    ["s", true],
    ["i", true],
    ["e", true],
    ["l", false],
  ] as const)
    assert.equal(
      modelingShortcut(event(key, shift), { kind: "projection", canFinish: false }),
      null,
    );
  assert.equal(modelingShortcut(event("e"), { kind: "projection", canFinish: false }), "extrude");
  assert.equal(
    modelingShortcut(event("F", true), { kind: "projection", canFinish: false }),
    "chamfer",
  );
});

test("host modifiers, key repeat and IME composition never activate modeling shortcuts", () => {
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "repeat", "isComposing"] as const)
    assert.equal(modelingShortcut({ ...event("U", true), [modifier]: true }, null), null);
  assert.equal(modelingShortcut(event("Shift", true), null), null);
});

test("released finish-capable edits offer global switches, retaining Extrude local Boolean keys", () => {
  assert.equal(modelingShortcut(event("E", true), { kind: "face-offset", canFinish: true }), null);
  for (const [key, shift, id] of [
    ["U", true, "union"],
    ["S", true, "subtract"],
    ["I", true, "intersect"],
    ["l", false, "loft"],
  ] as const) {
    assert.equal(modelingShortcut(event(key, shift), { kind: "face-offset", canFinish: true }), id);
    assert.equal(
      modelingShortcut(event(key, shift), { kind: "face-offset", canFinish: false }),
      null,
    );
    const local = ["union", "subtract", "intersect"].includes(id);
    assert.equal(
      modelingShortcut(event(key, shift), { kind: "extrude", canFinish: true }),
      local ? null : id,
    );
  }
});
