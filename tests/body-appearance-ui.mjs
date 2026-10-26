import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { openBodyMenu } from "./ui-body-menu.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  await plate(page);
  await clearSelection(page);
  const before = (await inspect(page)).document;
  const openColor = async () =>
    (await openBodyMenu(page)).getByRole("menuitem", { name: "Color", exact: true }).click();
  await openColor();
  await page.getByLabel("Color", { exact: true }).fill("#dd4422");
  await page.getByLabel("Opacity (%)").fill("35");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.mouse.move(1100, 750);
  let state = await inspect(page);
  const appearance = [{ body: before.bodies[0].id, color: "#dd4422", alpha: 0.35 }];
  assert.deepEqual(state.document.bodyAppearances, appearance);
  assert.deepEqual(state.document.bodies, before.bodies);
  assert.ok(
    state.bodyRendering.faces.every(
      (face) =>
        face.color === "dd4422" && face.opacity === 0.35 && face.transparent && !face.depthWrite,
    ),
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-color.png` });
  await openColor();
  await page.getByLabel("Opacity (%)").fill("0");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodyAppearances, undefined);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  for (const opacity of [0, 100, 35]) {
    await openColor();
    await page.getByLabel("Opacity (%)").fill(String(opacity));
    await page.keyboard.press("Enter");
    state = await inspect(page);
    assert.ok(
      state.bodyRendering.faces.every(
        (face) => face.opacity === opacity / 100 && face.transparent === opacity < 100,
      ),
    );
  }
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0]?.body, before.bodies[0].id);
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("10");
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, []);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  await clearSelection(page);
  const directory = await mkdtemp(join(tmpdir(), "makeshift-colors-"));
  try {
    const path = join(directory, "color.makeshift");
    await saveDocument(page, path);
    await openDocument(page, path);
    assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(
    `${name}: body color, alpha endpoints, Cancel, keyboard Apply, Undo/Redo and Save/Open passed`,
  );
});
