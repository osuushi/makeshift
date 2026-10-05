import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { holdPreview } from "./ui-held-preview.mjs";
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
  const held = await holdPreview(page, "offset-faces");
  let ready = false;
  try {
    await page.getByRole("textbox", { name: "Face radius", exact: true }).fill("2.5");
    await page.waitForFunction(() => window.previewResponseHeld);
    const readiness = previewActionReady(page, "Accept face offset").then(() => {
      ready = true;
    });
    void readiness.catch(() => {});
    const during = await page.evaluate(() => window.makeshiftInspect());
    assert.equal(ready, false, "Readiness must wait for real preview delivery");
    assert.equal(during.busy, true);
    assert.equal(during.solving, true);
    assert.equal(during.interaction.kind, "face-offset");
    assert.equal(during.interaction.phase, "editing");
    assert.deepEqual(during.document, original);
    held.release();
    await readiness;
    const preview = (await inspect(page)).preview;
    close(preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    await modalCompleted(page);
    const accepted = await inspect(page);
    assert.deepEqual(accepted.document, preview);
    close(
      accepted.document.bodies[0].faces.find((face) => face.id === hole.id).cylinder.radius,
      2.5,
    );
    close(accepted.document.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
    console.log(
      `${name}: readiness drains held real offset preview before one exact-candidate Accept`,
    );
  } finally {
    await held.close();
  }
}
await withUiRuntimes(route, {
  allowed: ["chromium", "webkit"],
  defaults: ["webkit"],
  timeout: 30000,
});
