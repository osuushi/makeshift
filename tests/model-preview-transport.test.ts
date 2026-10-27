import assert from "node:assert/strict";
import test from "node:test";
import type { ModelReply } from "../src/sketch/model-api.js";
import { call } from "../src/sketch/model-transport.js";
import { type ModelWireRequest, modelWireReply } from "../src/sketch/model-wire.js";

const reply: ModelReply = {
  documentChanged: false,
  view: {
    data: { units: "mm", sketches: [] },
    candidate: null,
    visualPreview: { bodies: [], replaces: [] },
    canUndo: true,
    canRedo: false,
    solveCount: 0,
    solveMs: 0,
  },
};
const request = {
  kind: "extrude",
  extrusion: { sources: [{ sketch: "s", profile: "p" }], distance: 12, mode: "new" },
  presentation: "visual",
  omitUnchangedData: true,
} satisfies ModelWireRequest;

test("only successful visual previews may omit unchanged accepted geometry on the wire", () => {
  const compact = modelWireReply(request, reply);
  assert.equal(compact.view.data, undefined);
  assert.equal(compact.view.visualPreview, reply.view.visualPreview);
  assert.equal(reply.view.data.units, "mm", "The owner's view stays complete");
  for (const full of [
    { ...reply, error: "Failed" },
    { ...reply, documentChanged: true },
    { ...reply, documentChanged: undefined },
    { ...reply, view: { ...reply.view, candidate: reply.view.data } },
    { ...reply, view: { ...reply.view, visualPreview: undefined } },
  ])
    assert.equal(modelWireReply(request, full), full);
  assert.equal(modelWireReply({ ...request, omitUnchangedData: undefined }, reply), reply);
  assert.equal(modelWireReply({ ...request, presentation: undefined }, reply), reply);
  assert.equal(modelWireReply({ kind: "read", omitUnchangedData: true }, reply), reply);
});

test("visual transport reuses the caller's accepted snapshot and full reads replace it", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      makeshiftModel: async (input: ModelWireRequest) =>
        structuredClone(modelWireReply(input, reply)),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const accepted = structuredClone(reply.view.data);
  const result = await call(request, accepted);
  assert.equal(result.view.data, accepted);
  assert.deepEqual(result.view.visualPreview, reply.view.visualPreview);
  const full = await call({ kind: "read" }, accepted);
  assert.notEqual(full.view.data, accepted);
  assert.deepEqual(full.view.data, reply.view.data);
  const { omitUnchangedData: _omit, ...plain } = request;
  const ordinary = await call(plain);
  assert.deepEqual(ordinary.view.data, accepted);
});
