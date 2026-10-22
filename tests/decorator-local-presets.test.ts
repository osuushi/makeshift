import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { validatePresets } from "../src/decorators/presets.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { DecoratorEdit } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";

test("local presets preserve mating settings, last choice, rename, Undo and archives", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = [];
    for (const radius of [8, 10]) {
      const body = await lift(owner, {
        ...emptySketch(planes.XY),
        curves: [
          {
            id: "circle",
            kind: "circle",
            radius,
            center: { x: 0, y: 0 },
            construction: false,
          },
        ],
      });
      const face = body.faces.find((f) => f.cylinder);
      assert.ok(face);
      faces.push({ body: body.id, face: face.id });
    }
    const edit = async (edit: DecoratorEdit) => {
      const result = await owner.call({ kind: "decorator", edit });
      assert.equal(result.error, undefined);
      return owner.view.data;
    };
    let data = await edit({ action: "apply", definition: threadDefinition, faces: [faces[0]] });
    const id = data.decorators?.[0].id;
    assert.ok(id);
    data = await edit({ action: "settings", ids: [id], patch: { preset: "fdm-coarse" } });
    assert.equal(data.decorators?.[0].settings.clearance, 0.25);
    assert.equal(data.decoratorPresets?.length, 0);
    data = await edit({ action: "settings", ids: [id], patch: { pitch: 2.3, clearance: 0.32 } });
    const preset = data.decoratorPresets?.[0];
    assert.ok(preset);
    assert.equal(preset.settings.pitch, 2.3);
    assert.equal(data.decorators?.[0].presetId, preset.id);
    data = await edit({ action: "preset", operation: "rename", ids: [id], name: "Mating pair" });
    assert.equal(data.decoratorPresets?.[0].name, "Mating pair");
    const archive = documentArchive(data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    data = await edit({ action: "apply", definition: threadDefinition, faces: [faces[1]] });
    const mate = data.decorators?.[1];
    assert.ok(mate);
    assert.deepEqual(mate.settings, preset.settings);
    assert.equal(mate.presetId, preset.id);
    data = await edit({ action: "settings", ids: [id], patch: { clearance: 0.4 } });
    assert.equal(data.decorators?.[1].settings.clearance, 0.32);
    assert.equal(data.decoratorPresets?.[0].settings.clearance, 0.32);
    assert.equal(data.decoratorPresets?.length, 2);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.decoratorPresets?.length, 1);
    data = await edit({ action: "preset", operation: "duplicate", ids: [id] });
    const duplicate = data.decoratorPresets?.[1];
    assert.ok(duplicate);
    assert.notEqual(duplicate.id, preset.id);
    assert.deepEqual(duplicate.settings, preset.settings);
    data = await edit({ action: "settings", ids: [id], patch: { hand: "left" } });
    assert.equal(data.decoratorPresets?.length, 2, "unshared local copy updates in place");
    data = await edit({
      action: "preset",
      operation: "select",
      ids: [mate.id],
      presetId: duplicate.id,
    });
    assert.deepEqual(data.decorators?.[1].settings, data.decorators?.[0].settings);
    const before = documentArchive(data);
    const failure = await owner.call({
      kind: "decorator",
      edit: {
        action: "settings",
        ids: [id],
        patch: { pitch: -1 },
      },
    });
    assert.ok(failure.error);
    assert.equal(documentArchive(owner.view.data), before, "invalid settings do not save a preset");
    assert.deepEqual(readArchive(before).decoratorPresets, data.decoratorPresets);
  } finally {
    owner.close();
  }
});

test("malformed saved presets and last choices are rejected", () => {
  assert.throws(
    () =>
      validatePresets({
        units: "mm",
        sketches: [],
        lastDecoratorChoices: { thread: { settings: { pitch: NaN } } },
      }),
    /preset settings/,
  );
});

test("gear presets copy all settings and remember their own last choice", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "circle",
          kind: "circle",
          radius: 10,
          center: { x: 0, y: 0 },
          construction: false,
        },
      ],
    });
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face);
    const faces = [{ body: body.id, face: face.id }];
    const edit = async (edit: DecoratorEdit) => {
      assert.equal((await owner.call({ kind: "decorator", edit })).error, undefined);
      return owner.view.data;
    };
    let data = await edit({ action: "apply", definition: gearDefinition, faces });
    const id = data.decorators?.[0].id;
    assert.ok(id);
    data = await edit({ action: "settings", ids: [id], patch: { pressure: 25, teeth: 32 } });
    const preset = data.decoratorPresets?.[0];
    assert.ok(preset);
    await edit({ action: "remove", faces });
    data = await edit({ action: "apply", definition: gearDefinition, faces });
    assert.deepEqual(data.decorators?.[0].settings, preset.settings);
    assert.equal(data.decorators?.[0].presetId, preset.id);
    await edit({ action: "remove", faces });
    data = await edit({ action: "apply", definition: threadDefinition, faces });
    assert.equal(data.decorators?.[0].settings.preset, "fdm-fine");
    assert.equal(data.decorators?.[0].presetId, undefined);
  } finally {
    owner.close();
  }
});
