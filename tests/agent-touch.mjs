import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function observeAgentTerminal(page) {
  await page.evaluate(
    async (path) => {
      const { AgentTerminal } = await import(path);
      const initialize = AgentTerminal.prototype.initialize;
      AgentTerminal.prototype.initialize = async function () {
        await initialize.call(this);
        window.testTerminal = this.terminal;
      };
      // Exercise the remote dock's visual-viewport branch with the real browser viewport.
      window.makeshiftRemote = true;
    },
    `/@fs${resolve("src/agent/terminal.ts")}`,
  );
}

export async function agentTouchRoute(page, browserName) {
  await page.setViewportSize({ width: 1024, height: 768 });
  const input = page.locator(".agent-screen textarea");
  await input.focus();
  await page.keyboard.type("i=0; while [ $i -lt 800 ]; do echo HISTORY-$i; i=$((i+1)); done");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.testTerminal.buffer.active.length > 750);
  // Actual wheel delivery through Ghostty must scroll output without sending
  // Up/Down to the PTY (which cycles the harness's prompt history).
  await page.evaluate(() => {
    window.agentWheelInput = [];
    window.agentWheelSubscription = window.testTerminal.onData((data) =>
      window.agentWheelInput.push(data),
    );
  });
  const canvasBounds = await page.locator(".agent-screen canvas").boundingBox();
  await page.mouse.move(canvasBounds.x + 40, canvasBounds.y + 40);
  await page.mouse.wheel(0, -240);
  await page.waitForFunction(() => window.testTerminal.getViewportY() > 3);
  await page.mouse.wheel(0, 240);
  await page.waitForFunction(() => window.testTerminal.getViewportY() === 0);
  assert.deepEqual(await page.evaluate(() => window.agentWheelInput), []);
  await page.evaluate(() => window.agentWheelSubscription.dispose());
  await page.getByRole("button", { name: "Collapse agent terminal", exact: true }).focus();
  const documentBefore = await page.evaluate(() =>
    JSON.stringify(window.makeshiftInspect().document),
  );
  let cdp;
  if (browserName === "chromium") cdp = await page.context().newCDPSession(page);

  for (const side of ["right", "bottom"]) {
    assert.equal(await page.locator(".agent-dock").getAttribute("data-side"), side);
    const before = await page.evaluate(() => window.testTerminal.getViewportY());
    await swipe(page, cdp, 100);
    const back = await page.evaluate(() => window.testTerminal.getViewportY());
    assert(back > before + 3, `${browserName} ${side}: finger scrolls history`);
    assert.equal(await input.evaluate((element) => document.activeElement === element), false);
    await swipe(page, cdp, -60);
    assert((await page.evaluate(() => window.testTerminal.getViewportY())) < back - 2);
    const collapse = page.getByRole("button", { name: "Collapse agent terminal" });
    const bounds = await collapse.boundingBox();
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 768);
    await collapse.click();
    await page.getByRole("button", { name: "Expand agent terminal" }).click();
    if (side === "right")
      await page.getByRole("button", { name: "Change agent dock position" }).click();
  }
  // PTY output must not snap a reader back to the bottom.
  const offset = await page.evaluate(() => window.testTerminal.getViewportY());
  await page.evaluate(() =>
    window.makeshiftAgent.request({ kind: "write", data: "echo MORE-HISTORY\r" }),
  );
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => window.testTerminal.getViewportY())) >= offset);
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document)),
    documentBefore,
  );
  const canvas = await page.locator(".agent-screen canvas").boundingBox();
  await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  assert.equal(await input.evaluate((element) => document.activeElement === element), true);
  await page.setViewportSize({ width: 768, height: 420 });
  await page.getByRole("button", { name: "Collapse agent terminal" }).click();
  await page.getByRole("button", { name: "Expand agent terminal" }).click();
  await page.getByRole("button", { name: "Change agent dock position" }).click();
  await page.setViewportSize({ width: 1280, height: 850 });
  await cdp?.detach();
  console.log(
    `PASS ${browserName}: wheel scroll without PTY input, touch scrolling both docks, retained reading position, reachable collapse and small viewport`,
  );
}

async function swipe(page, cdp, distance) {
  const box = await page.locator(".agent-screen canvas").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 - distance / 2;
  for (let step = 0; step <= 10; step++) {
    const currentY = y + (distance * step) / 10;
    if (cdp) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: step === 0 ? "touchStart" : "touchMove",
        touchPoints: [{ x, y: currentY }],
      });
    } else {
      // Playwright WebKit has no touch-drag API; dispatch TouchEvents through
      // the actual canvas listeners. Chromium above uses browser input.
      await page.locator(".agent-screen canvas").evaluate(
        (canvas, point) => {
          const touch = { identifier: 1, target: canvas, clientX: point.x, clientY: point.y };
          const event = new Event(point.start ? "touchstart" : "touchmove", {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperties(event, {
            touches: { value: [touch] },
            changedTouches: { value: [touch] },
          });
          canvas.dispatchEvent(event);
        },
        { x, y: currentY, start: step === 0 },
      );
    }
  }
  if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else
    await page
      .locator(".agent-screen canvas")
      .dispatchEvent("touchend", { touches: [], changedTouches: [] });
}
