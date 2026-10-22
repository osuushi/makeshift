import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultToolbox, drawerTitle, toolboxMenu as menu } from "../src/tools/toolbox-defaults.js";
import { moveToolbox, normalizeToolbox } from "../src/tools/toolbox-layout.js";
import { migrateToolbox } from "../src/tools/toolbox-migration.js";
import {
  toolboxGroup as group,
  moveToolboxItem,
  selectToolboxPath,
  toolboxItem,
  toolboxLeaf,
  toolboxLeaves,
  validToolboxTree,
} from "../src/tools/toolbox-tree.js";

test("defaults are an owned tree without aliases or constraints", () => {
  const tree = defaultToolbox();
  assert.ok(validToolboxTree(tree));
  assert.equal(
    toolboxLeaves(tree).some((id) => /^(constraint-|lock-|point-)/.test(id)),
    false,
  );
});
test("flat alternatives remember choices; named menus never promote descendants", () => {
  const tree = group(
    group("line", "circle"),
    menu(drawerTitle, menu("Sketch editing", "trim", "sketch-offset")),
  );
  const selected = selectToolboxPath(tree, [0, 1]);
  assert.equal(toolboxLeaf(selected.items[0]), "circle");
  assert.equal(selectToolboxPath(selected, [1, 0, 1]), selected);
  assert.equal(selectToolboxPath(selected, [1]), selected);
});
test("drop on a tool creates an owned group, retaining selected tool", () => {
  const tree = group("first", "a", "b");
  tree.selected = 2;
  const next = moveToolboxItem(tree, [1], [2], "inside");
  assert.deepEqual(next, { items: ["first", group("b", "a")], selected: 1 });
  assert.deepEqual(toolboxLeaves(next).sort(), ["a", "b", "first"]);
});
test("sibling reordering preserves selection and adjusts destination after removal", () => {
  const tree = group("a", "b", "c");
  tree.selected = 1;
  assert.deepEqual(moveToolboxItem(tree, [0], [2], "after"), {
    items: ["b", "c", "a"],
    selected: 0,
  });
});
test("moving between groups collapses singletons without losing selected descendants", () => {
  const tree = group(group("a", "b"), group("c", "d"));
  tree.selected = 0;
  const next = moveToolboxItem(tree, [0, 0], [1, 0], "after");
  assert.deepEqual(next.items, ["b", group("c", "a", "d")]);
  assert.ok(validToolboxTree(next));
});
test("moving out of nested group or into root keeps each tool exactly once", () => {
  const tree = group(group(group("a", "b"), "c"), "d");
  const next = moveToolboxItem(tree, [0, 0, 0], [0, 0], "after");
  assert.deepEqual(toolboxItem(next, [0]), group("b", "a", "c"));
  const root = moveToolboxItem(next, [0, 1], [], "inside");
  assert.deepEqual(toolboxLeaves(root).sort(), ["a", "b", "c", "d"]);
});
test("cannot create cycles, aliases or invalid selected indices", () => {
  const tree = group(group("a", "b"), "c");
  assert.equal(moveToolboxItem(tree, [0], [0, 1], "inside"), tree);
  assert.equal(validToolboxTree(group("a", group("a", "b"))), false);
  assert.equal(validToolboxTree({ items: ["a"], selected: 5 }), false);
  assert.equal(validToolboxTree({ items: [], selected: 0 }), false);
});

