import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { at, inspect, settled } from "./ui-helpers.mjs";

export async function tabletRegressions(page, pen) {
  const before = await inspect(page);
  assert.ok(Math.abs(before.camera.position[0] - before.camera.target[0]) > 1);
  const tap = await project(page, [-4, -10, 0]);
  await pen.down(tap);
  await pen.up(tap);
  await pen.down(tap);
  await pen.up(tap);
  let state = await inspect(page);
  assert.ok(state.activePlane);
  const [x, y] = state.camera.position;
  assert.ok(Math.abs(x - state.camera.target[0]) < 1e-6);
  assert.ok(Math.abs(y - state.camera.target[1]) < 1e-6, "Second tap finishes plane alignment");
  const original = state.document;
  await page.keyboard.press("l");
  const edge = await at(page, -4, -10);
  await pen.down(edge);
  await pen.move({ x: edge.x + 10, y: edge.y + 8 });
  await pen.up({ x: edge.x + 10, y: edge.y + 8 });
  state = await inspect(page);
  assert.deepEqual(state.document, original, "Pencil tap jitter must not draw");
  assert.equal(state.selectedCurves.length, 1, "Pencil tap selects the edge");
  await livePreview(page, pen, original);
  console.log("Pencil double tap, edge tap jitter and continuous delayed previews passed");
}

async function livePreview(page, pen, original) {
  await page.keyboard.press("l");
  const start = await at(page, -25, 20),
    end = await at(page, 20, 25);
  // Delay delivery of real host solves so pointer updates overtake each response.
  await page.evaluate(() => {
    window.testModel =
      window.makeshiftModel ??
      (async (command) =>
        (
          await fetch("/sketch-api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          })
        ).json());
    window.makeshiftModel = async (command) => {
      const result = await window.testModel(command);
      if (command.kind === "preview") await new Promise((resolve) => setTimeout(resolve, 100));
      return result;
    };
  });
  const previews = new Set();
  try {
    await pen.down(start);
    for (let i = 1; i <= 60; i++) {
      await pen.move({
        x: start.x + ((end.x - start.x) * i) / 60,
        y: start.y + ((end.y - start.y) * i) / 60,
      });
      await page.waitForTimeout(16);
      const state = await page.evaluate(() => window.makeshiftInspect());
      assert.deepEqual(state.document, original, "Held preview is not accepted geometry");
      if (state.preview) previews.add(JSON.stringify(state.preview));
    }
    assert.ok(previews.size >= 3, `Expected changing held previews, saw ${previews.size}`);
    await page.screenshot({ path: ".cache/ipad/live-preview.png" });
    await pen.up(end);
    await settled(page);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 5);
    await page.keyboard.press("Meta+z");
    await settled(page);
    assert.deepEqual((await inspect(page)).document, original);
  } finally {
    await page.evaluate(() => {
      window.makeshiftModel = window.testModel;
    });
  }
}
