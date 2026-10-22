import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultToolbox,
  normalizeToolbox,
  promoteBooleanGroup,
} from "../src/tools/toolbox-defaults.js";
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
test("selecting a nested alternate remembers every ancestor", () => {
  const tree = group(group("a", group("b", "c")), "d");
  const selected = selectToolboxPath(tree, [0, 1, 1]);
  assert.equal(toolboxLeaf(selected.items[0]), "c");
  assert.equal(toolboxLeaf(tree.items[0]), "a");
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
  assert.deepEqual(clean, group("select", { items: ["circle", "line"], selected: 1 }));
  assert.deepEqual(normalizeToolbox(moveToolboxItem(clean, [0], [1], "inside")), clean);
});

test("Boolean promotion retains chosen alternatives and other saved groups", () => {
  const booleans = {
    ...group("union", "subtract", "intersect", "split", "imprint", "drill"),
    selected: 1,
  };
  const old = group("select", group("circle", "line"), group("fillet", booleans, "shell"));
  const upgraded = promoteBooleanGroup(old);
  assert.deepEqual(upgraded.items, [
    "select",
    group("circle", "line"),
    booleans,
    group("fillet", "shell"),
  ]);
  assert.ok(validToolboxTree(upgraded));
  assert.deepEqual(promoteBooleanGroup(upgraded), upgraded);
});
