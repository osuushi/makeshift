import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/extrude-internal-annulus.json", "utf8"));
await withUiRuntimes(async (page, name) => {
  await openDocument(page, {
    name: "internal-annulus.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  const before = (await inspect(page)).document;
  await orient(page, [0, -0.2, -1]);
  await worldClick(page, [0, -7, 0]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, fixture.selection[0].face);
  await page.keyboard.press("e");
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("8");
  await previewActionReady(page, "Accept extrusion");
  let state = await inspect(page);
  const expected = before.bodies[0].volume + Math.PI * 28 * 8;
  assert.ok(Math.abs(state.preview.bodies[0].volume - expected) < 1e-5);
  assert.deepEqual(state.document, before);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await worldClick(page, [0, -7, 0]);
  await chooseTool(page, "extrude", "extrude");
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("8");
  await previewActionReady(page, "Accept extrusion");
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  assert.ok(Math.abs(accepted.bodies[0].volume - expected) < 1e-5);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.screenshot({ path: `.cache/sketch-review/${name}-internal-annulus-fixed.png` });
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].center[0] - accepted.bodies[0].center[0] - 3) < 1e-6);
  await bodyArchiveRoute(page, `${name}-internal-annulus`);
  console.log(
    `${name}: captured annulus pointer selection, extrusion cancel/accept, history, Move and Save/Open passed`,
  );
});
