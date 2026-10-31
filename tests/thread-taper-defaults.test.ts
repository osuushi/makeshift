import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { DecoratorEdit } from "../src/decorators/types.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("built-in tapers follow rod/hole supports through recall, reselection and Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [8, 5]);
    const outer = body.faces.find((f) => f.cylinder?.outward === 1);
    const inner = body.faces.find((f) => f.cylinder?.outward === -1);
    assert.ok(outer && inner);
    const edit = async (edit: DecoratorEdit) => {
      const result = await owner.call({ kind: "decorator", edit });
      assert.equal(result.error, undefined);
      assert.ok(owner.view.data.decorators);
      return owner.view.data.decorators;
    };
    const [rod] = await edit({
      action: "apply",
      definition: threadDefinition,
      faces: [{ body: body.id, face: outer.id }],
    });
    assert.equal(rod.settings.startTaper, Number(rod.settings.pitch));
    const [, hole] = await edit({
      action: "apply",
      definition: threadDefinition,
      faces: [{ body: body.id, face: inner.id }],
    });
    assert.equal(hole.settings.startTaper, 0);
    assert.equal(hole.settings.endTaper, 0);
    for (const cut of ["rod", "hole"])
      for (const preset of ["fdm-fine", "fdm-coarse", "metric"]) {
        await edit({ action: "settings", ids: [rod.id, hole.id], patch: { cut } });
        const instances = await edit({
          action: "settings",
          ids: [rod.id, hole.id],
          patch: { preset },
        });
        assert.equal(instances[0].settings.startTaper, Number(instances[0].settings.pitch));
        assert.equal(instances[0].settings.endTaper, Number(instances[0].settings.pitch));
        assert.equal(instances[1].settings.startTaper, 0);
        assert.equal(instances[1].settings.endTaper, 0);
      }
    await edit({ action: "settings", ids: [hole.id], patch: { startTaper: 2 } });
    assert.equal(owner.view.data.decorators?.[1].settings.startTaper, 2);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.decorators?.[1].settings.startTaper, 0);
    // Recalling the last built-in hole choice restores rod defaults on a new rod.
    const next = await roundBody(owner, [10]);
    const face = next.faces.find((f) => f.cylinder?.outward === 1);
    assert.ok(face);
    const instances = await edit({
      action: "apply",
      definition: threadDefinition,
      faces: [{ body: next.id, face: face.id }],
    });
    assert.equal(instances[2].settings.startTaper, Number(instances[2].settings.pitch));
  } finally {
    owner.close();
  }
});
