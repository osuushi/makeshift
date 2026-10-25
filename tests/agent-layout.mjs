import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Real pointer resizing catches dropped ResizeObserver fits; model tests cannot
// observe the canvas, terminal grid and dock falling out of sync.
export async function agentLayoutRoute(page) {
  const fit = () =>
    page.waitForFunction(() => {
      const screen = document.querySelector(".agent-screen");
      const canvas = screen.querySelector("canvas");
      const terminal = window.testTerminal;
      const metrics = terminal.renderer.getMetrics();
      return (
        terminal.cols === Math.floor(screen.clientWidth / metrics.width) &&
        terminal.rows === Math.floor(screen.clientHeight / metrics.height) &&
        Math.abs(canvas.getBoundingClientRect().right - screen.getBoundingClientRect().right) < 1
      );
    });
  await fit();
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type("i=0; while [ $i -lt 300 ]; do echo SCROLL-$i; i=$((i+1)); done");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.testTerminal.buffer.active.length > 250);
  for (const side of ["right", "bottom"]) {
    for (const size of [600, 320, 480, 350]) {
      const box = await page.getByRole("separator", { name: "Resize agent pane" }).boundingBox();
      const viewport = page.viewportSize();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        side === "right" ? viewport.width - size : viewport.width / 2,
        side === "bottom" ? viewport.height - size : viewport.height / 2,
        { steps: 3 },
      );
      await page.mouse.up();
      await fit();
    }
    await page.getByRole("button", { name: "Collapse agent terminal" }).click();
    await page.getByRole("button", { name: "Expand agent terminal" }).click();
    await fit();
    await page.getByRole("button", { name: "Change agent dock position" }).click();
    await fit();
  }
  await page.setViewportSize({ width: 1100, height: 750 });
  await fit();
  const box = await page.locator(".agent-screen canvas").boundingBox();
  await page.mouse.move(box.x + box.width - 8, box.y + 50);
  await page.mouse.wheel(0, -240);
  await page.waitForFunction(() => window.testTerminal.getViewportY() > 0);
  const screen = await page.locator(".agent-screen").boundingBox();
  const dock = await page.locator(".agent-dock").boundingBox();
  assert(Math.abs(screen.x + screen.width - dock.x - dock.width) < 1);
  await mkdir(".cache/sketch-review", { recursive: true });
  await page.screenshot({ path: ".cache/sketch-review/agent-layout.png" });
  const offset = await page.evaluate(() => window.testTerminal.getViewportY());
  await page.mouse.click(box.x + box.width - 8, box.y + 20);
  await page.waitForFunction((before) => window.testTerminal.getViewportY() > before, offset);
  console.log(
    "PASS agent layout: rapid splitter drags, both docks, collapse, window resize and edge scrollbar",
  );
}
