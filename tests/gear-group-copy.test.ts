import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { documentArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

test("copying a gear group creates independent membership and inspection stays read-only", async () => {
  const owner = new DocumentOwner();
  try {
    const fixture: { document: SketchDocument } = JSON.parse(
      await readFile("tests/fixtures/gear-cylinders.json", "utf8"),
    );
    const faces = fixture.document.decorators?.flatMap((d) => d.faces) ?? [];
    assert.equal(
      (await owner.call({ kind: "open", document: { ...fixture.document, decorators: [] } })).error,
      undefined,
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.gear", faces },
        })
      ).error,
      undefined,
    );
    const original = owner.view.data.decorators ?? [];
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: faces.map((f) => f.body),
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
            translation: [0, 40, 0],
            duplicate: true,
          },
        })
      ).error,
      undefined,
    );
    const gears = owner.view.data.decorators ?? [];
    assert.equal(gears.length, 4);
    const groups = new Map<string, number>();
    for (const gear of gears) {
      assert.ok(gear.gearGroup);
      groups.set(gear.gearGroup, (groups.get(gear.gearGroup) ?? 0) + 1);
      assert.equal(gear.problem, undefined);
      assert.equal(gearGroupProblem(owner.view.data, gear), null);
    }
    assert.deepEqual([...groups.values()], [2, 2]);
    assert.deepEqual(
      gears.filter((g) => original.some((o) => o.id === g.id)),
      original,
    );
    const before = documentArchive(owner.view.data);
    owner.beginScript("inspect gear groups");
    await owner.scripts.step({ kind: "decorators", input: {} });
    assert.equal(owner.scripts.finish(), false);
    assert.equal(documentArchive(owner.view.data), before);
  } finally {
    owner.close();
  }
});
