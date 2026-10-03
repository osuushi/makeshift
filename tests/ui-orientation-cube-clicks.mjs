import assert from "node:assert/strict";
import { inspect, reset } from "./ui-helpers.mjs";

export async function cubeSettled(page) {
  await page.waitForFunction(
    () => document.querySelector(".orientation-cube").getAttribute("aria-busy") !== "true",
  );
  return inspect(page);
}

export async function cubeClicksRoute(page, name) {
  await reset(page);
  const before = await inspect(page);
  for (const oblique of [false, true]) {
    await sidewaysTop(page, oblique);
    const start = (await inspect(page)).camera;
    const point = await surfacePoint(page, "Top");
    await page.mouse.click(point.x, point.y);
    assert.deepEqual((await inspect(page)).camera, start, "First click waits without moving");
    const aligned = (await cubeSettled(page)).camera;
    assertNormal(aligned, [0, 0, 1]);
    assert.ok(Math.abs(aligned.up[0]) > 0.99, "Single click retains sideways roll");
    await page.mouse.click(point.x, point.y);
    assert.deepEqual(
      (await cubeSettled(page)).camera,
      aligned,
      "Aligned single click retains roll",
    );
    await sidewaysTop(page, oblique);
    const doubleStart = (await inspect(page)).camera;
    const doublePoint = await surfacePoint(page, "Top");
    await page.mouse.click(doublePoint.x, doublePoint.y);
    await page.mouse.down();
    // A second press held beyond the delay must still suppress the first action.
    await page.waitForTimeout(300);
    assert.deepEqual(
      (await inspect(page)).camera,
      doubleStart,
      "Held double click has no first action",
    );
    await page.mouse.up();
    const canonical = (await cubeSettled(page)).camera;
    assertNormal(canonical, [0, 0, 1]);
    assertUp(canonical, [0, 1, 0]);
  }
  await repeatedClicks(page);
  await cancellation(page);
  await keyboard(page);
  assert.deepEqual((await inspect(page)).document, before.document);
  console.log(
    `${name}: nearest single click, direct canonical double click, repeated clicks, cancellation and immediate keyboard passed`,
  );
}

