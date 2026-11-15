import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Integration risk: an endpoint overlay click must append selection without leaking
// through to canvas selection, and disappear when the chain closes or a tool starts.
const fixture = JSON.parse(await readFile("tests/fixtures/close-edge-loop.json", "utf8"));
await withUiRuntimes(async (page, name) => {
  await capturedLobedLoop(page, name);
  await capturedFilletLoop(page, name);
});

async function capturedLobedLoop(page, name) {
  await openDocument(page, {
    name: "close-edge-loop.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await inspect(page);
  await orient(page, [0, -0.6, 1]);
  const hide = page.getByRole("button", { name: "Hide Sketch 1", exact: true });
  if (await hide.isVisible()) await hide.click();
  const original = (await inspect(page)).document;
  const body = original.bodies[0];
  const seed = body.edges.find((e) => e.id === fixture.selection[0].edge);
  await worldClick(page, seed.landmarks.midpoint);
  let state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.edge, seed.id);
  const button = page.getByRole("button", { name: "Close loop", exact: true });
  await button.waitFor({ state: "visible" });
  assert.equal(await button.count(), 1);
  const bounds = await button.boundingBox();
  assert.ok(Math.abs(bounds.width - bounds.height) < 0.1 && bounds.width <= 36);
  await page.screenshot({ path: `.cache/sketch-review/${name}-close-loop-button.png` });
  await button.click();
  state = await inspect(page);
  const expected = body.edges.filter((e) =>
    e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 27) < 1e-6),
  );
  assert.deepEqual(
    new Set(state.modelingSelection.map((t) => t.edge)),
    new Set(expected.map((e) => e.id)),
  );
  assert.equal(await button.count(), 0);
  assert.deepEqual(state.document, original);
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  assert.equal(state.modelingSelection.length, 1);
  assert.equal(state.modelingSelection[0].edge, seed.id);
  await button.waitFor({ state: "visible" });
  await button.focus();
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.modelingSelection.length, 4);
  assert.deepEqual(state.document, original);
  await page.screenshot({ path: `.cache/sketch-review/${name}-closed-loop.png` });
  await page.keyboard.press("Escape");
  await worldClick(page, seed.landmarks.midpoint);
  const upper = body.edges.find(
    (e) => e.signature[2] > 100 && e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 33) < 1e-6),
  );
  await worldClick(page, upper.landmarks.midpoint, true);
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  assert.equal(await button.count(), 2);
  const boxes = await button.evaluateAll((buttons) =>
    buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  assert.ok(
    Math.abs(boxes[0].x - boxes[1].x) >= boxes[0].width ||
      Math.abs(boxes[0].y - boxes[1].y) >= boxes[0].height,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-two-loop-buttons.png` });
  await button.first().click();
  assert.equal((await inspect(page)).modelingSelection.length, 5);
  assert.equal(await button.count(), 1);
  await button.click();
  state = await inspect(page);
  assert.equal(state.modelingSelection.length, 8);
  assert.equal(await button.count(), 0);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Escape");
  await worldClick(page, seed.landmarks.midpoint);
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await inspect(page);
  assert.equal(await button.isVisible(), false);
  await page.keyboard.press("Escape");
  await button.waitFor({ state: "visible" });
  console.log(
    `${name}: captured rim pointer/keyboard completion, selection Undo, unchanged geometry and modal hiding passed`,
  );
}

async function capturedFilletLoop(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/close-edge-loop-fillets.json", "utf8"));
  await openDocument(page, {
    name: "close-edge-loop-fillets.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await inspect(page);
  await orient(page, [0, -0.6, 1]);
  const hide = page.getByRole("button", { name: "Hide Sketch 1", exact: true });
  if (await hide.isVisible()) await hide.click();
  const original = (await inspect(page)).document;
  const seed = original.bodies[0].edges.find(
    (e) => e.id === "bd8c7f4a-e864-420f-8246-54675d38ad83",
  );
  await worldClick(page, seed.landmarks.midpoint);
  assert.equal((await inspect(page)).modelingSelection[0]?.edge, seed.id);
  await page.getByRole("button", { name: "Close loop", exact: true }).click();
  const completed = await inspect(page);
  assert.deepEqual(new Set(completed.modelingSelection.map((t) => t.edge)), new Set(fixture.rim));
  assert.deepEqual(completed.document, original);
  await page.screenshot({ path: `.cache/sketch-review/${name}-fillet-planar-loop.png` });
  await chooseTool(page, "undo", "undo");
  const undone = await inspect(page);
  assert.equal(undone.modelingSelection.length, 1);
  assert.equal(undone.modelingSelection[0].edge, seed.id);
  console.log(`${name}: many-sided capture closes the planar rim instead of the tiny fillet loop`);
}
