import assert from "node:assert/strict";
import { blockedDuringDrawing } from "./ui-camera-drawing.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function verifyScrollPan(page, before) {
  await page.evaluate(() => {
    window.makeshiftTestWheelDeltas = [];
    window.addEventListener(
      "wheel",
      (event) => window.makeshiftTestWheelDeltas.push([event.deltaX, event.deltaY]),
      { capture: true },
    );
  });
  await page.mouse.move(980, 620);
  await page.mouse.wheel(80, 60);
  await page.waitForFunction(
    (x) => window.makeshiftInspect().projection.origin.x !== x,
    before.projection.origin.x,
  );
  const after = await inspect(page);
  const wheelDeltas = await page.evaluate(() => window.makeshiftTestWheelDeltas);
  assert.ok(wheelDeltas.length > 0);
  const [deltaX, deltaY] = wheelDeltas.reduce(([x, y], [dx, dy]) => [x + dx, y + dy], [0, 0]);
  assert.equal(after.activePlane, "XY", "Ordinary scroll retains sketch mode");
  close(after.projection.origin.x, before.projection.origin.x - deltaX);
  close(after.projection.origin.y, before.projection.origin.y - deltaY);
  assert.equal(after.camera.height, before.camera.height);
  assert.deepEqual(after.camera.up, before.camera.up);
  assert.deepEqual(after.document, before.document);
  return after;
}

export async function cameraRoute(page, name) {
  await animatedEntry(page, name);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const before = await inspect(page);
  const scrollPan = await verifyScrollPan(page, before);
  await orbitDrag(page, 80, -60);
  await page.waitForFunction(() => window.makeshiftInspect().activePlane === null);
  const rotated = await inspect(page);
  assert.notDeepEqual(
    rotated.camera.target,
    scrollPan.camera.target,
    "Off-center pivot rotates the view target too",
  );
  assert.equal(rotated.camera.height, before.camera.height);
  assert.notDeepEqual(
    [rotated.camera.position, rotated.camera.up],
    [scrollPan.camera.position, scrollPan.camera.up],
  );
  assert.deepEqual(rotated.document, before.document);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const aligned = await inspect(page);
  await page.mouse.move(980, 620);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(900, 560, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction(
    (target) => window.makeshiftInspect().camera.target.some((v, i) => v !== target[i]),
    aligned.camera.target,
  );
  const panned = await inspect(page);
  assert.equal(
    panned.camera.height,
    before.camera.height,
    "Two-finger click-drag pan preserves zoom",
  );
  close(panned.projection.origin.x, aligned.projection.origin.x - 80);
  close(panned.projection.origin.y, aligned.projection.origin.y - 60);
  assert.equal(panned.activeSketch, panned.document.sketches[0].id);
  const anchor = { x: 1000, y: 600 };
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -25); // Same browser event path as Chromium trackpad pinch.
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.makeshiftInspect().camera.height < height,
    panned.camera.height,
  );
  const state = await inspect(page);
  assert.equal(state.activeSketch, state.document.sketches[0].id);
  const factor = state.camera.height / panned.camera.height;
  close(state.projection.origin.x, anchor.x + (panned.projection.origin.x - anchor.x) / factor);
  close(state.projection.origin.y, anchor.y + (panned.projection.origin.y - anchor.y) / factor);
  assert.deepEqual(state.document, before.document);
  await orbitChecks(page, state, before.document);
  await safariPinchEvents(page);
  await blockedDuringDrawing(page);
  console.log(
    `${name}: scroll pan, Command-drag turntable orbit, secondary-drag pan, ctrl-wheel pinch path, release leveling and synthetic Safari gesture-scale handling passed`,
  );
}

