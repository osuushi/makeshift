import assert from "node:assert/strict";
import { webkit } from "playwright";
import { launchElectron } from "./native-documents.mjs";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { installTestFrames } from "./ui-test-frames.mjs";
import { chooseTool } from "./ui-tools.mjs";

const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
let browser;
try {
  const desktop = await app.firstWindow();
  desktop.setDefaultTimeout(10000);

  await desktop.waitForFunction(() => Boolean(window.makeshiftInspect), null, { timeout: 10000 });

  await chooseTool(desktop, "Sketch on XY", "sketch-xy");
  await desktop.keyboard.press("r");
  await drag(desktop, [-15, -10], [15, 10]);
  await desktop.getByRole("button", { name: "Trackpad", exact: true }).click();
  await desktop.getByRole("button", { name: "Tablet", exact: true }).click();
  const url = await desktop.locator(".ipad-addresses a").first().getAttribute("href");
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
  await page.waitForFunction(() => Boolean(window.makeshiftInspect), null, { timeout: 10000 });

  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await settled(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("m");
  // Desktop WebKit does not enforce iOS's native keyboard activation policy.
  // Assert focus happens synchronously in the application's input handler.
  const original = (await inspect(page)).document;
  for (const label of ["Move X", "Move Y", "Angle", "Move X"]) {
    await page.keyboard.press("Tab");
    await selectedField(page, label);
  }
  await page.keyboard.press("Shift+Tab");
  await selectedField(page, "Angle");
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
  await app.close();
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
