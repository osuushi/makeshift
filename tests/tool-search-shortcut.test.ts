import assert from "node:assert/strict";
import test from "node:test";
import { iosToolSearch, toolSearchShortcut } from "../src/tools/search-shortcut.js";

test("iPad desktop browsing mode selects the iOS shortcut without treating a Mac as iOS", () => {
  assert.equal(iosToolSearch("MacIntel", 5), true);
  assert.equal(iosToolSearch("iPad", 0), true);
  assert.equal(iosToolSearch("iPhone", 1), true);
  assert.equal(iosToolSearch("MacIntel", 0), false);
  assert.equal(iosToolSearch("Linux armv8l", 5), false);
});
test("tool search reserves Cmd-P on iOS/Mac while preserving iOS Find and Ctrl-P Print", () => {
  const command = { key: "p", metaKey: true, ctrlKey: false, altKey: false };
  for (const ios of [true, false]) assert.equal(toolSearchShortcut(command, ios), true);
  assert.equal(toolSearchShortcut({ ...command, key: "f" }, true), false);
  assert.equal(toolSearchShortcut({ ...command, key: "f" }, false), true);
  assert.equal(toolSearchShortcut({ ...command, metaKey: false, ctrlKey: true }, false), false);
  assert.equal(toolSearchShortcut({ ...command, altKey: true }, false), false);
  assert.equal(toolSearchShortcut({ ...command, metaKey: false }, true), false);
});