async function sidewaysTop(page, oblique) {
  const top = page.getByRole("button", { name: "Top view", exact: true });
  await top.locator("polygon").dblclick();
  await cubeSettled(page);
  const box = await page.locator(".orientation-cube").boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x + 20, y);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  const viewport = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const cx = viewport.x + viewport.width / 2,
    cy = viewport.y + viewport.height / 2;
  await page.mouse.move(cx - (y - cy), cy + (x + 20 - cx), { steps: 12 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  if (oblique) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 10, y + 12, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  await inspect(page);
}

async function repeatedClicks(page) {
  await sidewaysTop(page, true);
  const point = await surfacePoint(page, "Top");
  await page.mouse.click(point.x, point.y, { clickCount: 4, delay: 35 });
  assertUp((await cubeSettled(page)).camera, [0, 1, 0]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sidewaysTop(page, true);
  const start = (await inspect(page)).camera;
  const reducedPoint = await surfacePoint(page, "Top");
  await page.mouse.click(reducedPoint.x, reducedPoint.y);
  assert.deepEqual((await inspect(page)).camera, start);
  await page.mouse.click(reducedPoint.x, reducedPoint.y);
  const reduced = (await inspect(page)).camera;
  assert.equal(reduced.moving, false);
  assertUp(reduced, [0, 1, 0]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

async function cancellation(page) {
  for (const action of ["Escape", "blur", "wheel", "pointercancel", "viewport"]) {
    await sidewaysTop(page, true);
    const point = await surfacePoint(page, "Top");
    await page.mouse.click(point.x, point.y);
    if (action === "Escape") await page.keyboard.press("Escape");
    if (action === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (action === "wheel") {
      await page.mouse.move(700, 500);
      await page.mouse.wheel(20, 10);
    }
    if (action === "pointercancel")
      await page.locator(".orientation-cube").dispatchEvent("pointercancel");
    if (action === "viewport") await page.mouse.click(700, 500);
    const canceled = (await inspect(page)).camera;
    await page.waitForTimeout(300);
    assert.deepEqual((await inspect(page)).camera, canceled, `${action} cancels pending alignment`);
  }
  await sidewaysTop(page, true);
  const point = await surfacePoint(page, "Top");
  await page.mouse.click(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y + 15, { steps: 4 });
  assert.equal((await inspect(page)).camera.orbitActive, true);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const canceled = (await inspect(page)).camera;
  await page.waitForTimeout(300);
  assert.deepEqual(
    (await inspect(page)).camera,
    canceled,
    "A dragged second press cancels alignment",
  );
}

async function keyboard(page) {
  await sidewaysTop(page, true);
  const top = page.getByRole("button", { name: "Top view", exact: true });
  await top.focus();
  await page.evaluate(() => {
    window.addEventListener(
      "keyup",
      () => {
        window.cubeKeyCamera = window.makeshiftInspect().camera;
      },
      { once: true },
    );
  });
  await page.keyboard.press("Enter");
  const camera = await page.evaluate(() => window.cubeKeyCamera);
  assert.equal(camera.moving, true, "Keyboard activation starts before key release");
  assert.ok(Math.abs((await inspect(page)).camera.up[0]) > 0.99);
  await page.keyboard.press("Space");
  assertUp((await inspect(page)).camera, [0, 1, 0]);
}

export async function cubeTouchRoute(page, name) {
  await sidewaysTop(page, true);
  const touchPoint = await surfacePoint(page, "Top");
  const start = (await inspect(page)).camera;
  await page.touchscreen.tap(touchPoint.x, touchPoint.y);
  assert.deepEqual((await inspect(page)).camera, start, "First tap waits");
  await page.touchscreen.tap(touchPoint.x, touchPoint.y);
  assertUp((await cubeSettled(page)).camera, [0, 1, 0]);
  const box = await page.locator(".orientation-cube").boundingBox();
  assert.equal(box.width, 144, "Targets are checked at the normal UI scale");
  const canonical = page.getByRole("button", { name: "Right Back Top view", exact: true });
  for (const [surface, normal] of [
    ["Right", [1, 0, 0]],
    ["Right Top", [1, 0, 1]],
    ["Right Back Top", [1, 1, 1]],
  ]) {
    await canonical.focus();
    await page.keyboard.press("Enter");
    await inspect(page);
    const point = await surfacePoint(page, surface);
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("g")?.getAttribute("aria-label"),
      point,
    );
    assert.equal(hit, `${surface} view`, "The visible surface is the actual touch target");
    await page.touchscreen.tap(point.x, point.y);
    assertNormal((await cubeSettled(page)).camera, normal);
  }
  await canonical.focus();
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.move(700, 500);
  await page
    .locator(".orientation-cube")
    .screenshot({ path: `.cache/sketch-review/${name}-cube-wider-bevels.png` });
  console.log(
    `${name}: face, edge and corner touch taps acquire the visible polygons at 144px scale`,
  );
}

async function surfacePoint(page, name) {
  return page
    .getByRole("button", { name: `${name} view`, exact: true })
    .locator("polygon")
    .evaluate((polygon) => {
      const points = Array.from(polygon.points);
      const point = new DOMPoint(
        points.reduce((sum, p) => sum + p.x, 0) / points.length,
        points.reduce((sum, p) => sum + p.y, 0) / points.length,
      ).matrixTransform(polygon.getScreenCTM());
      return { x: point.x, y: point.y };
    });
}
function assertNormal(camera, normal) {
  const offset = camera.position.map((v, i) => v - camera.target[i]);
  normal.forEach((v, i) => {
    assert.ok(Math.abs(offset[i] / Math.hypot(...offset) - v / Math.hypot(...normal)) < 1e-8);
  });
}
function assertUp(camera, expected) {
  expected.forEach((v, i) => {
    assert.ok(Math.abs(camera.up[i] - v) < 1e-8);
  });
}
