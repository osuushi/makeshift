import assert from "node:assert/strict";

// The real editor must retain mask inputs across redraws; unit doubles cannot
// detect accidental display-array churn that would defeat the compositor cache.
export async function assertCachedXrayWork(page, scale = 1) {
  const frames = await page.evaluate(async (scale) => {
    const { XrayComposite } = await import("/xray-composite.ts");
    const original = XrayComposite.prototype.render;
    const mode = window.makeshiftTestFrameMode;
    const frames = [];
    XrayComposite.prototype.render = function (world, normal, cut) {
      if (!frames.length) this.invalidate();
      const renderer = world.renderer;
      const render = renderer.render;
      const copy = renderer.copyFramebufferToTexture;
      const work = { copies: 0, blur: 0, mask: 0, maskSize: null, expectedSize: null };
      renderer.render = function (scene, camera) {
        const material = scene.children[0]?.material;
        if (material?.uniforms?.stepSize) work.blur++;
        if (
          scene.background?.isColor &&
          scene.children.length === 2 &&
          scene.children[1]?.isLineSegments2
        ) {
          work.mask++;
          const target = renderer.getRenderTarget();
          work.maskSize = [target.width, target.height];
          work.expectedSize = [
            Math.ceil(world.canvas.width / scale),
            Math.ceil(world.canvas.height / scale),
          ];
        }
        return render.call(this, scene, camera);
      };
      renderer.copyFramebufferToTexture = function (...args) {
        work.copies++;
        return copy.apply(this, args);
      };
      try {
        return original.call(this, world, normal, cut);
      } finally {
        renderer.render = render;
        renderer.copyFramebufferToTexture = copy;
        frames.push(work);
      }
    };
    try {
      window.makeshiftTestFrameMode = "on-demand";
      window.dispatchEvent(new Event("makeshift-test-frame"));
      window.dispatchEvent(new Event("makeshift-test-frame"));
      return frames;
    } finally {
      window.makeshiftTestFrameMode = mode;
      XrayComposite.prototype.render = original;
    }
  }, scale);
  assert.equal(frames.length, 2, "Both requested frames use local X-ray");
  assert.equal(frames[0].mask, 1, "The invalidated frame redraws its aperture");
  assert.equal(frames[0].blur, scale === 1 ? 0 : 2);
  assert.deepEqual(
    frames[0].maskSize,
    frames[0].expectedSize,
    "Mask resolution matches its margins",
  );
  assert.deepEqual(
    frames[1],
    { copies: 1, blur: 0, mask: 0, maskSize: null, expectedSize: null },
    "Stable frames reuse aperture pixels",
  );
}
