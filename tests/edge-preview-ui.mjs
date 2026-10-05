import assert from "node:assert/strict";
import { deliveryGate, holdReply, waitForDelivery } from "./preview-delivery.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function latestSize(page, selection, held, requests, flags, original) {
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await waitForDelivery(selection);
  const input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  for (const size of [1, 2, 3]) await input.fill(String(size));
  selection.release.resolve();
  const reply = await waitForDelivery(held.get(3));
  await input.fill("4");
  held.get(3).release.resolve();
  await waitForDelivery(held.get(4));
  const pending = await page.evaluate(() => window.makeshiftInspect());
  assert.equal(pending.preview.bodies[0].volume, reply.view.candidate.bodies[0].volume);
  assert.deepEqual(pending.document, original);
  assert.deepEqual(
    requests.map((request) => request.size),
    [3, 4],
  );
  assert.ok(requests.every((request) => request.edges.length === reply.view.edgeSelection.length));
  assert.ok(flags.length && flags.every((interrupt) => interrupt === false));
  await input.fill("");
  held.get(4).release.resolve();
  const invalid = await inspect(page);
  assert.equal(invalid.preview === null, true, "Late success must not restore invalid size input");
  assert.ok(await page.getByRole("button", { name: "Accept fillet", exact: true }).isDisabled());
  await input.fill("2");
  const recovery = await inspect(page);
  assert.ok(recovery.preview.bodies[0].volume < original.bodies[0].volume);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies[0].volume, recovery.preview.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}

async function cancelSize(page, held, cancelled, original) {
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await inspect(page);
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2.5");
  await waitForDelivery(held.get(2.5));
  await page.keyboard.press("Escape");
  await cancelled.promise;
  held.get(2.5).release.resolve();
  const state = await inspect(page);
  assert.equal(state.preview, null);
  assert.equal(state.interaction, null);
  assert.deepEqual(state.document, original);
}

async function modeAndClamp(page, cleanupChecks, original, timeline) {
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await inspect(page);
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await inspect(page);
  await page.getByRole("button", { name: "Switch to chamfer", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Chamfer distance", exact: true });
  assert.ok((await inspect(page)).preview.bodies[0].faces.every((face) => face.plane));
  await inspect(page);
  const count = cleanupChecks();
  await input.fill("100");
  await inspect(page);
  const maximum = Number(await input.inputValue());
  assert.ok(maximum > 2 && maximum < 100);
  await page.waitForTimeout(900);
  await inspect(page);
  assert.equal(
    cleanupChecks() - count,
    0,
    `Geometry does not schedule cleanup: ${JSON.stringify(timeline)}`,
  );
  await input.fill("100");
  await inspect(page);
  assert.equal(Number(await input.inputValue()), maximum);
  await input.fill("-5");
  assert.deepEqual((await inspect(page)).preview, original);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual((await inspect(page)).document, original);
}

async function failedSelection(page, original) {
  const invalidEdge = async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind !== "edge-finish-selection") return route.fallback();
    await route.continue({
      postData: JSON.stringify({
        ...request,
        operation: {
          ...request.operation,
          edges: [{ body: original.bodies[0].id, edge: "missing-edge" }],
        },
      }),
    });
  };
  await page.route("**/sketch-api", invalidEdge);
  try {
    await page.keyboard.press("f");
    await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.makeshiftInspect();
      return !state.busy && state.interaction === null;
    });
    const state = await inspect(page);
    assert.deepEqual(state.document, original);
    assert.equal(state.preview, null, "Failed expansion releases its query and interaction");
  } finally {
    await page.unroute("**/sketch-api", invalidEdge);
  }
}

async function edgeScheduling(page) {
  await plate(page);
  const original = (await inspect(page)).document;
  const selection = deliveryGate(),
    held = new Map([3, 4, 2.5].map((size) => [size, deliveryGate()])),
    cancelled = Promise.withResolvers(),
    requests = [],
    flags = [],
    timeline = [];
  let cleanupChecks = 0;
  await page.route("**/sketch-api", async (route) => {
    const request = route.request().postDataJSON();
    if (["check-cleanup", "finish-edges", "edge-finish-selection"].includes(request.kind))
      timeline.push({
        kind: request.kind,
        size: request.operation?.size,
        mode: request.operation?.mode,
      });
    if (request.kind === "cancel-preview") cancelled.resolve();
    if (request.kind === "check-cleanup") cleanupChecks++;
    if (request.kind === "supersede-preview") flags.push(request.interrupt);
    if (request.kind === "edge-finish-selection" && !selection.assigned)
      return holdReply(route, selection);
    if (request.kind !== "finish-edges") return route.continue();
    requests.push(request.operation);
    const delay = held.get(request.operation.size);
    return delay && !delay.assigned ? holdReply(route, delay) : route.continue();
  });
  try {
    await latestSize(page, selection, held, requests, flags, original);
    await cancelSize(page, held, cancelled, original);
    await modeAndClamp(page, () => cleanupChecks, original, timeline);
    await failedSelection(page, original);
  } finally {
    const gates = [selection, ...held.values()];
    for (const delay of gates) delay.release.resolve();
    await Promise.all(
      gates.filter((delay) => delay.assigned).map((delay) => delay.delivered.promise),
    );
    await page.unroute("**/sketch-api");
  }
}

await withUiRuntimes(
  async (page, name) => {
    await edgeScheduling(page);
    console.log(
      `${name}: real edge expansion, size coalescing, invalidation, cancellation, mode/limits and no completion-cleanup probes pass`,
    );
  },
  { allowed: ["chromium", "webkit"], timeout: 30000 },
);
