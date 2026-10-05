import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { holdCleanup } from "./ui-held-cleanup.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

async function route(page, name) {
  const original = await makePlate(page);
  const hole = original.bodies[0].faces.find((face) => face.cylinder);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [0, 1.5, 2.5]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, hole.id);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await page.getByRole("textbox", { name: "Face radius", exact: true }).fill("2.5");
  const preview = (await inspect(page)).preview;
  close(preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  const cleanup = await holdCleanup(page);
  let ready = false;
  try {
    const pending = await page.evaluate(() => ({
      busy: window.makeshiftInspect().busy,
      cleanup: document
        .querySelector(".face-offset-widget .commit-cleanup")
        ?.getAttribute("aria-busy"),
    }));
    assert.equal(pending.busy, false);
    assert.equal(
      pending.cleanup,
      "true",
      "Real cleanup must still be pending when readiness starts",
    );
    const readiness = previewActionReady(page, "Accept face offset").then(() => {
      ready = true;
    });
    void readiness.catch(() => {});
    await page.waitForFunction(() => window.previewCleanupHeld);
    const during = await page.evaluate(() => window.makeshiftInspect());
    assert.equal(ready, false, "Readiness must not return before pending cleanup finishes");
    assert.equal(during.busy, true);
    assert.equal(during.solving, true);
    assert.equal(during.interaction.kind, "face-offset");
    assert.equal(during.interaction.phase, "editing");
    assert.deepEqual(during.document, original);
    assert.deepEqual(during.preview, preview);
    cleanup.release();
    await readiness;
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    await modalCompleted(page);
    const accepted = await inspect(page);
    close(
      accepted.document.bodies[0].faces.find((face) => face.id === hole.id).cylinder.radius,
      2.5,
    );
    close(accepted.document.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
    console.log(`${name}: readiness drains held real cleanup before one physical Accept click`);
  } finally {
    await cleanup.close();
  }
}
await withUiRuntimes(route, {
  allowed: ["chromium", "webkit"],
  defaults: ["webkit"],
  timeout: 30000,
});
