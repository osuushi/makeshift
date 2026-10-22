import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { openDocument } from "../native-documents.mjs";
import { project } from "../ui-blend-edit.mjs";
import { inspect, modalCompleted, settled } from "../ui-helpers.mjs";
import { chooseTool } from "../ui-tools.mjs";
import { instrumentDrag } from "./drag-instrumentation.mjs";

const distances = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 20, 18, 16, 14, 12, 10];
const cadenceMs = 80;

export async function measureDrag(browser, url, fixture, warm) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    await page.addInitScript(instrumentDrag);
    await page.goto(url);
    await settled(page);
    await openDocument(page, {
      name: "captured-two-arcs.makeshift",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
      ),
    });
    await settled(page);
    const pick = await project(page, [1, 0, 0]);
    await page.mouse.click(pick.x, pick.y);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
    const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
    if (warm) {
      await handle.click();
      await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
      await settled(page);
      assert.ok((await inspect(page)).preview?.bodies?.length);
      await page.keyboard.press("Escape");
      await modalCompleted(page);
    }
    const measurement = await drag(page, handle);
    const state = await inspect(page);
    assert.equal(
      state.document.bodies?.length ?? 0,
      0,
      "Drag release keeps the extrusion temporary",
    );
    assert.equal(state.preview?.bodies.length, 1);
    const body = state.preview.bodies[0];
    assert.ok(
      Math.abs(body.bounds[5] - body.bounds[2] - 10) < 1e-6,
      "Final 10 mm target was calculated",
    );
    assert.ok(Math.abs(body.volume - 8355.855205765696) < 1e-5);
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
    await modalCompleted(page);
    assert.equal((await inspect(page)).document.bodies.length, 1);
    await chooseTool(page, "undo", "undo");
    assert.equal(
      (await inspect(page)).document.bodies?.length ?? 0,
      0,
      "One Undo removes the extrusion",
    );
    await chooseTool(page, "redo", "redo");
    assert.equal((await inspect(page)).document.bodies.length, 1);
    return { warm, ...measurement, volume: body.volume, cadenceMs, distances };
  } finally {
    await context.close();
  }
}

async function drag(page, handle) {
  const box = await handle.boundingBox();
  assert.ok(box);
  const a = await project(page, [0, 0, 0]);
  const b = await project(page, [0, 0, 1]);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.evaluate(() => window.startKernelDragSampling());
  await page.mouse.down();
  const start = performance.now();
  for (const [index, distance] of distances.entries()) {
    const remaining = start + index * cadenceMs - performance.now();
    if (remaining > 0) await new Promise((accept) => setTimeout(accept, remaining));
    await page.mouse.move(x + (b.x - a.x) * distance, y + (b.y - a.y) * distance);
  }
  await page.mouse.up();
  const released = await page.evaluate(() => performance.now());
  await settled(page);
  const stats = await page.evaluate(() => {
    window.kernelDragStats.stopped = true;
    return { ...window.kernelDragStats, finished: performance.now() };
  });
  assert.ok(stats.input.length >= distances.length, "All pointer targets reached the page");
  assert.ok(
    stats.input.every((event) => event.trusted),
    "Input uses the browser's pointer route",
  );
  const during = stats.previews.filter((p) => p.height !== null && p.time <= released);
  return {
    dragMilliseconds: released - stats.started,
    finalSettleMilliseconds: stats.finished - released,
    visibleUpdatesDuringDrag: during.length,
    workerStarts: stats.events.filter((e) => e.event === "start").length,
    workerTerminations: stats.events.filter((e) => e.event === "terminate").length,
    requests: stats.events.filter((e) => e.event === "request").length,
    replies: stats.events.filter((e) => e.event === "reply").length,
    events: stats.events.map((e) => ({ ...e, time: e.time - stats.started })),
    previews: stats.previews.map((p) => ({ ...p, time: p.time - stats.started })),
    input: stats.input.map((event) => ({ ...event, time: event.time - stats.started })),
  };
}
