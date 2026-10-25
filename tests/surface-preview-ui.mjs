import assert from "node:assert/strict";
import { historyMenu } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { holdCompletion } from "./ui-deferred-preview.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

async function route(page, runtime, kind) {
  let input, accept;
  if (kind === "offset") {
    await makePlate(page);
    await worldClick(page, [6, 6, 5]);
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    input = await relativeOffsetInput(page);
    accept = page.getByRole("button", { name: "Accept face offset", exact: true });
  } else {
    await plate(page);
    await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
    input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
    accept = page.getByRole("button", { name: "Accept fillet", exact: true });
  }
  await input.fill("1");
  const original = (await inspect(page)).document;
  await holdCompletion(page);
  try {
    await input.fill("2");
    await page.waitForFunction(() => window.deferredPresentation.reached);
    const early = await page.evaluate(() => window.makeshiftInspect());
    assert.equal(early.solving, true);
    assert.equal(early.preview, null);
    assert.ok(early.visualPreview?.bodies[0].faces.length);
    assert.deepEqual(early.document, original);
    assert.ok(early.bodyRendering.faces.length > 0);
    assert.ok(early.bodyRendering.faces.every((face) => !face.visible));
    assert.equal(await accept.isEnabled(), false);
    await page.screenshot({ path: `.cache/sketch-review/${kind}-early-mesh.png` });
    await input.fill("3");
    await page.evaluate(() => window.deferredPresentation.release());
    const latest = await inspect(page);
    assert.ok(latest.preview);
    assert.equal(latest.visualPreview, null);
    assert.equal(await accept.isEnabled(), true);
    const body = latest.preview.bodies[0];
    if (kind === "offset") close(body.volume, (original.bodies[0].volume * 8) / 5);
    else assert.ok(body.faces.some((face) => face.blend && Math.abs(face.blend.radius - 3) < 1e-6));
    console.log(
      `${runtime} ${kind}: mesh delivery ms`,
      await page.evaluate(() => window.deferredPresentation.timings),
    );
    await input.press("Enter");
    await modalCompleted(page);
    const accepted = (await inspect(page)).document;
    assert.deepEqual(accepted.bodies, latest.preview.bodies);
    await historyMenu(page, "undo");
    assert.deepEqual((await inspect(page)).document.bodies, original.bodies);
    await historyMenu(page, "redo");
    assert.deepEqual((await inspect(page)).document.bodies, accepted.bodies);
  } finally {
    await page.evaluate(() => {
      window.deferredPresentation.release();
      window.deferredPresentation.restore();
      delete window.deferredPresentation;
    });
  }
}

await withUiRuntimes(
  async (page, runtime) => {
    await route(page, runtime, "offset");
    await route(page, runtime, "fillet");
  },
  { defaults: ["electron"] },
);
