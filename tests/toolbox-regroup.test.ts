import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultToolbox,
  drawerTitle,
  toolboxMenu as menu,
  transformToolGroup as transforms,
} from "../src/tools/toolbox-defaults.js";
import { toolboxIconPaths } from "../src/tools/toolbox-icons.js";
import { moveToolbox, normalizeToolbox } from "../src/tools/toolbox-layout.js";
import { regroupToolbox } from "../src/tools/toolbox-regroup.js";
import {
  toolboxGroup as group,
  toolboxLeaf,
  toolboxLeaves,
  validToolboxTree,
} from "../src/tools/toolbox-tree.js";

test("v4 upgrade separates solid families and preserves other customization and choices", () => {
  const solids = group("cube", "cylinder", "sphere", "cone", "extrude", "revolve", "loft");
  solids.selected = 5;
  const drawing = group("circle", "line");
  const old = group(
    "select",
    drawing,
    solids,
    group("union", "subtract", "drill"),
    group("fillet", "shell"),
    group("transform", "duplicate", "mirror"),
    menu(drawerTitle, menu("My tools", "project", "trim")),
  );
  const next = regroupToolbox(old);
  assert.ok(validToolboxTree(next));
  assert.deepEqual(next.items.slice(0, 3), ["select", transforms(), drawing]);
  assert.deepEqual(next.items[3], group("cube", "cylinder", "sphere", "cone", "drill"));
  assert.equal(toolboxLeaf(next.items[4]), "revolve");
  assert.deepEqual(next.items[5], group("union", "subtract"));
  assert.deepEqual(
    next.items.at(-1),
    menu(drawerTitle, menu("My tools", "project", "trim"), "mirror"),
  );
  assert.equal(toolboxLeaves(next).includes("duplicate"), false);
  assert.deepEqual(regroupToolbox(next), next);
});

test("Transform stays directly below Select and Duplicate cannot be restored by saved preferences", () => {
  const next = normalizeToolbox(group(group("line", "transform", "duplicate"), "select"));
  assert.deepEqual(next.items, ["select", transforms(), "line", menu(drawerTitle)]);
  assert.equal(moveToolbox(next, [1], [2], "inside"), next);
  assert.equal(moveToolbox(next, [2], [1], "inside"), next);
});

test("every eligible tool has its own explicit icon, with no placeholder fallback", () => {
  const ids = toolboxLeaves(defaultToolbox());
  for (const id of ids) assert.ok(toolboxIconPaths[id], `Missing icon for ${id}`);
  assert.equal(new Set(ids.map((id) => toolboxIconPaths[id])).size, ids.length);
});
