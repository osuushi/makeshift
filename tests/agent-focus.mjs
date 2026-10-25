import assert from "node:assert/strict";

// These escaped failures cross native focus, DOM events, PTY IPC and canvas painting.
// Model/unit tests cannot prove where real keystrokes go or when their echo appears.
export async function agentFocusRoute(page) {
  const panel = page.locator(".agent-dock");
  const screen = page.locator(".agent-screen");
  await page.getByRole("button", { name: "Collapse agent terminal" }).click();
  assert.equal(
    await page
      .locator('canvas[aria-label="Modeling viewport"]')
      .evaluate((canvas) => document.activeElement === canvas),
    true,
    "collapsing returns keyboard ownership to the drawing",
  );
  await page.getByRole("button", { name: "Expand agent terminal" }).click();
  assert.equal(await screen.evaluate((element) => element.contains(document.activeElement)), true);
  assert.equal(await panel.getAttribute("data-focus"), "terminal");
  assert((await cursorFrames(page)) > 1, "focused terminal cursor visibly blinks");
  assert.equal(
    await screen.evaluate((element) => getComputedStyle(element).caretColor),
    "rgba(0, 0, 0, 0)",
  );
  await page.screenshot({ path: ".cache/sketch-review/agent-focused.png" });
  await page
    .locator('canvas[aria-label="Modeling viewport"]')
    .click({ position: { x: 400, y: 300 } });
  assert.equal(await panel.getAttribute("data-focus"), "drawing");
  assert.equal(
    await cursorFrames(page),
    1,
    "unfocused terminal pixels stay still across blink periods",
  );
  await page.screenshot({ path: ".cache/sketch-review/agent-unfocused.png" });
  await page.getByRole("button", { name: "Change agent dock position" }).click();
  assert.equal(await panel.getAttribute("data-focus"), "controls");
  assert.equal(await cursorFrames(page), 1, "pane control focus also stops the terminal cursor");
  await page.getByRole("button", { name: "Change agent dock position" }).click();
  await page.getByRole("button", { name: "Collapse agent terminal" }).click();
  await page.getByRole("button", { name: "Expand agent terminal" }).click();
  assert((await cursorFrames(page)) > 1, "reopening resumes cursor blinking");
  const before = await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document));
  await page.evaluate(() => {
    const pending = new Map();
    window.agentEchoTimes = [];
    window.agentEchoCleanup = () => {
      CanvasRenderingContext2D.prototype.fillText = fillText;
      document.removeEventListener("keydown", keydown, true);
    };
    const keydown = (event) => {
      if (/^[QWERTYUIOP]$/.test(event.key)) pending.set(event.key, performance.now());
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      const result = fillText.call(this, text, ...args);
      if (this.canvas.closest(".agent-screen") && pending.has(text)) {
        window.agentEchoTimes.push(performance.now() - pending.get(text));
        pending.delete(text);
      }
      return result;
    };
    document.addEventListener("keydown", keydown, true);
  });
  try {
    await page.keyboard.type("QWERTYUIOP", { delay: 20 });
    await page.waitForFunction(() => window.agentEchoTimes.length === 10);
    const times = await page.evaluate(() => window.agentEchoTimes);
    assert(Math.max(...times) < 200, `PTY echo must not batch several keystrokes: ${times}`);
    console.log(`Key-to-canvas echo (ms): ${times.map(Math.round).join(", ")}`);
  } finally {
    await page.evaluate(() => window.agentEchoCleanup());
  }
  await page.keyboard.press("Control+c");
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document)),
    before,
  );
}

async function cursorFrames(page) {
  return page.locator(".agent-screen canvas").evaluate(async (canvas) => {
    const frames = new Set();
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      frames.add(canvas.toDataURL());
    }
    return frames.size;
  });
}
