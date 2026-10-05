import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { launchElectron } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { assertPivot, makePivotBox, pressOnPlane } from "./ui-orbit-pivot.mjs";
import { cubeSettled } from "./ui-orientation-cube-clicks.mjs";
import { assertRollAnchor, assertSmoothRoll, recordRoll } from "./ui-roll-animation.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function touchDriver(page, name) {
  if (name === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })),
      });
    return {
      start: (p) => send("touchStart", [[1, p.x, p.y]]),
      move: (p) => send("touchMove", [[1, p.x, p.y]]),
      end: () => send("touchEnd", []),
      dispose: () => cdp.detach(),
      send,
    };
  }
  // WebKit has no automated finger-drag API. Native pointer capture is retained;
  // classify the mouse stream as touch before app listeners, with no pre-press hover delivery.
  return {
    start: async (p) => {
      await page.evaluate(() => {
        window.orbitTouch = true;
      });
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
    },
    move: (p) => page.mouse.move(p.x, p.y),
    end: async () => {
      await page.mouse.up();
      await page.evaluate(() => {
        window.orbitTouch = false;
      });
    },
    dispose: async () => {},
  };
}
async function route(page, name) {
  await inspect(page);
  if ((await inspect(page)).document.bodies?.length) {
    const opening = chooseTool(page, "new document", "new");
    const discard = page.getByRole("button", { name: "Don’t Save", exact: true });
    await discard.waitFor();
    await discard.click();
    await opening;
  }
  await makePivotBox(page);
  const touch = await touchDriver(page, name);
  try {
    for (const outside of [false, true]) {
      await page.getByRole("button", { name: "Top view", exact: true }).dblclick();
      await cubeSettled(page);
      const sample = await pressOnPlane(page, outside ? [24, 2, 12] : [5, 4, 12]);
      const expected = outside ? [16, sample.point[1], 12] : sample.point;
      await page.mouse.move(30, 700);
      const before = await inspect(page);
      await touch.start(sample.press);
      await touch.move({ x: sample.press.x + 30, y: sample.press.y - 25 });
      const during = await inspect(page);
      assertPivot(during, expected);
      await touch.move({ x: sample.press.x + 50, y: sample.press.y - 35 });
      assert.deepEqual((await inspect(page)).camera.orbitPivot, during.camera.orbitPivot);
      await touch.end();
      assert.deepEqual((await inspect(page)).document, before.document);
    }
    if (touch.send) await twoFingerSimilarity(page, touch);
    console.log(
      `${name}: touch press ray and empty-space nearest pivot work without hover and stay frozen; no geometry edits`,
    );
  } finally {
    await touch.dispose();
  }
}
async function twoFingerSimilarity(page, touch) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const before = await inspect(page);
  const xyz = [5, 4, 12],
    initial = await project(page, xyz);
  await touch.send("touchStart", [[1, 420, 350]]);
  await touch.send("touchStart", [
    [1, 420, 350],
    [2, 620, 350],
  ]);
  await touch.send("touchMove", [
    [1, 400, 365],
    [2, 660, 365],
  ]);
  await recordRoll(page);
  await touch.send("touchMove", [
    [1, 410, 275],
    [2, 650, 455],
  ]);
  await page.waitForFunction(
    (height) => Math.abs(window.makeshiftInspect().camera.height - height / 1.5) < 1e-7,
    before.camera.height,
  );
  await touch.send("touchMove", [
    [1, 560, 240],
    [2, 560, 540],
  ]);
  await touch.end();
  assert.equal(
    await page.evaluate(() => window.makeshiftInspect().camera.moving),
    true,
    "Early release lets the turn animation finish",
  );
  const during = await inspect(page),
    moved = await project(page, xyz);
  await assertSmoothRoll(page, before, Math.PI / 2);
  await assertRollAnchor(page, before, { x: 520, y: 350 }, [
    { x: 530, y: 365 },
    { x: 560, y: 390 },
  ]);
  assert.equal(during.camera.orbitActive, false);
  assert.ok(Math.abs(during.camera.height - before.camera.height / 1.5) < 1e-7);
  assert.ok(Math.abs(moved.x - (560 - (initial.y - 350) * 1.5)) < 1e-5);
  assert.ok(Math.abs(moved.y - (390 + (initial.x - 520) * 1.5)) < 1e-5);
  // Safari duplicates these contacts as GestureEvents; that stream must not apply again.
  await page.locator("canvas").evaluate((canvas) => {
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale: 1.5, rotation: 90 });
      canvas.dispatchEvent(event);
    }
  });
  assert.deepEqual((await inspect(page)).camera, during.camera);
  const snapped = await inspect(page);
  assert.deepEqual(
    snapped.camera.up,
    during.camera.up,
    "Release does not start another correction",
  );
  assert.deepEqual((await inspect(page)).document, before.document);
  // A stationary remaining contact neither snaps nor starts another orbit.
  await touch.send("touchStart", [
    [1, 530, 215],
    [2, 530, 515],
  ]);
  await touch.send("touchEnd", [[1, 530, 215]]);
  assert.deepEqual((await inspect(page)).camera.up, snapped.camera.up);
  await touch.end();
  console.log(
    "chromium: combined pan/pinch, smooth quarter-turn with early release, and duplicate Safari suppression",
  );
}

const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
try {
  const desktop = await app.firstWindow();
  await inspect(desktop);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await desktop.getByRole("button", { name: "Trackpad", exact: true }).click();
  await desktop.getByRole("button", { name: "Tablet", exact: true }).click();
  const url = await desktop.locator(".ipad-addresses a").first().getAttribute("href");
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
        hasTouch: true,
      });
      if (name === "webkit")
        await page.addInitScript(() => {
          for (const type of ["pointerdown", "pointermove", "pointerup"])
            window.addEventListener(
              type,
              (event) => {
                if (!window.orbitTouch) return;
                Object.defineProperty(event, "pointerType", { value: "touch" });
                if (type === "pointermove" && !event.buttons) event.stopImmediatePropagation();
              },
              { capture: true },
            );
        });
      await page.goto(url);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
} finally {
  await app.close();
}
