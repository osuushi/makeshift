import assert from "node:assert/strict";
import { test } from "node:test";
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
