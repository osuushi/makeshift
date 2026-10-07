import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { runtimeNames } from "./ui-runtime.mjs";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { port: 0, watch: null, hmr: false },
});
await server.listen();
try {
  for (const name of runtimeNames(["chromium", "webkit"])) {
    const browser = await { chromium, webkit }[name].launch({ headless: true });
    try {
      const page = await browser.newPage();
      const setup = async () => {
        await page.goto(`${server.resolvedUrls.local[0]}tests/preview-empty.html`);
        await page.evaluate(async () => {
          const THREE = await import("/node_modules/three/build/three.module.js");
          const { installSettings } = await import("/src/preferences/settings.ts");
          const { createGrids } = await import("/src/sketch/world-grid.ts");
          const { installPlaneTargets } = await import("/src/sketch/plane-targets.ts");
          document.body.innerHTML = "<main><header></header><canvas></canvas></main>";
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera();
          camera.position.set(0, 0, 50);
          camera.updateMatrixWorld();
          const grids = createGrids(scene);
          const world = {
            scene,
            camera,
            canvas: document.querySelector("canvas"),
            changed: new Set(),
            active: null,
            selectedPlane: null,
            planeBounds: () => ({ minX: -10, maxX: 10, minY: -10, maxY: 10 }),
            draw() {
              grids.update(camera, new THREE.Vector3(), 100, null, 650);
              for (const listener of this.changed) listener();
            },
            requestDraw() {
              this.draw();
            },
          };
          installPlaneTargets(
            world,
            document.body,
            () => false,
            () => {},
          );
          installSettings(
            { world, blocked: false, interactions: { current: null } },
            document.querySelector("main"),
          );
          world.draw();
          window.opacitySnapshot = () => ({
            planes: scene.children
              .filter((mesh) => mesh.userData.planeTarget)
              .map((mesh) => mesh.material.opacity),
            grids: scene.children
              .filter((mesh) => mesh.material.uniforms)
              .map((mesh) => mesh.material.uniforms.opacityScale.value),
          });
        });
        await page.getByRole("button", { name: "Application settings" }).click();
      };
      await setup();
      const planes = page.getByRole("slider", { name: "Canonical planes opacity" });
      const grid = page.getByRole("slider", { name: "Grid opacity", exact: true });
      assert.equal(await planes.inputValue(), "22.4");
      assert.equal(await grid.inputValue(), "40");
      await planes.press("Home");
      await grid.press("End");
      assert.deepEqual(await page.evaluate(() => window.opacitySnapshot()), {
        planes: [0, 0, 0],
        grids: [2.5, 2.5, 2.5, 1],
      });
      await setup();
      assert.equal(await planes.inputValue(), "0");
      assert.equal(await grid.inputValue(), "100");
      await grid.press("Home");
      assert.deepEqual(
        (await page.evaluate(() => window.opacitySnapshot())).grids.slice(0, 3),
        [0, 0, 0],
      );
      await page.getByRole("button", { name: "Reset viewport opacity" }).click();
      assert.equal(await planes.inputValue(), "22.4");
      assert.equal(await grid.inputValue(), "40");
      assert.deepEqual(
        (await page.evaluate(() => window.opacitySnapshot())).planes,
        [0.224, 0.224, 0.224],
      );
      console.log(
        `${name}: Settings keyboard sliders, renderer updates, reload persistence and reset passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
