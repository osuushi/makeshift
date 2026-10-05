import assert from "node:assert/strict";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { holdPreview } from "./ui-held-preview.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function acceptHeldPreview(page, label, kind, request, original, change) {
  const held = await holdPreview(page, request);
  let ready = false;
  try {
    await change();
    await page.waitForFunction(() => window.previewResponseHeld);
    const readiness = previewActionReady(page, label).then(() => {
      ready = true;
    });
    void readiness.catch(() => {});
    const during = await page.evaluate(() => window.makeshiftInspect());
    assert.equal(ready, false, "Readiness waits for real preview delivery");
    assert.equal(during.busy, true);
    assert.equal(during.solving, true);
    assert.equal(during.interaction.kind, kind);
    assert.equal(during.interaction.phase, "editing");
    assert.deepEqual(during.document, original);
    await standaloneOnly(page);
    held.release();
    await readiness;
    const preview = (await inspect(page)).preview;
    assert.ok(preview);
    await page.getByRole("button", { name: label, exact: true }).click();
    await modalCompleted(page);
    const accepted = (await inspect(page)).document;
    assert.deepEqual(accepted, preview, "One physical click accepts the exact verified candidate");
    return accepted;
  } finally {
    await held.close();
  }
}

async function extrudeSeed(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const original = (await inspect(page)).document;
  const accepted = await acceptHeldPreview(
    page,
    "Accept extrusion",
    "extrude",
    "extrude",
    original,
    () => page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("20"),
  );
  close(accepted.bodies[0].volume, 8000);
  console.log(`${name}: extrusion drains held native seed before one exact-volume Accept`);
}

async function filletSeed(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const center = await at(page, 0, 0),
    rim = await at(page, 8, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const original = (await inspect(page)).document;
  close(original.bodies[0].volume, 640 * Math.PI);
  await page.mouse.click(rim.x, rim.y);
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  const accepted = await acceptHeldPreview(
    page,
    "Accept fillet",
    "body-edge-finish",
    "finish-edges",
    original,
    () => page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2"),
  );
  assert.equal(accepted.bodies[0].faces.length, 4);
  close(accepted.bodies[0].faces.find((face) => face.blend).blend.radius, 2);
  assert.ok(accepted.bodies[0].volume < original.bodies[0].volume);
  console.log(`${name}: fillet drains held native seed before one exact-candidate Accept`);
}

await withUiRuntimes(
  async (page, name) => {
    await extrudeSeed(page, name);
    await filletSeed(page, name);
  },
  { allowed: ["chromium", "webkit"], defaults: ["webkit"], timeout: 30000 },
);
