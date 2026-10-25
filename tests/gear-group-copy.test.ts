import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { documentArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

test("copied gears retain their original group through later edits and read-only inspection", async () => {
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
    assert.equal(new Set(gears.map((gear) => gear.id)).size, 4);
    for (const gear of gears) {
      assert.ok(gear.gearGroup);
      assert.equal(gear.gearGroup, original[0].gearGroup);
      assert.equal(gear.problem, undefined);
      assert.equal(gearGroupProblem(owner.view.data, gear), null);
    }
    assert.deepEqual(
      gears.filter((g) => original.some((o) => o.id === g.id)),
      original,
    );
    const before = documentArchive(owner.view.data);
    owner.beginScript("inspect gear groups");
    await owner.scripts.step({ kind: "decorators", input: {} });
    assert.equal(owner.scripts.finish(), false);
    assert.equal(documentArchive(owner.view.data), before);
    const membership = () =>
      owner.view.data.decorators?.map(({ id, faces, gearGroup }) => ({ id, faces, gearGroup }));
    const copiedMembership = membership();
    // Editing an original must not replay the unchanged copies' creation correspondence.
    assert.equal(
      (await owner.call({ kind: "offset-faces", operation: { faces: [faces[0]], distance: 0.02 } }))
        .error,
      undefined,
    );
    assert.deepEqual(membership(), copiedMembership);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.deepEqual(membership(), copiedMembership);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(membership(), copiedMembership);
  } finally {
    owner.close();
  }
});
