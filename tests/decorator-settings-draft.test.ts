import assert from "node:assert/strict";
import test from "node:test";
import { editDecorators } from "../src/decorators/edits.js";
import { DecoratorSettingsDraft } from "../src/decorators/settings-draft.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { DecoratorEdit } from "../src/decorators/types.js";
import { ActiveInteraction } from "../src/sketch/active-interaction.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";

function threadedDocument() {
  // Analytic validation descriptor only; actual UI acceptance creates real BReps.
  const document: SketchDocument = {
    units: "mm",
    sketches: [],
    bodies: [
      {
        id: "body",
        brep: "descriptor-only",
        volume: Math.PI * 64 * 10,
        center: [0, 0, 5],
        bounds: [-8, -8, 0, 8, 8, 10],
        edges: [],
        faces: [
          {
            id: "side",
            edges: [],
            signature: [],
            vertices: [8, 0, 0, 8, 0, 10],
            plane: null,
            cylinder: { radius: 8, origin: [0, 0, 0], axis: [0, 0, 1], outward: 1 },
          },
        ],
      },
    ],
  };
  const accepted = editDecorators(document, {
    action: "apply",
    definition: threadDefinition,
    faces: [{ body: "body", face: "side" }],
  });
  return accepted;
}
function context(custom = false) {
  let accepted = threadedDocument();
  const id = accepted.decorators?.[0].id;
  assert.ok(id);
  if (custom)
    accepted = {
      ...accepted,
      decorators: accepted.decorators?.map((d) => ({ ...d, definition: "example.custom" })),
    };
  let requests = 0,
    ended = 0,
    accept = true;
  const interactions = new ActiveInteraction(() => {});
  const store = {
    get data() {
      return accepted;
    },
    async request({ edit }: { edit: DecoratorEdit }) {
      requests++;
      if (!accept) return false;
      accepted = editDecorators(accepted, edit);
      return true;
    },
    draftDecorator: async (_edit: DecoratorEdit) => accepted.decorators,
  };
  const editor = { store, interactions, message: "", refresh() {} };
  const draft = new DecoratorSettingsDraft(editor as unknown as SketchEditor, () => {
    ended++;
  });
  return {
    editor,
    store,
    interactions,
    draft,
    id,
    get requests() {
      return requests;
    },
    get ended() {
      return ended;
    },
    reject() {
      accept = false;
    },
    allow() {
      accept = true;
    },
  };
}

test("latest invalid built-in input clears older preview and remains owned on blur/finish", async () => {
  const c = context();
  const original = structuredClone(c.store.data);
  const edit = (clearance: number) => ({
    action: "settings" as const,
    ids: [c.id],
    patch: { clearance },
  });
  c.draft.preview(edit(0.4));
  assert.equal(c.interactions.candidate?.decorators?.[0].settings.clearance, 0.4);
  c.draft.preview(edit(-1));
  assert.equal(c.interactions.candidate, null);
  await c.draft.blur();
  assert.equal(await c.draft.commit(), false);
  assert.equal(c.draft.active, true);
  assert.equal(c.interactions.current?.phase, "editing");
  assert.match(c.editor.message, /Invalid thread clearance/);
  assert.equal(c.requests, 0);
  assert.deepEqual(c.store.data, original);
  c.draft.preview(edit(0.3));
  assert.equal(await c.draft.commit(), true);
  assert.equal(c.requests, 1);
  assert.equal(c.interactions.current, null);
  assert.equal(c.store.data.decorators?.[0].settings.clearance, 0.3);
});

test("failed ordinary acceptance retains draft and can be corrected/retried", async () => {
  const c = context();
  const original = structuredClone(c.store.data);
  c.draft.preview({ action: "settings", ids: [c.id], patch: { clearance: 0.4 } });
  c.reject();
  assert.equal(await c.draft.commit(), false);
  assert.equal(c.draft.active, true);
  assert.equal(c.interactions.current?.phase, "editing");
  assert.equal(c.interactions.candidate?.decorators?.[0].settings.clearance, 0.4);
  assert.deepEqual(c.store.data, original);
  assert.match(c.editor.message, /Could not apply/);
  c.allow();
  assert.equal(await c.draft.commit(), true);
  assert.equal(c.interactions.current, null);
  assert.equal(c.requests, 2);
});

test("blur and switch share the same pending ordinary acceptance", async () => {
  const c = context();
  c.draft.preview({ action: "settings", ids: [c.id], patch: { clearance: 0.4 } });
  const first = c.draft.commit();
  const second = c.draft.commit();
  assert.equal(first, second);
  await c.draft.blur();
  assert.equal(await first, true);
  assert.equal(c.requests, 1);
  assert.equal(c.ended, 1);
});

test("cancelled custom validation cannot replace the next owner's preview", async () => {
  const c = context(true);
  let resolve!: (value: typeof c.store.data.decorators) => void;
  c.store.draftDecorator = () =>
    new Promise((done) => {
      resolve = done;
    });
  c.draft.preview({ action: "settings", ids: [c.id], patch: { clearance: 0.4 } });
  c.draft.cancel();
  const next = c.interactions.acquire("face-offset", () => {});
  next?.show(c.store.data);
  resolve(c.store.data.decorators);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(c.interactions.current, next);
  assert.equal(c.interactions.candidate, c.store.data);
  assert.equal(c.requests, 0);
});
