import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cylinderFrame } from "../src/decorators/cylinder.js";
import { threadDefaults } from "../src/decorators/thread-settings.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { roundBody } from "./decorator-domain-fixtures.js";

const captured: SketchDocument = JSON.parse(
  readFileSync("tests/fixtures/microscopic-finishes.json", "utf8"),
);

test("repairing one archived body preserves another body's saved decorators exactly", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner);
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: "freac.threads",
            faces: [{ body: body.id, face: face.id }],
          },
        })
      ).error,
      undefined,
    );
    const source = readArchive(
      documentArchive({
        ...owner.view.data,
        bodies: [...(owner.view.data.bodies ?? []), ...(captured.bodies ?? [])],
      }),
    );
    assert.equal((await owner.call({ kind: "open", document: source })).error, undefined);
    assert.deepEqual(owner.view.data.decorators, source.decorators);
    const repaired = owner.view.data.bodies?.find((b) => b.id === captured.bodies?.[0].id);
    assert.equal(repaired?.faces.length, 18);
  } finally {
    owner.close();
  }
});

test("archived repaired bodies hydrate surviving supports before continuing their attachments", async () => {
  const owner = new DocumentOwner();
  try {
    const body = captured.bodies?.[0];
    const retained = body?.faces.find((f) => f.blend?.radius === 12);
    const removed = body?.faces.find((f) => f.blend && f.blend.radius < 0.001);
    assert.ok(body && retained?.cylinder && removed);
    const source = readArchive(
      documentArchive({
        ...captured,
        decorators: [
          {
            id: "retained-thread",
            definition: "freac.threads",
            version: 1,
            faces: [{ body: body.id, face: retained.id }],
            frame: cylinderFrame(retained.cylinder),
            settings: { ...threadDefaults(24), cut: "hole" },
          },
        ],
        taggedGroups: [retained, removed].map((face, i) => ({
          id: `saved-group-${i}`,
          name: `Saved ${i}`,
          body: body.id,
          members: [{ kind: "face" as const, id: face.id }],
          problems: [],
        })),
        guidePoints: [retained, removed].map((face, i) => ({
          id: `saved-guide-${i}`,
          name: `Saved ${i}`,
          hidden: false,
          anchor: {
            kind: "body-faces" as const,
            body: body.id,
            faces: [face.id],
            feature: "bounds-center" as const,
          },
        })),
      }),
    );
    // Native files deliberately omit cylinder/mesh derivatives.
    assert.equal(source.bodies?.[0].faces.find((f) => f.id === retained.id)?.cylinder, undefined);
    assert.equal((await owner.call({ kind: "open", document: source })).error, undefined);
    const reopened = owner.view.data;
    assert.equal(reopened.bodies?.[0].faces.length, 18);
    assert.equal(reopened.decorators?.[0].problem, undefined);
    assert.deepEqual(reopened.decorators?.[0].faces, source.decorators?.[0].faces);
    assert.deepEqual(reopened.taggedGroups?.[0], source.taggedGroups?.[0]);
    assert.deepEqual(reopened.taggedGroups?.[1].members, []);
    assert.deepEqual(reopened.taggedGroups?.[1].problems, ["lost"]);
    assert.deepEqual(reopened.guidePoints, source.guidePoints?.slice(0, 1));
  } finally {
    owner.close();
  }
});
