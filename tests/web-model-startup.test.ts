import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Extrusion } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { installWebModel } from "../src/web/start.js";

test("web startup and compact extrusion replies preserve the accepted document together", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const window = new EventTarget() as EventTarget & Window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  t.after(() => {
    window.dispatchEvent(new Event("pagehide"));
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  installWebModel();
  const call = window.makeshiftModel;
  assert.ok(call);
  const initial = await call({ kind: "read" });
  assert.equal(initial.error, undefined);
  assert.deepEqual((await call({ kind: "read-history" })).history, []);
  const fixture = JSON.parse(readFileSync("tests/fixtures/extrude-detailed-body.json", "utf8")) as {
    document: SketchDocument;
    extrusion: Extrusion;
  };
  const opened = await call({ kind: "open", document: fixture.document });
  assert.equal(opened.error, undefined);
  const extrusion = { ...fixture.extrusion, mode: "new" as const };
  const visual = await call({
    kind: "extrude",
    extrusion,
    presentation: "visual",
    omitUnchangedData: true,
  });
  assert.equal(visual.error, undefined);
  assert.equal(visual.view.data, undefined);
  assert.ok(visual.view.visualPreview?.bodies.length);
  assert.deepEqual((await call({ kind: "read" })).view.data, opened.view.data);
  const completed = await call({ kind: "extrude", extrusion });
  assert.equal(completed.error, undefined);
  assert.ok(completed.view.candidate);
  assert.equal((await call({ kind: "accept" })).error, undefined);
  assert.deepEqual((await call({ kind: "undo" })).view.data, opened.view.data);
});
