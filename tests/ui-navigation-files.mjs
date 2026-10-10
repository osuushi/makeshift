import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { drag, reset } from "./ui-helpers.mjs";
import { navigationIdle, navigationTips } from "./ui-navigation-history.mjs";
import { pinchStep } from "./ui-navigation-inputs.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function navigationFileBoundary(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const saved = await navigationIdle(page);
  const file = resolve(`.cache/sketch-review/${name}-navigation.makeshift`);
  await saveDocument(page, file);
  await pinchStep(page, 35, 20);
  await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 1);
  await reset(page);
  await openDocument(page, file);
  const opened = await navigationIdle(page);
  // Compare persisted JSON: native structured clone retains undefined optional keys.
  assert.deepEqual(JSON.parse(JSON.stringify(opened.document)), {
    ...JSON.parse(JSON.stringify(saved.document)),
    bodies: saved.document.bodies ?? [],
  });
  assert.equal(opened.activePlane, null, "File camera restores without the old workspace");
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    [],
    "Open resets view and geometry history",
  );
  saved.camera.position.forEach((n, i) => {
    assert.ok(Math.abs(n - opened.camera.position[i]) < 1e-7);
  });
  assert.ok(Math.abs(saved.camera.height - opened.camera.height) < 1e-7);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 1);
  await reset(page);
  const discard = page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Don’t Save", exact: true });
  if (await discard.isVisible()) await discard.click();
  const fresh = await navigationIdle(page);
  assert.equal(fresh.document.sketches.length, 0);
  assert.equal(fresh.activePlane, null);
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    [],
    "New camera reset records no history",
  );
  console.log(
    `${name}: saved current camera, active-workspace Open and New reset ephemeral navigation/history`,
  );
}
