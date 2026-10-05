import assert from "node:assert/strict";

/** A correction started while already hovering must freeze at the next real press. */
export async function pressedCardDom(page, name) {
  const point = await page.evaluate(async () => {
    const { WidgetClearance } = await import("/widget-clearance.js");
    const root = document.querySelector("#root");
    root.innerHTML = `<div id="pressed-card" style="position:absolute;left:360px;top:280px;width:240px;height:70px;display:flex;gap:8px;padding:12px;pointer-events:auto;background:white"><input style="width:70px"><button>Accept</button><button>Cancel</button></div>`;
    const card = root.querySelector("#pressed-card"),
      button = card.querySelector("button"),
      placement = new WidgetClearance(root),
      controller = new AbortController();
    const fixture = { card, button, placement, controller, clicks: 0, press: null };
    button.addEventListener("click", () => fixture.clicks++);
    window.addEventListener(
      "pointerdown",
      (event) => {
        const rect = button.getBoundingClientRect();
        fixture.press = {
          target: event.target === button,
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          pointer: { x: event.clientX, y: event.clientY },
        };
      },
      { capture: true, signal: controller.signal },
    );
    window.pressedCardFixture = fixture;
    placement.fit([card]);
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  try {
    await page.locator("#pressed-card input").focus();
    await page.mouse.move(point.x, point.y);
    await page.evaluate(() => {
      const { card } = window.pressedCardFixture;
      card.style.transition = "translate 700ms linear";
      card.style.translate = "60px 0px";
      card.getBoundingClientRect();
    });
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    await page.mouse.down();
    const frames = await page.evaluate(async () => {
      const { button, press } = window.pressedCardFixture,
        frames = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(requestAnimationFrame);
        const rect = button.getBoundingClientRect();
        frames.push({
          target: press.target,
          dx: rect.x + rect.width / 2 - press.x,
          dy: rect.y + rect.height / 2 - press.y,
          hit: button.contains(document.elementFromPoint(press.pointer.x, press.pointer.y)),
        });
      }
      return frames;
    });
    for (const frame of frames) {
      assert.equal(frame.target && frame.hit, true, `${name}: press retains the Accept target`);
      assert.ok(Math.abs(frame.dx) < 0.01 && Math.abs(frame.dy) < 0.01, JSON.stringify(frame));
    }
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.pressedCardFixture.clicks), 1);
    console.log(
      `${name}: already-hovered card correction freezes at real press and delivers Accept`,
    );
  } finally {
    await page.mouse.up();
    await page.evaluate(() => {
      window.pressedCardFixture.controller.abort();
      window.pressedCardFixture.placement.dispose();
      delete window.pressedCardFixture;
    });
  }
}
