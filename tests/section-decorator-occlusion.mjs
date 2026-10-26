import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

// GPU regression: cap parity must include hidden decorator supports, and only
// material (never holes or space outside the body) may hide a preview.
const server = await createServer({
  configFile: false,
  optimizeDeps: { include: ["three"] },
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
  plugins: [
    {
      name: "section-test-three",
      resolveId: (id) => (id === "/section-test-three" ? id : undefined),
      load: (id) => (id === "/section-test-three" ? 'export * from "three";' : undefined),
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async () => {
    const THREE = await import("/section-test-three");
    const { SectionCaps } = await import("/src/model/section-caps.ts");
    const { DecoratorPreviewCompositor } = await import("/src/decorators/preview-compositor.ts");
    const renderer = new THREE.WebGLRenderer({ stencil: true, preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("white");
    const light = new THREE.AmbientLight("white", 3);
    light.layers.enable(2);
    scene.add(light);
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    const shape = new THREE.Shape();
    shape.moveTo(-1.5, -1.5);
    shape.lineTo(1.5, -1.5);
    shape.lineTo(1.5, 1.5);
    shape.lineTo(-1.5, 1.5);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.5, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
    geometry.translate(0, 0, -1);
    const support = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    support.userData.bodyFace = { body: "body" };
    support.userData.decoratorFace = "body/face";
    scene.add(support);
    const compositor = new DecoratorPreviewCompositor();
    const preview = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), compositor.previewMaterial());
    preview.position.z = -0.5;
    preview.layers.set(2);
    scene.add(preview);
    const caps = new SectionCaps();
    const world = {
      scene,
      camera,
      renderer,
      crossSection: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
    };
    const pixel = (x) => {
      const gl = renderer.getContext();
      const data = new Uint8Array(4);
      gl.readPixels(x, 67, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return [...data];
    };
    const render = (occlude) => {
      renderer.render(scene, camera);
      caps.render(world);
      const before = pixel(96);
      compositor.render(
        renderer,
        scene,
        camera,
        [{ mesh: preview, faces: new Set(["body/face"]), displayOpacity: 1 }],
        occlude ? () => caps.render(world, true) : undefined,
      );
      return { before, material: pixel(96), hole: pixel(64), outside: pixel(120) };
    };
    const old = render(false);
    const fixed = render(true);
    caps.dispose();
    compositor.dispose();
    geometry.dispose();
    support.material.dispose();
    preview.geometry.dispose();
    preview.material.dispose();
    renderer.dispose();
    return { old, fixed };
  });
  assert.notDeepEqual(result.old.material, result.old.before, "Control reproduces bleed-through");
  assert.deepEqual(result.fixed.material, result.fixed.before, "Section material hides preview");
  assert.deepEqual(result.fixed.hole, result.old.hole, "Hole preserves preview visibility");
  assert.deepEqual(result.fixed.outside, result.old.outside, "Outside preview remains visible");
  assert.notDeepEqual(result.fixed.hole, [255, 255, 255, 255]);
  console.log("Section/decorator GPU occlusion passed", result);
} finally {
  await browser?.close();
  await server.close();
}
