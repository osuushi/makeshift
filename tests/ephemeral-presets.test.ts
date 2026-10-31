import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentPresets } from "../src/decorators/ephemeral-presets.js";
import { lastDecoratorChoice, localPreset } from "../src/decorators/presets.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { DecoratorEdit } from "../src/decorators/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { roundBody } from "./decorator-domain-fixtures.js";

async function setup() {
  const owner = new DocumentOwner();
  const call = async (request: ModelRequest) => {
    assert.equal((await owner.call(request)).error, undefined);
    return owner.view.data;
  };
  const edit = (edit: DecoratorEdit) => call({ kind: "decorator", edit });
  const body = await roundBody(owner, [8, 5]);
  const faces = body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id }));
  await edit({ action: "apply", definition: threadDefinition, faces: [faces[0]] });
  const instance = owner.view.data.decorators?.[0];
  assert.ok(instance);
  await edit({ action: "settings", ids: [instance.id], patch: { clearance: 0.32 } });
  return { owner, call, edit, body, faces, id: instance.id };
}

test("computed presets follow face-tag names, body names, live membership and archive history", async () => {
  const { owner, call, edit, body, faces } = await setup();
  try {
    const initial = documentPresets(owner.view.data)[0];
    assert.equal(initial.name, "FDM fine [Body 1]");
    await call({ kind: "rename-entity", id: body.id, name: "Coupler" });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Coupler]");
    await call({
      kind: "tagged-group",
      edit: {
        action: "create",
        body: body.id,
        name: "Mating threads",
        members: [{ kind: "face", id: faces[0].face }],
      },
    });
    const tag = owner.view.data.taggedGroups?.[0];
    assert.ok(tag);
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Mating threads]");
    await call({ kind: "tagged-group", edit: { action: "update", id: tag.id, name: "Socket" } });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Socket]");
    assert.equal(
      documentPresets(owner.view.data)[0].id,
      initial.id,
      "Names do not change preset identity",
    );
    const saved = documentArchive(owner.view.data);
    await call({ kind: "open", document: readArchive(saved) });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Socket]");
    await call({ kind: "tagged-group", edit: { action: "remove", id: tag.id } });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Coupler]");
    const before = owner.view.data;
    await call({ kind: "delete-entities", bodyIds: [body.id], sketchIds: [] });
    assert.equal(documentPresets(owner.view.data).length, 0);
    assert.equal(lastDecoratorChoice(owner.view.data, threadDefinition), undefined);
    await call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await edit({ action: "remove", faces });
    assert.equal(documentPresets(owner.view.data).length, 0);
    await edit({ action: "apply", definition: threadDefinition, faces: [faces[0]] });
    assert.equal(owner.view.data.decorators?.[0].settings.clearance, 0.3);
  } finally {
    owner.close();
  }
});

test("new instances recall ephemeral settings; edits fork and rejoin without changing peers", async () => {
  const { owner, call, edit, faces, id } = await setup();
  try {
    const initial = documentPresets(owner.view.data)[0];
    await edit({ action: "apply", definition: threadDefinition, faces: [faces[1]] });
    const mate = owner.view.data.decorators?.[1];
    assert.ok(mate);
    assert.deepEqual(
      mate.settings,
      initial.settings,
      "Explicit ephemeral tapers survive rod/hole recall",
    );
    assert.equal(localPreset(owner.view.data, mate)?.id, initial.id);
    await edit({ action: "settings", ids: [id], patch: { clearance: 0.4 } });
    assert.equal(documentPresets(owner.view.data).length, 2);
    assert.equal(owner.view.data.decorators?.[1].settings.clearance, 0.32);
    await edit({ action: "settings", ids: [id], patch: { clearance: 0.32 } });
    assert.equal(
      documentPresets(owner.view.data).length,
      1,
      "Matching variants rejoin their original family",
    );
    const before = owner.view.data;
    await edit({ action: "preset", operation: "rename", ids: [id], name: "Reusable coupling" });
    const named = documentPresets(owner.view.data)[0];
    assert.equal(named.name, "Reusable coupling");
    assert.equal(named.origin, undefined);
    assert.ok(owner.view.data.decorators?.every((d) => d.presetId === named.id && !d.presetOrigin));
    await call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await call({ kind: "redo" });
    await edit({ action: "remove", faces });
    assert.deepEqual(documentPresets(owner.view.data), [named]);
    await call({ kind: "open", document: readArchive(documentArchive(owner.view.data)) });
    await edit({ action: "apply", definition: threadDefinition, faces: [faces[0]] });
    assert.deepEqual(owner.view.data.decorators?.[0].settings, named.settings);
    assert.equal(owner.view.data.decorators?.[0].presetId, named.id);
    await edit({ action: "apply", definition: threadDefinition, faces: [faces[1]] });
    const fresh = owner.view.data.decorators?.[1];
    assert.ok(fresh);
    await edit({ action: "settings", ids: [fresh.id], patch: { preset: "fdm-fine" } });
    await edit({ action: "settings", ids: [fresh.id], patch: named.settings });
    const independent = documentPresets(owner.view.data).find((p) => p.origin !== undefined);
    assert.ok(independent);
    assert.notEqual(
      independent.id,
      named.id,
      "A new computed variant cannot alias a promoted snapshot",
    );
    assert.equal(documentPresets(owner.view.data).length, 2);
  } finally {
    owner.close();
  }
});

test("computed names use the modal face tag, otherwise the modal supporting body", async () => {
  const { owner, call, edit, body, faces } = await setup();
  try {
    await edit({ action: "apply", definition: threadDefinition, faces: [faces[1]] });
    const other = await roundBody(owner, [12]);
    const face = other.faces.find((f) => f.cylinder);
    assert.ok(face);
    await edit({
      action: "apply",
      definition: threadDefinition,
      faces: [{ body: other.id, face: face.id }],
    });
    await call({ kind: "rename-entity", id: body.id, name: "Primary" });
    await call({ kind: "rename-entity", id: other.id, name: "Secondary" });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Primary]");
    await call({
      kind: "tagged-group",
      edit: {
        action: "create",
        body: body.id,
        name: "Edges only",
        members: body.edges.map((edge) => ({ kind: "edge", id: edge.id })),
      },
    });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Primary]");
    await call({
      kind: "tagged-group",
      edit: {
        action: "create",
        body: other.id,
        name: "Single",
        members: [{ kind: "face", id: face.id }],
      },
    });
    assert.equal(
      documentPresets(owner.view.data)[0].name,
      "FDM fine [Single]",
      "Any face tag takes priority over body names",
    );
    await call({
      kind: "tagged-group",
      edit: {
        action: "create",
        body: body.id,
        name: "Pair",
        members: faces.map((f) => ({ kind: "face", id: f.face })),
      },
    });
    assert.equal(documentPresets(owner.view.data).length, 1);
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Pair]");
    await call({ kind: "delete-entities", bodyIds: [body.id], sketchIds: [] });
    assert.equal(documentPresets(owner.view.data)[0].name, "FDM fine [Single]");
  } finally {
    owner.close();
  }
});
