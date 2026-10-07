import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/cylinder-diameter-split.json", "utf8"));
await withUiRuntimes(async (page, name) => {
  await openDocument(page, {
    name: "cylinder-diameter-split.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await settled(page);
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "Split Body", "split");
  await pickPlane(page, "XZ");
  let state = await inspect(page);
  assert.equal(state.error, undefined);
  assert.equal(state.preview?.bodies.length, 2);
  assert.deepEqual(state.document, before);
  for (const body of state.preview.bodies)
    assert.ok(Math.abs(body.volume - 112.5 * Math.PI) < 1e-6);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "Split Body", "split");
  await pickPlane(page, "XZ");
  await page.getByRole("button", { name: "Accept Split Body", exact: true }).click();
  const after = (await inspect(page)).document;
  assert.equal(after.bodies.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].center[0] - after.bodies[0].center[0] - 3) < 1e-7);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document.bodies.map((b) => b.brep),
    after.bodies.map((b) => b.brep),
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-cylinder-diameter-split.png` });
  console.log(
    `${name}: captured Split Body preview, cancel, Apply, Undo/Redo, reselection and Move passed`,
  );
});
