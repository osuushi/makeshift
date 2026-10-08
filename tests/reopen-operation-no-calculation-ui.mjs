import assert from "node:assert/strict";
import { resolve } from "node:path";
import { electronSession } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { inspect } from "./ui-helpers.mjs";
import { reopen } from "./ui-reopen-first.mjs";
import { completed, ready } from "./ui-reopen-state.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await plate(page);
    const accepted = (await completed(page)).document;
    // The setup's edge selection schedules a debounced measurement, separate from Reopen.
    await page
      .getByRole("region", { name: "Measurements" })
      .getByRole("heading", { name: "Measurements", exact: true })
      .waitFor();
    const trace = await traceRequests(page);
    try {
      const restored = await reopen(page);
      assert.deepEqual(
        restored.preview,
        accepted,
        "exact accepted IDs, BRep and decorators are reused",
      );
      await standaloneOnly(page);
      await ready(page, "Accept extrusion");
      const requests = await trace.requests();
      assert.ok(requests.includes("reopen"));
      assert.deepEqual(
        requests.filter((kind) => !["reopen", "read", "read-history", "selection"].includes(kind)),
        [],
      );
      await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("12");
      await inspect(page);
      assert.ok(
        (await trace.requests()).includes("extrude"),
        "parameter edits invoke normal geometry calculation",
      );
      const changed = await inspect(page);
      assert.ok(Math.abs(changed.preview.bodies[0].volume - 4800) < 1e-5);
      console.log(
        `${name}: Cmd-R restores exact accepted preview without geometry requests; changed distance calculates normally`,
      );
    } finally {
      await trace.restore();
    }
  },
  { timeout: 120000 },
);

async function traceRequests(page) {
  const session = electronSession(page);
  if (session) {
    await session.app.evaluate(async (_, file) => {
      const require = process.getBuiltinModule("module").createRequire(file);
      const { DocumentSession } = require(file);
      const prototype = DocumentSession.prototype;
      const original = prototype.model;
      globalThis.reopenTrace = { requests: [], prototype, original };
      prototype.model = function (request) {
        globalThis.reopenTrace.requests.push(request.kind);
        return original.call(this, request);
      };
    }, resolve(".build/host/host/document-session.js"));
    return {
      requests: () => session.app.evaluate(() => globalThis.reopenTrace.requests),
      restore: () =>
        session.app.evaluate(() => {
          const trace = globalThis.reopenTrace;
          trace.prototype.model = trace.original;
          delete globalThis.reopenTrace;
        }),
    };
  }
  await page.evaluate(() => {
    const original = window.makeshiftModel;
    window.reopenRequests = [];
    window.restoreReopenTransport = () => {
      window.makeshiftModel = original;
    };
    window.makeshiftModel = async (request) => {
      window.reopenRequests.push(request.kind);
      if (original) return original(request);
      const response = await fetch("/sketch-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return response.json();
    };
  });
  return {
    requests: () => page.evaluate(() => window.reopenRequests),
    restore: () =>
      page.evaluate(() => {
        window.restoreReopenTransport();
        delete window.restoreReopenTransport;
        delete window.reopenRequests;
      }),
  };
}
