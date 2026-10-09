import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { cubeSettled } from "./ui-orientation-cube-clicks.mjs";

export async function bevelViewsRoute(page, name) {
  const before = await inspect(page);
  // Independent expected normals: all twelve flat diagonals and eight isometric corners.
  const targets = [];
  const names = [
    ["Left", "Right"],
    ["Front", "Back"],
    ["Bottom", "Top"],
  ];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        const normal = [x, y, z];
        if (normal.filter(Boolean).length < 2) continue;
        const label = normal.flatMap((v, i) => (v ? [names[i][v > 0 ? 1 : 0]] : [])).join(" ");
        targets.push({ label, normal });
      }
  for (const { label, normal } of targets) {
    const surface = page.getByRole("button", { name: `${label} view`, exact: true });
    await reveal(page, surface, normal);
    const start = (await inspect(page)).camera;
    await clickSurface(page, surface);
    const moving = await page.evaluate(() => window.makeshiftInspect().camera);
    assert.equal(moving.moving, true, "Bevel click starts a camera transition");
    const state = await inspect(page);
    const offset = state.camera.position.map((v, i) => v - state.camera.target[i]);
    const distance = Math.hypot(...offset);
    normal.forEach((v, i) => {
      assert.ok(Math.abs(offset[i] / distance - v / Math.hypot(...normal)) < 1e-8, label);
    });
    assert.equal(state.camera.height, before.camera.height);
    assert.deepEqual(state.camera.target, start.target);
    assert.ok(
      Math.abs(distance - Math.hypot(...start.position.map((v, i) => v - start.target[i]))) < 1e-8,
    );
    assert.deepEqual(state.document, before.document);
  }
  await page.getByRole("button", { name: "Right Back Top view", exact: true }).focus();
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.move(700, 500);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cube-beveled.png` });
  await animationInterruption(page);
  await page
    .locator(".orientation-cube")
    .screenshot({ path: `.cache/sketch-review/${name}-cube-top.png` });
  console.log(
    `${name}: all 12 edge and 8 corner views animate, preserve framing; reduced motion and interruption pass`,
  );
}

async function reveal(page, target, normal) {
  await orientWithTurntable(page, normal);
  const box = await target.locator("polygon").boundingBox();
  const hittable = await target.locator("polygon").evaluate((polygon) => {
    const points = Array.from(polygon.points);
    const area =
      Math.abs(
        points.reduce((sum, p, i) => {
          const q = points[(i + 1) % points.length];
          return sum + p.x * q.y - q.x * p.y;
        }, 0),
      ) / 2;
    const center = new DOMPoint(
      points.reduce((sum, p) => sum + p.x, 0) / points.length,
      points.reduce((sum, p) => sum + p.y, 0) / points.length,
    ).matrixTransform(polygon.getScreenCTM());
    return (
      area >= 60 &&
      document.elementFromPoint(center.x, center.y)?.closest("g") === polygon.parentElement
    );
  });
  assert.ok(box.width > 6 && box.height > 6 && hittable, "Cube surface is visibly hittable");
}

async function clickSurface(page, target) {
  const center = await target.locator("polygon").evaluate((polygon) => {
    const points = Array.from(polygon.points);
    const p = new DOMPoint(
      points.reduce((sum, p) => sum + p.x, 0) / points.length,
      points.reduce((sum, p) => sum + p.y, 0) / points.length,
    ).matrixTransform(polygon.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(center.x, center.y);
}

async function animationInterruption(page) {
  const top = page.getByRole("button", { name: "Top view", exact: true });
  const start = (await inspect(page)).camera;
  await clickSurface(page, top);
  await page.waitForFunction((start) => {
    const camera = window.makeshiftInspect().camera;
    return camera.moving && camera.position.some((v, i) => Math.abs(v - start.position[i]) > 0.001);
  }, start);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(30, 20);
  const interrupted = await inspect(page);
  await page.waitForTimeout(350);
  assert.deepEqual(
    (await navigationIdle(page)).camera,
    { ...interrupted.camera, navigationPending: false },
    "Pan cancels the old transition",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await clickSurface(page, top);
  const reduced = (await cubeSettled(page)).camera;
  assert.equal(reduced.moving, false, "Reduced motion applies the pose immediately");
  await page.emulateMedia({ reducedMotion: "no-preference" });
}
