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

test("common shortcuts distinguish shifted Boolean/Erode from existing keys", () => {
  for (const [key, shift, id, label] of [
    ["e", false, "extrude", "E"],
    ["s", false, "shell", "S"],
    ["E", true, "erode", "⇧E"],
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
    assert.equal(modelingShortcut(event(key, shift), false), id);
    assert.equal(modelingShortcutLabel(id), label);
  }
  assert.equal(modelingShortcut(event("O", true), false), "offset");
  assert.equal(modelingShortcut(event("M", true), false), "transform");
  for (const key of ["u", "i", "n", "r"]) assert.equal(modelingShortcut(event(key), false), null);
});

test("new global entries leave active tools in control before event interception", () => {
  for (const [key, shift] of [
    ["u", true],
    ["s", true],
    ["i", true],
    ["e", true],
    ["l", false],
  ] as const)
    assert.equal(modelingShortcut(event(key, shift), true), null);
  assert.equal(modelingShortcut(event("e"), true), "extrude");
  assert.equal(modelingShortcut(event("F", true), true), "chamfer");
});

test("host modifiers, key repeat and IME composition never activate modeling shortcuts", () => {
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "repeat", "isComposing"] as const)
    assert.equal(modelingShortcut({ ...event("U", true), [modifier]: true }, false), null);
  assert.equal(modelingShortcut(event("Shift", true), false), null);
});
