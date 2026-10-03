import assert from "node:assert/strict";
import { drag, reset } from "./ui-helpers.mjs";
import { navigationIdle, navigationRoundTrip } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function navigationInputRoute(page, name) {
  await reset(page);
  await navigationRoundTrip(
    page,
    () => chooseTool(page, "Sketch on XY", "sketch-xy"),
    "Sketch entry",
  );
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  await navigationIdle(page);
  await navigationRoundTrip(page, () => wheel(page, 30, 20), "Scroll pan");
  await navigationRoundTrip(
    page,
    async () => {
      await page.mouse.move(1000, 600);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(945, 570, { steps: 6 });
      await page.mouse.up({ button: "right" });
    },
    "Secondary pan",
  );
  await navigationRoundTrip(page, () => pinch(page), "Ctrl-wheel pinch");
  await navigationRoundTrip(
    page,
    async () => {
      await gesture(page, "gesturestart", 1);
      await gesture(page, "gesturechange", 1.1);
      await gesture(page, "gesturechange", 1.25);
      await gesture(page, "gestureend", 1.25);
    },
    "WebKit gesture-scale pinch",
  );
  await navigationRoundTrip(page, () => orbit(page), "Command orbit with workspace/selection");
  await navigationRoundTrip(page, () => orbit(page, true), "Option roll");
  await navigationRoundTrip(
    page,
    () => chooseTool(page, "Sketch on XZ", "sketch-xz"),
    "Tool-menu canonical view",
  );
  await navigationRoundTrip(
    page,
    () => chooseTool(page, "Return to Modeling", "modeling"),
    "Sketch exit",
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await navigationIdle(page);
  await navigationRoundTrip(
    page,
    () => page.getByRole("button", { name: "Top view", exact: true }).click(),
    "Cube single click",
  );
  await navigationRoundTrip(page, () => cubeDrag(page), "Cube drag");
  await navigationRoundTrip(
    page,
    async () => {
      await page.locator('.orientation-cube [role="button"]:visible').first().focus();
      await page.keyboard.press("Space");
    },
    "Cube keyboard alignment",
  );
  await noOpNavigation(page);
  await navigationRoundTrip(
    page,
    () => orbit(page, true, true),
    "Canceled moved orbit keeps a reversible view",
  );
  console.log(
    `${name}: entry/exit, scroll/secondary pan, browser/WebKit pinch, orbit/roll, cube click/drag/keyboard Undo/Redo passed`,
  );
}
export async function wheel(page, x, y) {
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(x, y);
}
export async function pinch(page) {
  await page.keyboard.down("Control");
  await wheel(page, 0, -12);
  await page.keyboard.up("Control");
}
function gesture(page, type, scale) {
  return page.locator("canvas").evaluate(
    (canvas, { type, scale }) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale, clientX: 1000, clientY: 600 });
      canvas.dispatchEvent(event);
    },
    { type, scale },
  );
}
async function orbit(page, roll = false, cancel = false) {
  await page.mouse.move(1000, 600);
  await page.keyboard.down("Meta");
  if (roll) await page.keyboard.down("Alt");
  await page.mouse.down();
  if (roll) {
    const box = await page.locator("canvas").boundingBox();
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    const radius = Math.min(box.width, box.height) * 0.28;
    // A substantial arc avoids the ordinary small-roll horizon snap returning to the start.
    await page.mouse.up();
    await page.mouse.move(cx + radius, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      const angle = (i * Math.PI) / 16;
      await page.mouse.move(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
  } else await page.mouse.move(940, 550, { steps: 8 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (roll) await page.keyboard.up("Alt");
  await page.keyboard.up("Meta");
}
async function cubeDrag(page) {
  const box = await page.locator(".orientation-cube").boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 28, y + 18, { steps: 6 });
  await page.mouse.up();
}
async function noOpNavigation(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await navigationIdle(page);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await navigationIdle(page);
  const before = await page.evaluate(() => window.makeshiftHistory());
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await navigationIdle(page);
  await wheel(page, 0, 0);
  await page.mouse.move(1000, 600);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await navigationIdle(page);
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    before,
    "Canonical no-op/zero wheel/canceled pending press add no history",
  );
}
