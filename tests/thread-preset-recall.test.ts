import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentPresets } from "../src/decorators/ephemeral-presets.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { DecoratorEdit } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/thread-preset-mixed.json", "utf8")) as {
  document: SketchDocument;
};

test("captured thread edits compute active presets without storing clutter or recalling expired choices", async () => {
  const owner = new DocumentOwner();
  const edit = async (edit: DecoratorEdit) => {
    assert.equal((await owner.call({ kind: "decorator", edit })).error, undefined);
    return owner.view.data;
  };
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const instances = original.decorators ?? [];
    assert.equal(instances.length, 4);
    const ids = instances.map((d) => d.id);
    let data = original;
    for (const clearance of [0.3, 0.35, 0.25]) {
      data = await edit({ action: "settings", ids, patch: { clearance } });
      assert.deepEqual(data.decoratorPresets, original.decoratorPresets);
      assert.ok(data.decorators?.every((d) => !d.presetId && d.settings.preset === "custom"));
      const computed = documentPresets(data).filter((p) => p.origin !== undefined);
      assert.ok(computed.length > 0 && computed.length <= instances.length);
      assert.ok(computed.every((p) => p.settings.clearance === clearance));
    }
    data = await edit({
      action: "preset",
      operation: "duplicate",
      ids: [ids[0]],
      name: "Explicit fit",
    });
    const saved = data.decoratorPresets;
    assert.equal(saved?.length, (original.decoratorPresets?.length ?? 0) + 1);
    data = await edit({ action: "settings", ids: [ids[0]], patch: { pitch: 2 } });
    assert.deepEqual(data.decoratorPresets, saved, "Edits leave named snapshots unchanged");
    data = await edit({ action: "remove", faces: instances.flatMap((d) => d.faces) });
    assert.equal(data.decorators?.length, 0);
    assert.deepEqual(documentPresets(data), saved, "Unused computed presets disappear");
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(data)) })).error,
      undefined,
    );
    data = await edit({
      action: "apply",
      definition: threadDefinition,
      faces: [...instances[0].faces],
    });
    assert.equal(data.decorators?.[0].settings.preset, "fdm-fine");
    assert.equal(data.decorators?.[0].settings.pitch, 1);
    assert.equal(data.decorators?.[0].settings.clearance, 0.3);
    assert.equal(data.decorators?.[0].presetId, undefined);
    assert.deepEqual(data.decoratorPresets, saved);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.decorators?.length, 0);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, data);
  } finally {
    owner.close();
  }
});
