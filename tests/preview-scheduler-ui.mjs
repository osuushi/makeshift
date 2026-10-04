import assert from "node:assert/strict";
import { deliveryGate, holdReply, waitForDelivery } from "./preview-delivery.mjs";
import { extrusionCancelRoute, extrusionPreviewRoute } from "./ui-extrude-preview.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function latestOffset(page, input, held, requests, flags, original, area) {
  await input.fill("1");
  await waitForDelivery(held.get(1));
  held.get(1).release.resolve();
  close((await inspect(page)).preview.bodies[0].volume, area * 6);
  await input.fill("2");
  await waitForDelivery(held.get(2));
  await input.fill("3");
  await input.fill("4");
  held.get(2).release.resolve();
  await waitForDelivery(held.get(4));
  const pending = await page.evaluate(() => window.makeshiftInspect());
  close(pending.preview.bodies[0].volume, area * 7, "superseded verified image remains visible");
  assert.deepEqual(pending.document, original);
  assert.deepEqual(requests, [1, 2, 4], "only the latest waiting target reaches the kernel");
  assert.ok(
    flags.length && flags.every((interrupt) => interrupt === false),
    "Offset keeps its noninterrupting supersede policy",
  );
  await input.fill("");
  held.get(4).release.resolve();
  assert.equal((await inspect(page)).preview, null, "late success cannot restore invalid input");
  assert.equal(
    await page.getByRole("button", { name: "Accept face offset", exact: true }).isDisabled(),
    true,
  );
  await input.fill("1.5");
  close((await inspect(page)).preview.bodies[0].volume, area * 6.5);
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  close((await inspect(page)).document.bodies[0].volume, area * 6.5);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
async function cancelOffset(page, held, cancelled, original) {
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await (await relativeOffsetInput(page)).fill("2.5");
  await waitForDelivery(held.get(2.5));
  await page.keyboard.press("Escape");
  await cancelled.promise;
  held.get(2.5).release.resolve();
  const state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
}
async function clampedOffset(page, cleanupChecks, original) {
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const clamped = await relativeOffsetInput(page);
  const count = cleanupChecks();
  await clamped.fill("-10");
  await page.waitForFunction(
    () =>
      !window.makeshiftInspect().busy &&
      !document.querySelector('[aria-label="Accept face offset"]')?.disabled,
  );
  const state = await inspect(page);
  assert.ok(state.preview.bodies[0].volume > 0);
  assert.ok(
    Number(await clamped.inputValue()) > -5,
    "last verified distance is fed back through the real input",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Offset faces", exact: true })
      .getAttribute("data-geometry-invalid"),
    "true",
  );
  await page.waitForTimeout(900);
  await inspect(page);
  assert.equal(cleanupChecks() - count, 0, "Ordinary geometry does not schedule cleanup");
  assert.equal(await page.locator(".commit-cleanup").count(), 0);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
async function offsetScheduling(page) {
  const original = await makePlate(page);
  const area = original.bodies[0].volume / 5;
  await worldClick(page, [6, 6, 5]);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = await relativeOffsetInput(page);
  const held = new Map([1, 2, 4, 2.5].map((distance) => [distance, deliveryGate()]));
  const requests = [],
    flags = [];
  let cleanupChecks = 0;
  const cancelled = Promise.withResolvers();
  await page.route("**/sketch-api", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind === "cancel-preview") cancelled.resolve();
    if (request.kind === "check-cleanup") cleanupChecks++;
    if (request.kind === "supersede-preview") flags.push(request.interrupt);
    if (request.kind !== "offset-faces") return route.continue();
    requests.push(request.operation.distance);
    const delay = held.get(request.operation.distance);
    if (!delay || delay.assigned) return route.continue();
    await holdReply(route, delay);
  });
  try {
    await latestOffset(page, input, held, requests, flags, original, area);
    await cancelOffset(page, held, cancelled, original);
    await clampedOffset(page, () => cleanupChecks, original);
  } finally {
    for (const delay of held.values()) delay.release.resolve();
    await Promise.all(
      [...held.values()].filter((delay) => delay.assigned).map((delay) => delay.delivered.promise),
    );
    await page.unroute("**/sketch-api");
  }
}

await withUiRuntimes(
  async (page, name) => {
    await extrusionPreviewRoute(page);
    await extrusionCancelRoute(page);
    await offsetScheduling(page);
    console.log(
      `${name}: real Extrude/Offset delayed delivery, coalescing, invalidation, cancellation, clamp feedback and no completion-cleanup probes pass`,
    );
  },
  { allowed: ["chromium", "webkit"], timeout: 30000 },
);
