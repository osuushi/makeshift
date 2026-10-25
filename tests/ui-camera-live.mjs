import assert from "node:assert/strict";

/** A GPU retry must not wait for wheel input to become idle before presenting. */
export async function continuousCameraRoute(page, name) {
  await page.waitForFunction(() => !window.makeshiftInspect().camera.moving);
  const canvas = await page.locator("canvas").boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.evaluate(async () => {
    const { BodyXrayComposite } = await import("/body-xray-composite.ts");
    const proto = WebGL2RenderingContext.prototype;
    const wait = proto.clientWaitSync,
      render = BodyXrayComposite.prototype.render;
    const start = performance.now();
    const frames = [];
    // Native automation often delivers only one packet per display frame. Add
    // high-rate packets to keep a camera RAF pending when the older GPU retry runs.
    const input = setInterval(
      () =>
        document
          .querySelector("canvas")
          .dispatchEvent(new WheelEvent("wheel", { deltaX: 0.05, cancelable: true })),
      2,
    );
    proto.clientWaitSync = function (...args) {
      // Seed a pending retry, then use the real GPU while scrolling continues.
      return performance.now() - start < 100 ? this.TIMEOUT_EXPIRED : wait.apply(this, args);
    };
    BodyXrayComposite.prototype.render = function (world, ...args) {
      frames.push({ time: performance.now() - start, target: world.target.toArray() });
      return render.call(this, world, ...args);
    };
    window.stopContinuousCameraProbe = () => {
      clearInterval(input);
      proto.clientWaitSync = wait;
      BodyXrayComposite.prototype.render = render;
      return { frames, elapsed: performance.now() - start };
    };
  });
  let result;
  try {
    // Native wheel packets keep input active over many display frames.
    const start = Date.now();
    while (Date.now() - start < 1600) await page.mouse.wheel(1, 0);
  } finally {
    result = await page.evaluate(() => {
      const result = window.stopContinuousCameraProbe();
      delete window.stopContinuousCameraProbe;
      return result;
    });
  }
  const middle = result.frames.filter(({ time }) => time > 150 && time < result.elapsed - 100);
  assert.ok(
    middle.length >= 8,
    `Sustained scrolling must render while input continues: ${JSON.stringify(result)}`,
  );
  assert.ok(
    new Set(middle.map(({ target }) => String(target))).size >= 8,
    "Intermediate camera positions must reach the GPU, not just the final settled view",
  );
  const times = [150, ...middle.map(({ time }) => time), result.elapsed - 100];
  const maxGap = Math.max(...times.slice(1).map((time, i) => time - times[i]));
  assert.ok(maxGap < 400, `Rendering stalled for ${maxGap.toFixed(1)} ms during continuous input`);
  await page.waitForFunction(() => !window.makeshiftInspect().camera.moving);
  console.log(
    `${name}: live wheel rendering: ${middle.length} intermediate frames, longest gap ${maxGap.toFixed(1)} ms`,
  );
}
