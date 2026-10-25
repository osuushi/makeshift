import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { DecoratorEdit } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { captured } from "./gear-group-fixture.js";

test("display edits apply to the whole saved group and joining members inherit its mode", async () => {
  const owner = new DocumentOwner();
  const edit = async (edit: DecoratorEdit) => {
    assert.equal((await owner.call({ kind: "decorator", edit })).error, undefined);
  };
  try {
    const faces = await captured(owner);
    await edit({ action: "apply", definition: "freac.gear", faces });
    const original = owner.view.data;
    const members = original.decorators ?? [];
    assert.equal(members.length, 2);
    await edit({ action: "display", ids: [members[0].id], mode: "texture" });
    assert.ok(owner.view.data.decorators?.every((d) => d.display === "texture"));
    assert.deepEqual(owner.view.data.bodies, original.bodies);
    const textured = documentArchive(owner.view.data);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(documentArchive(owner.view.data), textured);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(textured) })).error,
      undefined,
    );
    assert.ok(owner.view.data.decorators?.every((d) => d.display === "texture"));
    await edit({
      action: "apply",
      definition: "freac.gear",
      faces: [faces[1]],
      newGearGroup: true,
    });
    await edit({ action: "display", ids: [members[1].id], mode: "color-only" });
    assert.deepEqual(
      owner.view.data.decorators?.map((d) => d.display),
      ["texture", "color-only"],
    );
    await edit({
      action: "apply",
      definition: "freac.gear",
      faces: [faces[1]],
      gearGroup: members[0].gearGroup,
    });
    assert.ok(owner.view.data.decorators?.every((d) => d.display === "texture"));
    await edit({ action: "display", ids: [members[1].id], mode: "default" });
    assert.ok(owner.view.data.decorators?.every((d) => !Object.hasOwn(d, "display")));
  } finally {
    owner.close();
  }
});
