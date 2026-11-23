import assert from "node:assert/strict";
import { webkit } from "playwright";
import { createServer } from "vite";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { installTestFrames } from "./ui-test-frames.mjs";
import { chooseTool } from "./ui-tools.mjs";

const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
    hasTouch: true,
    isMobile: true,
  });
  page.setDefaultTimeout(10000);
  await installTestFrames(page);
  await page.addInitScript(() => {
    window.numericFocusEvents = [];
    let inputDispatchDepth = 0;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (["keydown", "pointerup"].includes(type) && typeof listener === "function") {
        const original = listener;
        listener = function (...args) {
          inputDispatchDepth++;
          try {
            return original.apply(this, args);
          } finally {
            inputDispatchDepth--;
          }
        };
      }
      return add.call(this, type, listener, options);
    };
    const focus = HTMLInputElement.prototype.focus;
    HTMLInputElement.prototype.focus = function (...args) {
      if (this.inputMode === "decimal")
        window.numericFocusEvents.push({
          label: this.getAttribute("aria-label"),
          dispatching: inputDispatchDepth > 0,
        });
      return focus.apply(this, args);
    };
    // WebKit's SDK has no Pencil stream. Keep native pointer capture and delivery.
    for (const type of ["pointerdown", "pointermove", "pointerup", "click"])
      window.addEventListener(
        type,
        (event) => {
          if (event instanceof PointerEvent && event.pointerType === "mouse")
            Object.defineProperty(event, "pointerType", { value: "pen" });
        },
        { capture: true },
      );
  });
  await page.goto(url);
  await settled(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.waitForFunction(() => Boolean(window.makeshiftInspect), null, { timeout: 10000 });

  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await settled(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("m");
  // Desktop WebKit does not enforce iOS's native keyboard activation policy.
  // Assert focus happens synchronously in the application's input handler.
  const rotate = page.getByRole("button", { name: "Rotate layer", exact: true });
  if ((await rotate.getAttribute("aria-pressed")) === "false") await rotate.click();
  const original = (await inspect(page)).document;
  for (const label of ["Angle", "Move X", "Move Y", "Angle"]) {
    await page.keyboard.press("Tab");
    await selectedField(page, label);
  }
  await page.keyboard.press("Shift+Tab");
  await selectedField(page, "Move Y");
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  const arrow = page.locator('[data-move-marker="x"]');
  const box = await arrow.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await selectedField(page, "Move X");
  const events = await page.evaluate(() => window.numericFocusEvents);
  assert.ok(events.length >= 6);
  assert.ok(
    events.every((event) => event.dispatching),
    JSON.stringify(events),
  );
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document;
  assert.ok(
    Math.abs(moved.sketches[0].curves[0].a.x - original.sketches[0].curves[0].a.x - 3) < 1e-6,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    "Mobile WebKit tablet: Tab/Shift-Tab and Pencil arrow focus stay in the input event; typed movement and Undo passed. Physical iPad unverified.",
  );
} finally {
  await browser?.close();
  await server.close();
}

async function selectedField(page, label) {
  await page.waitForFunction((label) => {
    const input = document.activeElement;
    return (
      input instanceof HTMLInputElement &&
      input.getAttribute("aria-label") === label &&
      input.selectionStart === 0 &&
      input.selectionEnd === input.value.length
    );
  }, label);
  assert.equal(await page.getByRole("textbox", { name: label, exact: true }).isVisible(), true);
}
