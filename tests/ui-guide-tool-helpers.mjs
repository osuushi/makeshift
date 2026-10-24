import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { inspect } from "./ui-helpers.mjs";

/** Hold completion after real native work, so pointer-up loses capture while still pending. */
export async function holdGuideSettling(page) {
  const path = fileURLToPath(new URL("../src/model/preview-runner.ts", import.meta.url));
  await page.evaluate(
    async (url) => {
      const { PreviewRunner } = await import(url);
      const settle = PreviewRunner.prototype.settle;
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      window.guideSettling = {
        reached: false,
        release: () => {
          PreviewRunner.prototype.settle = settle;
          release();
        },
      };
      PreviewRunner.prototype.settle = async function () {
        await settle.call(this);
        window.guideSettling.reached = true;
        await held;
        await settle.call(this);
      };
    },
    `/@fs/${path.replaceAll("\\", "/").replace(/^\/+/, "")}`,
  );
}

export async function releaseGuideSettling(page) {
  await page.evaluate(() => window.guideSettling.release());
}

export async function beginDrag(page) {
  const marker = page.locator('.guide-marker[title^="Handle"]');
  const box = await marker.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}
export async function pointerTo(page, xyz) {
  const { camera } = await inspect(page),
    box = await page.locator("canvas").boundingBox();
  const h = camera.height / 2,
    w = (h * box.width) / box.height;
  const view = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const p = new THREE.Vector3(...xyz).project(view);
  await page.mouse.move(box.x + ((p.x + 1) * box.width) / 2, box.y + ((1 - p.y) * box.height) / 2, {
    steps: 5,
  });
}
export async function waitLock(page, point) {
  await page.waitForFunction((p) => {
    const value = document.querySelector(".guide-move-vector")?.getAttribute("data-end");
    return value && Math.hypot(...JSON.parse(value).map((v, i) => v - p[i])) < 1e-7;
  }, point);
}
export async function assertPreview(page, before, id, volume) {
  await page.waitForFunction(
    ({ id, volume }) => {
      const state = window.makeshiftInspect();
      return (
        !state.busy &&
        Math.abs((state.preview?.bodies?.find((b) => b.id === id)?.volume ?? 0) - volume) < 1e-5
      );
    },
    { id, volume },
  );
  assert.deepEqual((await inspect(page)).document, before);
}
