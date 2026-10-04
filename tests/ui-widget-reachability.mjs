import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import {
  restoreWidgetNavigation,
  waitWidgetNavigation,
  watchWidgetNavigation,
} from "./ui-widget-camera-ready.mjs";
import { watchWidgetFrames, watchWidgetGesture } from "./ui-widget-frame-watch.mjs";
import { freeCanvasPoint, panTo } from "./ui-widget-wheel.mjs";

export async function centerOf(locator) {
  // Sketch SVGs redraw on hover; read the current registration's DOM in one task.
  return locator.evaluate((element) => {
    const key = element.closest("[data-move-marker]")?.dataset.moveMarker;
    const current = key
      ? element.ownerDocument.querySelector(`[data-move-marker="${key}"] > svg`)
      : element;
    const r = current?.getBoundingClientRect();
    if (!r?.width || !r.height) throw new Error("Missing rendered widget target");
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}
export async function assertWidgetTargets(page, selector, label) {
  // Wait for the established correction transition, checking actual applied rectangles.
  await page
    .waitForFunction((selector) => {
      const canvas = document.querySelector("#world canvas").getBoundingClientRect();
      const elements = [...document.querySelectorAll(selector)].filter((element) => {
        const r = element.getBoundingClientRect();
        return r.width && r.height;
      });
      return (
        elements.length &&
        elements.every((element) => {
          const r = element.getBoundingClientRect();
          const actual = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
          const target = element.style.translate.split(" ").map(Number.parseFloat);
          const stationary = [0, 1].every(
            (i) => Math.abs((actual[i] || 0) - (target[i] || 0)) < 0.01,
          );
          return (
            stationary &&
            r.left >= canvas.left + 7.9 &&
            r.top >= canvas.top + 7.9 &&
            r.right <= canvas.right - 7.9 &&
            r.bottom <= canvas.bottom - 7.9 &&
            element.dataset.widgetFit !== "limited" &&
            (element.matches("button,input,select")
              ? [element]
              : [...element.querySelectorAll("button,input,select")].filter((child) => {
                  const rect = child.getBoundingClientRect();
                  return rect.width && rect.height;
                })
            ).every((control) => {
              const rect = control.getBoundingClientRect();
              return control.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
            })
          );
        })
      );
    }, selector)
    .catch((error) => widgetFailure(page, selector, label, error));
  const targets = await page.evaluate((selector) => {
    const elements = [...document.querySelectorAll(selector)].filter((element) => {
      const r = element.getBoundingClientRect();
      return r.width && r.height;
    });
    return elements.map((element) => {
      const r = element.getBoundingClientRect();
      const controls = element.matches("button,input,select")
        ? [element]
        : [...element.querySelectorAll("button,input,select")].filter((child) => {
            const r = child.getBoundingClientRect();
            return r.width && r.height;
          });
      return {
        name: element.getAttribute("aria-label") || element.className,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        hits: controls.every((control) => {
          const r = control.getBoundingClientRect();
          return control.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
      };
    });
  }, selector);
  for (const target of targets) assert.equal(target.hits, true, `${label}: hit ${target.name}`);
  return targets;
}
export async function sweepWidgets(page, anchor, selector, label, { orbit = true } = {}) {
  await watchWidgetNavigation(page);
  try {
    const before = (await inspect(page)).document;
    await watchWidgetFrames(page, selector);
    const canvas = await page.locator("#world canvas").boundingBox();
    for (const point of [
      { x: -40, y: canvas.height / 2 },
      { x: canvas.width + 40, y: canvas.height / 2 },
      { x: canvas.width / 2, y: -40 },
      { x: canvas.width / 2, y: canvas.height + 40 },
      { x: -600, y: -400 },
    ]) {
      await panTo(page, anchor, point);
      await assertWidgetTargets(page, selector, label);
      assert.deepEqual((await inspect(page)).document, before, "Docking never edits geometry");
    }
    await panTo(page, anchor, { x: canvas.width / 2, y: canvas.height / 2 });
    for (const view of orbit
      ? [
          [1, -1, 0.8],
          [-1, 1, 0.8],
          [0, 0, 1],
        ]
      : []) {
      await orient(page, view);
      await assertWidgetTargets(page, selector, label);
    }
    if (orbit) await orient(page, [1, -1, 0.8]);
    for (const delta of [-70, 70]) {
      const previous = (await inspect(page)).camera.height;
      const point = await freeCanvasPoint(page);
      await page.mouse.move(point.x, point.y);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, delta);
      await page.keyboard.up("Control");
      await page.waitForFunction(
        (previous) => Math.abs(window.makeshiftInspect().camera.height - previous) > 0.01,
        previous,
      );
      await inspect(page);
      await assertWidgetTargets(page, selector, `${label} zoom`);
    }
    await panTo(page, anchor, { x: -40, y: canvas.height / 2 });
    await waitWidgetNavigation(page);
    await assertWidgetTargets(page, selector, label);
    const frames = await page.evaluate(() => {
      window.widgetFrameWatch.active = false;
      return window.widgetFrameWatch;
    });
    assert.ok(frames.samples > 5, `${label}: observed real camera-update frames`);
    assert.deepEqual(frames.failures, [], `${label}: no offscreen or occluded rendered frame`);
  } finally {
    await page.evaluate(() => {
      if (window.widgetFrameWatch) window.widgetFrameWatch.active = false;
    });
    await restoreWidgetNavigation(page);
  }
}

export async function dragPixels(page, handle, delta, modifiers = []) {
  const p = await centerOf(handle);
  await watchWidgetGesture(page, p, delta);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const widgetPress = process.env.MAKESHIFT_WIDGET_TRACE
    ? await page.evaluate(() => ({
        state: window.makeshiftInspect(),
        fields: [...document.querySelectorAll(".dimension input")].map((input) => ({
          label: input.getAttribute("aria-label"),
          value: input.value,
        })),
        offsets: [...document.querySelectorAll("[data-move-marker]")].map((element) => ({
          key: element.dataset.moveMarker,
          ...element.dataset,
        })),
      }))
    : null;
  await page.mouse.move(p.x + delta.x, p.y + delta.y, { steps: 8 });
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
  const state = await inspect(page);
  return {
    ...state,
    widgetPress,
    widgetGesture: await page.evaluate(() => window.widgetGestureTrace),
  };
}
export async function directionDrag(page, handle, distance = 18) {
  const d = await handle.evaluate((element) => ({
    x: Number(element.dataset.directionX),
    y: Number(element.dataset.directionY),
  }));
  assert.ok(Math.hypot(d.x, d.y) > 0.99);
  return dragPixels(page, handle, { x: d.x * distance, y: d.y * distance });
}
export async function acceptHistory(page, button, before) {
  await button.click();
  const after = (await inspect(page)).document;
  assert.notDeepEqual(after, before);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  return after;
}

async function widgetFailure(page, selector, label, error) {
  const state = await page.evaluate(
    (selector) => ({
      camera: window.makeshiftInspect().camera,
      pan: window.widgetPanTrace,
      snap: window.widgetNavigationState?.(),
      chrome: [
        ...document.querySelectorAll(
          "header,.entity-viewer,.orientation-cube,.agent-dock,.agent-toggle,.workspace-footer,.selection-readouts,.calculation-progress",
        ),
      ].map((e) => {
        const r = e.getBoundingClientRect();
        return { name: e.className, x: r.x, y: r.y, width: r.width, height: r.height };
      }),
      elements: [...document.querySelectorAll(selector)].map((element) => {
        const r = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          name: element.getAttribute("aria-label"),
          conditions: (() => {
            const canvas = document.querySelector("#world canvas").getBoundingClientRect();
            const actual = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
            const target = element.style.translate.split(" ").map(Number.parseFloat);
            const controls = element.matches("button,input,select")
              ? [element]
              : [...element.querySelectorAll("button,input,select")].filter(
                  (c) => c.getBoundingClientRect().width,
                );
            return {
              dx: (actual[0] || 0) - (target[0] || 0),
              dy: (actual[1] || 0) - (target[1] || 0),
              inside:
                r.left >= canvas.left + 7.9 &&
                r.top >= canvas.top + 7.9 &&
                r.right <= canvas.right - 7.9 &&
                r.bottom <= canvas.bottom - 7.9,
              hits: controls.every((c) => {
                const b = c.getBoundingClientRect();
                return c.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
              }),
            };
          })(),
          marker: element.parentElement.dataset.moveMarker,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          translate: getComputedStyle(element).translate,
          target: element.style.translate,
          fit: element.dataset.widgetFit,
          hit: document
            .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            ?.outerHTML.slice(0, 180),
          controls: [...element.querySelectorAll("button,input,select")].map((control) => {
            const r = control.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {
              name: control.getAttribute("aria-label"),
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              hit: hit?.outerHTML.slice(0, 200),
            };
          }),
        };
      }),
    }),
    selector,
  );
  throw new Error(`${label}: ${error.message} ${JSON.stringify(state)}`);
}
