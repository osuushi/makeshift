import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { waitWidgetNavigation } from "./ui-widget-camera-ready.mjs";

const delivery = new WeakMap();

async function measuredWheel(page, delta) {
  const previous = delivery.get(page),
    scale = previous ?? 1;
  // WebKit truncates fractional wheel deltas; integer physical requests let
  // every runtime reveal a consistent delivery unit without a quotient tolerance.
  const request = { x: Math.round(delta.x / scale), y: Math.round(delta.y / scale) };
  await page.evaluate((request) => {
    const controller = new AbortController();
    window.widgetWheelDelivery = { controller, value: null };
    document.addEventListener(
      "wheel",
      (event) => {
        const delivered = { x: event.deltaX, y: event.deltaY, mode: event.deltaMode };
        window.widgetPanTrace ??= [];
        window.widgetPanTrace.push({ request, delivered });
        window.widgetWheelDelivery.value = delivered;
      },
      { capture: true, once: true, signal: controller.signal },
    );
  }, request);
  try {
    await page.mouse.wheel(request.x, request.y);
    await page.waitForFunction(() => Boolean(window.widgetWheelDelivery?.value));
    const delivered = await page.evaluate(() => window.widgetWheelDelivery.value);
    assert.equal(delivered.mode, 0, "The fixture requests pixel wheel delivery");
    const ratios = ["x", "y"]
      .filter((axis) => Math.abs(request[axis]) > 0.05)
      .map((axis) => delivered[axis] / request[axis]);
    assert.ok(ratios.length, "A pan has a meaningful axis for delivery calibration");
    const ratio = ratios[0];
    assert.ok(
      Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4,
      JSON.stringify({ request, delivered }),
    );
    for (const actual of [...ratios, ...(previous ? [previous] : [])])
      assert.ok(
        Math.abs(actual - ratio) < 1e-4,
        `Wheel delivery ratio is consistent across axes and events: ${JSON.stringify({ request, delivered, previous, ratios })}`,
      );
    delivery.set(page, ratio);
    return delivered;
  } finally {
    if (!page.isClosed())
      await page.evaluate(() => {
        window.widgetWheelDelivery?.controller.abort();
        delete window.widgetWheelDelivery;
      });
  }
}

/** Calibrate actual driver delivery, then verify the intended screen trajectory. */
export async function panTo(page, anchor, point) {
  const canvas = await page.locator("#world canvas").boundingBox();
  const wanted = { x: canvas.x + point.x, y: canvas.y + point.y };
  for (let pass = 0; pass < 2; pass++) {
    if (await page.evaluate(() => window.widgetNavigationState?.().observed ?? false))
      await waitWidgetNavigation(page);
    const current = await project(page, anchor);
    const delta = { x: current.x - wanted.x, y: current.y - wanted.y };
    const unit = delivery.get(page) ?? 1;
    if (!Math.round(delta.x / unit) && !Math.round(delta.y / unit)) {
      assertNearest(current, wanted, unit);
      return;
    }
    const previous = (await inspect(page)).camera.target;
    const free = await freeCanvasPoint(page);
    await page.mouse.move(free.x, free.y);
    const delivered = await measuredWheel(page, delta);
    const expected = { x: current.x - delivered.x, y: current.y - delivered.y };
    await page.waitForFunction(
      (previous) =>
        window.makeshiftInspect().camera.target.some((v, i) => Math.abs(v - previous[i]) > 1e-8),
      previous,
    );
    if (await page.evaluate(() => Boolean(window.widgetNavigationState)))
      await waitWidgetNavigation(page);
    const reached = await project(page, anchor);
    assert.ok(
      Math.hypot(reached.x - expected.x, reached.y - expected.y) <= 0.1,
      `Delivered screen trajectory: ${JSON.stringify({ current, delivered, expected, reached })}`,
    );
  }
  assertNearest(await project(page, anchor), wanted, delivery.get(page));
}

function assertNearest(reached, wanted, unit) {
  // This unit comes from requested/delivered input, independently of the result.
  // Geometry/layout tolerances remain unchanged; physical wheel steps may leave
  // the commanded screen point between two representable positions.
  for (const axis of ["x", "y"])
    assert.ok(
      Math.abs(reached[axis] - wanted[axis]) <= unit / 2 + 1e-4,
      `Nearest commanded screen pan: ${JSON.stringify({ unit, wanted, reached })}`,
    );
}

export async function freeCanvasPoint(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#world canvas"),
      r = canvas.getBoundingClientRect();
    for (let y = r.bottom - 55; y > r.top + 180; y -= 70)
      for (let x = r.right - 190; x > r.left + 230; x -= 70)
        if (
          document.elementFromPoint(x, y) === canvas &&
          ![...document.querySelectorAll("[data-move-marker]")].some((element) => {
            const r = element.getBoundingClientRect();
            return x >= r.left - 30 && x <= r.right + 30 && y >= r.top - 30 && y <= r.bottom + 30;
          })
        )
          return { x, y };
    throw new Error("No canvas point for camera pan");
  });
}
