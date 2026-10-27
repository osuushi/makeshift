import assert from "node:assert/strict";
import test from "node:test";
import { defaultSketchGrid } from "../src/sketch/grid-settings.js";
import { emptySelection, type SelectionChanges } from "../src/sketch/history-selection.js";
import type { ModelReply, ModelRequest } from "../src/sketch/model-api.js";
import { ModelClient } from "../src/sketch/model-client.js";
import type { SelectionHistory } from "../src/sketch/selection-history.js";

// Verify the client/owner boundary: an empty write can still carry a newly
// settled selection baseline, and history navigation invalidates the last send.
test("skip identical selection writes but deliver baseline changes, steps and history restoration", async (t) => {
  const requests: ModelRequest[] = [];
  const changes: SelectionChanges = { baseline: emptySelection(), steps: [] };
  const response: ModelReply = {
    view: {
      data: { units: "mm", sketches: [], sketchGrid: defaultSketchGrid },
      candidate: null,
      canUndo: false,
      canRedo: false,
      solveCount: 0,
      solveMs: 0,
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      makeshiftModel: async (request: ModelRequest) => {
        requests.push(structuredClone(request));
        return structuredClone(response);
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const client = new ModelClient(
    () => {},
    (message) => {
      if (message) assert.fail(message);
    },
  );
  client.selectionHistory = {
    take: () => structuredClone(changes),
    accepted: () => {},
  } as unknown as SelectionHistory;
  await client.request({ kind: "discard" });
  await client.request({ kind: "discard" });
  await client.request({ kind: "discard" });
  assert.equal(requests.filter((r) => r.kind === "selection").length, 1);
  changes.baseline.modeling = [{ kind: "body", body: "new-result" }];
  await client.request({ kind: "discard" });
  assert.equal(requests.filter((r) => r.kind === "selection").length, 2);
  changes.steps = [{ expireNavigation: true }];
  await client.request({ kind: "discard" });
  await client.request({ kind: "discard" });
  assert.equal(requests.filter((r) => r.kind === "selection").length, 4, "Never drop intent steps");
  changes.steps = [];
  await client.request({ kind: "undo" });
  await client.request({ kind: "discard" });
  assert.equal(requests.filter((r) => r.kind === "selection").length, 6);
  response.documentChanged = true;
  await client.request({ kind: "accept" });
  response.documentChanged = false;
  await client.request({ kind: "discard" });
  assert.equal(requests.filter((r) => r.kind === "selection").length, 7);
});
