import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function measureCard({ css, factor, narrow }) {
  document.body.innerHTML = `<canvas></canvas><div class="revolve-controls"><div class="revolve-options" style="left:1110px;top:470px"></div></div>`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  document.documentElement.style.setProperty("--ui-scale", String(factor));
  const root = document.querySelector(".revolve-controls"),
    card = root.querySelector(".revolve-options");
  for (const label of ["Union", "Subtract", "Intersect", "New body", "Cleanup", "Axis", "Accept"]) {
    const button = document.createElement("button");
    button.setAttribute("aria-label", label);
    if (label === "Cleanup") {
      button.className = "commit-cleanup";
      button.textContent = "✓ Clean up";
    } else button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg>';
    card.append(button);
  }
  const { WidgetClearance } = await import("/widget-clearance.js"),
    placement = new WidgetClearance(root);
  const rect = (element) => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const hit = (button) => {
    const r = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  };
  if (narrow) document.querySelector("canvas").style.width = "240px";
  placement.fit([card]);
  const first = rect(card),
    buttons = [...card.querySelectorAll("button")],
    children = buttons.map((button) => ({
      label: button.getAttribute("aria-label"),
      ...rect(button),
      hit: hit(button),
    }));
  const frames = [];
  for (let i = 0; i < 100; i++) {
    placement.fit([card]);
    frames.push({
      rect: rect(card),
      childClear: buttons.every((button) => {
        const r = rect(button);
        return r.x >= 7.9 && r.y >= 7.9 && r.right <= 1272.1 && r.bottom <= 792.1 && hit(button);
      }),
    });
  }
  const repeated = rect(card),
    reachable = [];
  if (narrow)
    for (const button of buttons) {
      card.scrollLeft = button.offsetLeft + button.offsetWidth / 2 - card.clientWidth / 2;
      reachable.push({ label: button.getAttribute("aria-label"), hit: hit(button) });
    }
  const state = {
    factor,
    narrow,
    first,
    repeated,
    frames,
    children,
    reachable,
    overflow: getComputedStyle(card).overflow,
    scrollWidth: card.scrollWidth,
    clientWidth: card.clientWidth,
    fit: card.dataset.widgetFit,
  };
  placement.dispose();
  style.remove();
  return state;
}

export async function cardFootprintDom(page, name) {
  const source = (
    await Promise.all(
      ["sketch/style.css", "model/cleanup.css", "model/revolve.css"].map((path) =>
        readFile(new URL(`../src/${path}`, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
  // Match the authored-length scaling contract without merging the scale branch.
  const css = source
    .replace(/@import[^;]+;/g, "")
    .replace(/(-?\d*\.?\d+)px/g, "calc($1px * var(--ui-scale,1))");
  const states = [];
  for (const factor of [0.8, 1, 1.5])
    for (const narrow of [false, true]) {
      await page.setViewportSize({ width: 1280, height: 800 });
      states.push(await page.evaluate(measureCard, { css, factor, narrow }));
    }
  console.log(
    `${name}: production Revolve card/child/scrolled footprints ${JSON.stringify(states.map(({ factor, narrow, first, repeated, reachable }) => ({ factor, narrow, first, repeated, reachable })))}`,
  );
  for (const state of states) {
    assert.equal(state.fit, "clear");
    // Use the existing actual CSS stationarity contract, including the maximum
    // delta across all refreshes; browser serialization is not exact arithmetic.
    for (const frame of state.frames)
      for (const key of Object.keys(state.first))
        assert.ok(Math.abs(frame.rect[key] - state.first[key]) < 0.01, JSON.stringify(state));
    const width = state.narrow ? 240 : 1280;
    assert.ok(state.first.x >= 7.9 && state.first.right <= width - 7.9);
    if (state.narrow) {
      assert.equal(state.overflow, "auto");
      assert.ok(state.scrollWidth > state.clientWidth);
      assert.ok(
        state.reachable.every((button) => button.hit),
        JSON.stringify(state),
      );
    } else {
      assert.equal(state.overflow, "visible");
      assert.ok(
        state.frames.every((frame) => frame.childClear),
        JSON.stringify(state),
      );
      assert.ok(
        state.children.every(
          (button) =>
            button.x >= 7.9 &&
            button.y >= 7.9 &&
            button.right <= width - 7.9 &&
            button.bottom <= 792.1 &&
            button.hit,
        ),
        JSON.stringify(state),
      );
    }
  }
}
