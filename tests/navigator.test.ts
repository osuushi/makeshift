import assert from "node:assert/strict";
import { test } from "node:test";
import { NavigatorGesture } from "../src/tools/navigator-gesture.js";
import { navigatorGroups } from "../src/tools/navigator-tree.js";

test("navigator routes are acyclic, unique per screen and at most three choices deep", () => {
  const visit = (id: string, path: string[]) => {
    assert.ok(!path.includes(id), `Cycle: ${[...path, id].join(" / ")}`);
    const group = navigatorGroups[id];
    assert.ok(group.entries.length > 0 && group.entries.length <= 9, id);
    assert.equal(new Set(group.entries).size, group.entries.length, id);
    for (const child of group.entries) {
      if (navigatorGroups[child]) visit(child, [...path, id]);
      else assert.ok(path.length + 1 <= 3, `${path}/${id}/${child}`);
    }
  };
  visit("root", []);
});

test("new targets under the pointer require leaving the margin and reentering", () => {
  const gesture = new NavigatorGesture();
  const targets = [{ id: "union", x: 100, y: 100, radius: 26 }];
  gesture.reset(targets, 100, 100);
  assert.equal(gesture.enter(targets, 100, 100), undefined);
  assert.equal(gesture.enter(targets, 130, 100), undefined);
  assert.equal(gesture.enter(targets, 100, 100), undefined);
  assert.equal(gesture.enter(targets, 140, 100), undefined);
  assert.equal(gesture.enter(targets, 100, 100), "union");
  assert.equal(gesture.enter(targets, 100, 100), undefined);
});

test("a new screen can immediately accept a different target without dwell", () => {
  const gesture = new NavigatorGesture();
  gesture.reset([{ id: "combine", x: 100, y: 100, radius: 26 }], 0, 0);
  assert.equal(gesture.enter([{ id: "combine", x: 100, y: 100, radius: 26 }], 100, 100), "combine");
  const next = [{ id: "union", x: 200, y: 100, radius: 26 }];
  gesture.reset(next, 100, 100);
  assert.equal(gesture.enter(next, 200, 100), "union");
});
