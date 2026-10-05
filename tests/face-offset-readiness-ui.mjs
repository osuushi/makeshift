import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { orient } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

async function route(page, name) {
  const original = await makePlate(page);
  const hole = original.bodies[0].faces.find((face) => face.cylinder);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [0, 1.5, 2.5]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, hole.id);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await page.getByRole("textbox", { name: "Face radius", exact: true }).fill("2.5");
  close((await inspect(page)).preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  const previewModule = `/@fs/${fileURLToPath(
    new URL("../src/model/preview-runner.ts", import.meta.url),
  )
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")}`;
  await page.evaluate(async (moduleUrl) => {
    const { PreviewRunner } = await import(moduleUrl);
    const originalSettle = PreviewRunner.prototype.settle;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    window.offsetReadiness = {
      reached: false,
      release,
      restore: () => {
        PreviewRunner.prototype.settle = originalSettle;
      },
    };
    PreviewRunner.prototype.settle = async function () {
      await originalSettle.call(this);
      window.offsetReadiness.reached = true;
      await held;
      // The artificial hold can admit cleanup work after the first settle.
      await originalSettle.call(this);
    };
  }, previewModule);
  let returned = false,
    completion;
  try {
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    await page.waitForFunction(() => window.offsetReadiness.reached);
    completion = modalCompleted(page).then(() => {
      returned = true;
    });
    const during = await inspect(page);
    assert.equal(during.busy, false, "Real preview work completed before the held continuation");
    assert.equal(returned, false, "Modal completion must wait beyond native busy");
    assert.equal(during.interaction.kind, "face-offset");
    assert.equal(during.interaction.phase, "editing");
    assert.deepEqual(during.document, original, "Busy-only inspection returns before acceptance");
    close(during.preview.bodies[0].faces.find((face) => face.id === hole.id).cylinder.radius, 2.5);
  } finally {
    await page.evaluate(() => {
      window.offsetReadiness.restore();
      window.offsetReadiness.release();
      delete window.offsetReadiness;
    });
  }
  await completion;
  const accepted = await inspect(page);
  close(accepted.document.bodies[0].faces.find((face) => face.id === hole.id).cylinder.radius, 2.5);
  close(accepted.document.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  console.log(
    `${name}: held real preview completion distinguishes pre-accept inspection from accepted offset`,
  );
}
await withUiRuntimes(route, { defaults: ["chromium", "webkit", "electron"] });