async function animatedEntry(page, name) {
  await reset(page);
  const target = await findRaycastPoint(page, "XY");
  const entry = await page.evaluate((point) => {
    const before = window.makeshiftInspect().camera;
    document
      .querySelector("canvas")
      .dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, clientX: point.x, clientY: point.y }),
      );
    return { before, after: window.makeshiftInspect().camera };
  }, target);
  assert.equal(entry.after.moving, true, "Plane entry starts a camera transition");
  assert.deepEqual(
    entry.after.position,
    entry.before.position,
    "Entry does not jump before painting",
  );
  await page.waitForFunction((position) => {
    const camera = window.makeshiftInspect().camera;
    return camera.moving && camera.position.some((value, index) => value !== position[index]);
  }, entry.before.position);
  const middle = await page.evaluate(() => window.makeshiftInspect().camera);
  const aligned = await inspect(page);
  assert.equal(aligned.camera.moving, false);
  assert.notDeepEqual(aligned.camera.position, entry.before.position);
  assert.notDeepEqual(
    middle.position,
    entry.before.position,
    "Entry moves while transition is active",
  );

  await page.keyboard.press("r");
  await drag(page, [24, 18], [36, 26]);
  const region = await at(page, 30, 22);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  const started = await page.evaluate(({ x, y }) => {
    document
      .querySelector("canvas")
      ?.dispatchEvent(new MouseEvent("dblclick", { clientX: x, clientY: y, bubbles: true }));
    return window.makeshiftInspect();
  }, region);
  assert.equal(started.camera.moving, true, "Region entry animates its framing");
  const framed = await inspect(page);
  assert.deepEqual(framed.camera.target, [30, 22, 0], "Region finishes centered");
  assert.ok(framed.camera.height > 11 && framed.camera.height < 13, "Region fits with margin");
  await assertVisibleAndCentered(page, framed, [24, 18], [36, 26]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-animated-region-entry.png` });

  await chooseTool(page, "return to modeling", "modeling");
  const nextTarget = await findRaycastPoint(page, "XY");
  const moving = await page.evaluate((point) => {
    document
      .querySelector("canvas")
      .dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, clientX: point.x, clientY: point.y }),
      );
    return window.makeshiftInspect().camera.moving;
  }, nextTarget);
  assert.equal(moving, true);
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(20, 10);
  const interrupted = await inspect(page);
  await page.waitForTimeout(350);
  assert.deepEqual(
    (await navigationIdle(page)).camera,
    { ...interrupted.camera, navigationPending: false },
    "Navigation interruption prevents a late camera jump and completes its intent",
  );
}

async function assertVisibleAndCentered(page, state, low, high) {
  const bounds = await page.locator("canvas").boundingBox();
  assert.ok(bounds);
  const projected = (x, y) => ({
      x:
        state.projection.origin.x +
        (state.projection.u.x - state.projection.origin.x) * x +
        (state.projection.v.x - state.projection.origin.x) * y,
      y:
        state.projection.origin.y +
        (state.projection.u.y - state.projection.origin.y) * x +
        (state.projection.v.y - state.projection.origin.y) * y,
    }),
    a = projected(...low),
    b = projected(...high);
  assert.ok(
    [a, b].every(
      (point) =>
        point.x > bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y > bounds.y &&
        point.y < bounds.y + bounds.height,
    ),
    "Region remains fully inside the viewport",
  );
  close((a.x + b.x) / 2, bounds.x + bounds.width / 2, "region horizontal center");
  close((a.y + b.y) / 2, bounds.y + bounds.height / 2, "region vertical center");
}

async function orbitDrag(page, dx, dy) {
  await page.mouse.move(800, 600);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(800 + dx, 600 + dy, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
}

async function safariPinchEvents(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const before = await inspect(page);
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    for (const [type, scale] of [
      ["gesturestart", 1],
      ["gesturechange", 2],
      ["gesturechange", 2],
    ]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale }); // Safari scale events need not carry pointer coordinates.
      canvas.dispatchEvent(event);
      if (type === "gesturechange")
        canvas.dispatchEvent(
          new WheelEvent("wheel", { ctrlKey: true, deltaY: -40, cancelable: true }),
        );
    }
    canvas.dispatchEvent(new Event("gestureend"));
  });
  const after = await inspect(page);
  close(
    after.camera.height,
    before.camera.height / 2,
    "Cumulative Safari scale is applied once; duplicate wheel events are ignored",
  );
  assert.equal(after.activeSketch, after.document.sketches[0].id);
  assert.ok([...after.camera.position, ...after.camera.target].every(Number.isFinite));
  assert.deepEqual(after.document, before.document);
}

async function orbitChecks(page, state, document) {
  const radius = Math.hypot(...state.camera.position.map((v, i) => v - state.camera.target[i]));
  for (const [dx, dy] of [
    [50, 25],
    [50, -10],
    [-40, 30],
  ]) {
    await page.mouse.move(1000, 600);
    const previous = { position: state.camera.position, up: state.camera.up };
    await orbitDrag(page, dx, -dy);
    await page.waitForFunction((previous) => {
      const camera = window.makeshiftInspect().camera;
      return (
        camera.position.some((v, i) => v !== previous.position[i]) ||
        camera.up.some((v, i) => v !== previous.up[i])
      );
    }, previous);
    state = await inspect(page);
    assert.equal(state.activePlane, null);
    close(Math.hypot(...state.camera.position.map((v, i) => v - state.camera.target[i])), radius);
    assert.deepEqual(state.document, document);
  }
}
