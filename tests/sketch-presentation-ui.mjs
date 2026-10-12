import assert from "node:assert/strict";
import { installPenClassification, penDriver } from "./ipad-pen.mjs";
import { at, inspect, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Escaped tablet latency: event bursts rendered full-resolution X-ray passes even
// in an empty workspace. Only actual input + GPU submission can catch this boundary.
await withUiRuntimes(
  async (page, name) => {
    await installPenClassification(page);
    await page.reload();
    await settled(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await chooseTool(page, "line", "line");
    const toggle = page.getByRole("button", { name: "Snap to grid", exact: true });
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    await settled(page);
    const stats = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const gl = canvas.getContext("webgl2");
      let draws = 0,
        copies = 0;
      const draw = gl.drawElements,
        copy = gl.copyTexSubImage2D;
      gl.drawElements = function (...args) {
        draws++;
        return draw.apply(this, args);
      };
      gl.copyTexSubImage2D = function (...args) {
        copies++;
        return copy.apply(this, args);
      };
      try {
        for (let i = 0; i < 12; i++)
          canvas.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerId: 1,
              pointerType: "pen",
              clientX: 300 + i * 20,
              clientY: 400,
            }),
          );
        const synchronous = draws;
        await new Promise(requestAnimationFrame);
        return { synchronous, draws, copies };
      } finally {
        gl.drawElements = draw;
        gl.copyTexSubImage2D = copy;
      }
    });
    assert.equal(stats.synchronous, 0, "Pointer bursts must not draw before the next frame");
    assert.ok(
      stats.draws > 0 && stats.draws < 7,
      `One ordinary sketch frame: ${JSON.stringify(stats)}`,
    );
    assert.equal(stats.copies, 0, "Planar-only sketches require no X-ray framebuffer copies");

    // Real pointer delivery and real solving: frame batching must not lose release
    // coordinates or change acceptance/Undo. Fractional endpoints prove grid is off.
    const from = { x: -17.31, y: -13.27 },
      to = { x: 21.43, y: 16.19 };
    const a = await at(page, from.x, from.y),
      b = await at(page, to.x, to.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 24 });
    await page.mouse.up();
    const state = await inspect(page);
    const curves = state.document.sketches[0].curves;
    assert.equal(curves.length, 1);
    const line = curves[0];
    assert.equal(line.kind, "segment");
    for (const [actual, expected] of [
      [line.a, from],
      [line.b, to],
    ])
      assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.15);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.sketches.flatMap((s) => s.curves).length, 0);
    await pencilLine(page, name, from, to);
    await chooseTool(page, "Toggle grid snapping", "grid");
    assert.equal(
      await toggle.getAttribute("aria-pressed"),
      "true",
      "Search command and button agree",
    );
    console.log(
      `${name}: frame batching, planar X-ray bypass, unsnapped line and Undo pass`,
      stats,
    );
  },
  {
    allowed: ["chromium", "webkit", "electron"],
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 2,
  },
);

async function pencilLine(page, name, from, to) {
  await chooseTool(page, "line", "line");
  const cdp = name === "webkit" ? null : await page.context().newCDPSession(page);
  try {
    const pen = await penDriver(page, cdp);
    const a = await at(page, from.x, from.y),
      b = await at(page, to.x, to.y);
    await page.evaluate(() => {
      window.addEventListener(
        "pointerdown",
        (event) => {
          window.testSketchPointerId = event.pointerId;
        },
        { once: true },
      );
    });
    await pen.down(a);
    await page.waitForFunction(() => window.makeshiftInspect().interaction?.kind === "pointer");
    const draws = await page.evaluate(
      ({ a, b }) => {
        const canvas = document.querySelector("canvas"),
          gl = canvas.getContext("webgl2");
        const original = gl.drawElements;
        let count = 0;
        gl.drawElements = function (...args) {
          count++;
          return original.apply(this, args);
        };
        try {
          for (let i = 1; i <= 12; i++)
            canvas.dispatchEvent(
              new PointerEvent("pointermove", {
                bubbles: true,
                pointerId: window.testSketchPointerId,
                pointerType: "pen",
                buttons: 1,
                clientX: a.x + ((b.x - a.x) * i) / 12,
                clientY: a.y + ((b.y - a.y) * i) / 12,
              }),
            );
          return count;
        } finally {
          gl.drawElements = original;
        }
      },
      { a, b },
    );
    assert.equal(draws, 0, "Captured Pencil bursts also wait for the presentation frame");
    await pen.move(b);
    await pen.up(b);
    const line = (await inspect(page)).document.sketches[0].curves[0];
    assert.equal(line.kind, "segment");
    assert.ok(Math.hypot(line.b.x - to.x, line.b.y - to.y) < 0.15);
  } finally {
    await cdp?.detach();
  }
}
