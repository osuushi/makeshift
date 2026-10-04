import assert from "node:assert/strict";
import { holdCleanup } from "./ui-held-cleanup.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function acceptAfterCleanup(page, label, kind, original, preview, cleanup) {
  let ready = false;
  const pending = await page.evaluate(() =>
    [...document.querySelectorAll(".commit-cleanup")].some(
      (button) => button.getClientRects().length && button.getAttribute("aria-busy") === "true",
    ),
  );
  assert.equal(pending, true, "Real cleanup must still be pending when readiness starts");
  const readiness = previewActionReady(page, label).then(() => {
    ready = true;
  });
  void readiness.catch(() => {});
  await page.waitForFunction(() => window.previewCleanupHeld);
  const during = await page.evaluate(() => window.makeshiftInspect());
  assert.equal(ready, false, "Readiness must wait for real cleanup to finish");
  assert.equal(during.busy, true);
  assert.equal(during.solving, true);
  assert.equal(during.interaction.kind, kind);
  assert.equal(during.interaction.phase, "editing");
  assert.deepEqual(during.document, original);
  assert.deepEqual(during.preview, preview);
  cleanup.release();
  await readiness;
  await page.getByRole("button", { name: label, exact: true }).click();
  await modalCompleted(page);
  const accepted = await inspect(page);
  assert.deepEqual(
    accepted.document,
    preview,
    "One physical click accepts the exact verified candidate",
  );
  return accepted.document;
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
  const cleanup = await holdCleanup(page);
  try {
    await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("20");
    await page.waitForFunction(() => {
      const state = window.makeshiftInspect();
      return (
        Math.abs((state.preview?.bodies?.[0]?.volume ?? 0) - 8000) < 1e-6 &&
        document.querySelector('[aria-label="Extrusion distance"]')?.value === "20"
      );
    });
    const preview = await page.evaluate(() => window.makeshiftInspect().preview);
    close(preview.bodies[0].volume, 8000);
    const accepted = await acceptAfterCleanup(
      page,
      "Accept extrusion",
      "extrude",
      original,
      preview,
      cleanup,
    );
    close(accepted.bodies[0].volume, 8000);
    console.log(`${name}: extrusion waits for held real cleanup before one exact-volume Accept`);
  } finally {
    await cleanup.close();
  }
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
  const cleanup = await holdCleanup(page);
  try {
    await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
    await page.waitForFunction(() => {
      const state = window.makeshiftInspect();
      const body = state.preview?.bodies?.[0];
      return (
        body?.faces.length === 4 &&
        body.faces.some((face) => face.blend?.radius === 2) &&
        document.querySelector('[aria-label="Fillet radius"]')?.value === "2"
      );
    });
    const preview = await page.evaluate(() => window.makeshiftInspect().preview);
    assert.equal(preview.bodies[0].faces.length, 4);
    close(preview.bodies[0].faces.find((face) => face.blend).blend.radius, 2);
    assert.ok(preview.bodies[0].volume < original.bodies[0].volume);
    const accepted = await acceptAfterCleanup(
      page,
      "Accept fillet",
      "body-edge-finish",
      original,
      preview,
      cleanup,
    );
    close(accepted.bodies[0].faces.find((face) => face.blend).blend.radius, 2);
    close(accepted.bodies[0].volume, preview.bodies[0].volume);
    console.log(`${name}: fillet waits for held real cleanup before one exact-candidate Accept`);
  } finally {
    await cleanup.close();
  }
}
await withUiRuntimes(
  async (page, name) => {
    await extrudeSeed(page, name);
    await filletSeed(page, name);
  },
  { allowed: ["chromium", "webkit"], defaults: ["webkit"], timeout: 30000 },
);