test("compact defaults keep Select standalone and omit immediate commands", () => {
  const tree = defaultToolbox();
  assert.equal(tree.items.length, 7);
  assert.equal(tree.items[0], "select");
  assert.deepEqual(
    tree.items[3],
    group("union", "subtract", "intersect", "split", "imprint", "drill"),
  );
  const leaves = toolboxLeaves(tree);
  for (const id of [
    "select-face",
    "selection-clear",
    "show-bodies",
    "grid",
    "export-stl",
    "capture",
    "cleanup",
    "start-sketch",
    "import-mesh",
  ])
    assert.equal(leaves.includes(id), false, id);
});
test("saved layouts cannot group Select or admit commands; selected tools survive pruning", () => {
  const root = group(
    group("grid", "circle", "line"),
    group("select", "selection-clear"),
    "export-stl",
  );
  (root.items[0] as ReturnType<typeof group>).selected = 2;
  const clean = normalizeToolbox(root);
  assert.deepEqual(
    clean,
    group("select", { items: ["circle", "line"], selected: 1 }, menu(drawerTitle)),
  );
  assert.deepEqual(normalizeToolbox(moveToolboxItem(clean, [0], [1], "inside")), clean);
});

test("migration keeps Booleans at the root and moves buried rare tools into named menus", () => {
  const old = group(
    "select",
    group("line", group("trim", "sketch-offset")),
    group("cube", group("extrude", "revolve")),
    group("union", "subtract"),
  );
  (old.items[1] as ReturnType<typeof group>).selected = 1;
  const upgraded = migrateToolbox(old);
  assert.deepEqual(upgraded.items.slice(0, 4), [
    "select",
    "line",
    group("cube", "extrude", "revolve"),
    group("union", "subtract"),
  ]);
  assert.deepEqual(
    upgraded.items.at(-1),
    menu(drawerTitle, menu("Sketch editing", "trim", "sketch-offset")),
  );
  assert.deepEqual(toolboxLeaves(upgraded).sort(), toolboxLeaves(old).sort());
  assert.ok(validToolboxTree(upgraded));
});

test("dragging within an ordinary group reorders instead of creating nested alternatives", () => {
  const tree = group("select", group("cube", "cylinder", "sphere"), menu(drawerTitle));
  const next = moveToolbox(tree, [1, 1], [1, 2], "inside");
  assert.deepEqual(next.items[1], group("cube", "sphere", "cylinder"));
  assert.equal(moveToolbox(tree, [0], [1], "inside"), tree);
  assert.equal(moveToolbox(tree, [2], [1], "inside"), tree);
});

test("tools move in and out of named menus without changing labels or creating aliases", () => {
  const tree = group(
    "select",
    group("line", "circle"),
    menu(drawerTitle, menu("Sketch editing", "trim")),
  );
  const outside = moveToolbox(tree, [2, 0, 0], [1], "inside");
  assert.deepEqual(outside.items[1], group("line", "circle", "trim"));
  assert.deepEqual(outside.items[2], menu(drawerTitle, menu("Sketch editing")));
  assert.ok(validToolboxTree(outside), "empty titled menus remain drop targets");
  const returned = moveToolbox(outside, [1, 2], [2, 0], "inside");
  assert.deepEqual(returned, tree);
  const groupOutside = moveToolbox(tree, [2, 0], [], "inside");
  assert.equal(groupOutside.items.at(-1), "trim", "one tool becomes standalone outside the drawer");
});

test("whole groups become named menus in the drawer and flat alternatives outside it", () => {
  const tree = group("select", group("line", "circle"), menu(drawerTitle));
  const inside = moveToolbox(tree, [1], [2], "inside");
  const drawer = inside.items[1] as ReturnType<typeof group>;
  assert.ok((drawer.items[0] as ReturnType<typeof group>).title);
  const outside = moveToolbox(inside, [1, 0], [], "inside");
  assert.deepEqual(outside.items.at(-1), group("line", "circle"));
  assert.deepEqual(toolboxLeaves(outside).sort(), ["circle", "line", "select"]);
});

test("v2 migration retains the earlier top-level Boolean promotion", () => {
  const booleans = group("union", "subtract", "intersect", "split", "imprint", "drill");
  booleans.selected = 1;
  const old = group("select", group("fillet", booleans, "shell"));
  const upgraded = migrateToolbox(old);
  assert.deepEqual(upgraded.items[1], booleans);
  assert.deepEqual(upgraded.items[2], group("fillet", "shell"));
});
