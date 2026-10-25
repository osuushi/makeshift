import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

/** Separate wheel tasks and a held GPU fence reproduce the lag hidden by a synchronous burst. */
export async function cameraPacingRoute(page, name) {
  await page.waitForFunction(() => !window.makeshiftInspect().camera.moving);
  const before = await inspect(page);
  const result = await page.evaluate(async () => {
    const { BodyXrayComposite } = await import("/body-xray-composite.ts");
    const { ModelClient } = await import("/model-client.ts");
    const proto = WebGL2RenderingContext.prototype;
    const wait = proto.clientWaitSync,
      render = BodyXrayComposite.prototype.render;
    const flush = ModelClient.prototype.flushSelection;
    let blocked = true,
      presented = 0,
      syncs = 0;
    proto.clientWaitSync = function (...args) {
      return blocked ? this.TIMEOUT_EXPIRED : wait.apply(this, args);
    };
    BodyXrayComposite.prototype.render = function (...args) {
      presented++;
      return render.apply(this, args);
    };
    ModelClient.prototype.flushSelection = function (...args) {
      syncs++;
      return flush.apply(this, args);
    };
    try {
      const canvas = document.querySelector("canvas");
      for (let i = 0; i < 40; i++) {
        canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 1, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 4));
      }
      const during = presented;
      const pending = window.makeshiftInspect().camera.moving;
      blocked = false;
      const deadline = performance.now() + 3000;
      while (window.makeshiftInspect().camera.moving && performance.now() < deadline)
        await new Promise(requestAnimationFrame);
      const drained = presented;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { during, pending, drained, final: presented, syncs, height: canvas.clientHeight };
    } finally {
      proto.clientWaitSync = wait;
      BodyXrayComposite.prototype.render = render;
      ModelClient.prototype.flushSelection = flush;
    }
  });
  assert.equal(result.during, 0, "No frames submitted behind an unfinished GPU frame");
  assert.equal(result.pending, true);
  assert.equal(
    result.drained,
    1,
    "Only the latest camera state is painted when the GPU catches up",
  );
  assert.equal(result.final, 1, "No stale-frame tail");
  assert.ok(result.syncs <= 1, `Pan expiration must not echo per event: ${result.syncs}`);
  const after = await inspect(page);
  const distance = Math.hypot(...after.camera.target.map((v, i) => v - before.camera.target[i]));
  assert.ok(
    Math.abs(distance - (40 * before.camera.height) / result.height) < 1e-8,
    "All wheel deltas survive presentation coalescing",
  );
  assert.deepEqual(after.document, before.document);
  const canvas = await page.locator("canvas").boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(8, 0);
  await page.waitForFunction(() => !window.makeshiftInspect().camera.moving);
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  console.log(
    `${name}: 40 separate wheel events retain every delta, one latest GPU frame, no tail; real wheel and face picking pass`,
    result,
  );
}
