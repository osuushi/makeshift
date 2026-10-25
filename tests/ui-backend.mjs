import assert from "node:assert/strict";
import { at, click, drag, inspect, pointEquals, reset, settled } from "./ui-helpers.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

export async function backendPersistence(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const before = await inspect(page);
  assert.ok(before.solver.count > 0, "UI creation must use the native solver");
  await page.reload();
  assert.deepEqual(
    (await inspect(page)).document,
    before.document,
    "Renderer reload preserves the backend document",
  );
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, before.document);
  console.log(
    `${name}: backend document and Undo survive renderer reload; last solve ${before.solver.milliseconds.toFixed(2)} ms`,
  );
}

export async function delayedBackend(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("v");
  await click(page, 20, 5);
  const original = (await inspect(page)).document;
  let release;
  let reached;
  let previews = 0;
  const gated = new Promise((resolve) => {
    reached = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/sketch-api", async (route) => {
    if (route.request().postDataJSON().kind !== "preview") return route.continue();
    previews++;
    const response = await route.fetch(); // Actual backend and PlaneGCS; only delivery is delayed.
    reached();
    await gate;
    await route.fulfill({ response });
  });
  try {
    const start = await at(page, 20, 5),
      middle = await at(page, 25, 5),
      end = await at(page, 32, 5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y);
    await gated;
    assert.equal(
      Number(await page.getByRole("textbox", { name: "Width", exact: true }).inputValue()),
      25,
    );
    await page.mouse.move(end.x, end.y, { steps: 8 });
    assert.equal(
      Number(await page.getByRole("textbox", { name: "Width", exact: true }).inputValue()),
      32,
      "Requested dimensions follow the pointer while the first real solve is still held",
    );
    await page.mouse.up();
    await page.mouse.move(end.x + 100, end.y + 100);
    assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), original);
    await page.getByRole("status").filter({ hasText: "Solving sketch" }).waitFor();
    assert.equal(previews, 1, "Intermediate pointer updates cannot queue native requests");
    release();
    await settled(page);
    pointEquals((await inspect(page)).document.sketches[0].curves[0].b, [32, 0]);
    assert.equal(previews, 2, "Only the final pending target follows the first calculation");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original, "Whole gesture has one Undo entry");
  } finally {
    release();
    await page.unroute("**/sketch-api");
  }
  await cancelledReply(page, original);
  await cancelledReply(page, original, true);
  console.log(
    `${name}: delayed actual solves coalesce, release waits, Escape discards late results`,
  );
}

async function cancelledReply(page, original, released = false) {
  await click(page, 20, 5);
  let release, reached;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const arrived = new Promise((resolve) => {
    reached = resolve;
  });
  await page.route("**/sketch-api", async (route) => {
    if (route.request().postDataJSON().kind !== "preview") return route.continue();
    const response = await route.fetch();
    reached();
    await gate;
    await route.fulfill({ response });
  });
  try {
    const start = await at(page, 20, 5),
      end = await at(page, 27, 5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await arrived;
    if (released) await page.mouse.up();
    await page.keyboard.press("Escape");
    if (!released) await page.mouse.up();
    release();
    await settled(page);
    assert.deepEqual((await inspect(page)).document, original);
    assert.equal(await toolEnabled(page, "redo", "redo"), true, "Cancel preserves the redo branch");
  } finally {
    release();
    await page.unroute("**/sketch-api");
  }
}

export async function rejectedReply(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("v");
  await click(page, 20, 5);
  const original = (await inspect(page)).document;
  await page.route("**/sketch-api", async (route) => {
    if (route.request().postDataJSON().kind !== "preview") return route.continue();
    const response = await route.fetch();
    const reply = await response.json();
    // Fault injection checks presentation/recovery only. Native conflict rejection
    // itself is exercised separately in backend.test.ts using actual constraints.
    await route.fulfill({ response, json: { ...reply, error: "Sketch could not be solved" } });
  });
  try {
    await drag(page, [20, 5], [27, 5]);
    assert.deepEqual((await inspect(page)).document, original);
    await page.getByRole("status").filter({ hasText: "Sketch could not be solved" }).waitFor();
  } finally {
    await page.unroute("**/sketch-api");
  }
  await click(page, 20, 5);
  await drag(page, [20, 5], [24, 5]);
  pointEquals((await inspect(page)).document.sketches[0].curves[0].b, [24, 0]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "A failed reply adds no Undo entry");
  console.log(`${name}: injected solver error remains visible; next real edit succeeds`);
}
