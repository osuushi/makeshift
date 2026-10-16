import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { setViewDisplay, viewDisplay } from "../src/preferences/view-display.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import type { World } from "../src/sketch/world.js";
import { XrayComposite } from "../src/sketch/xray-composite.js";

// Count submitted work without a GPU. Pixel equivalence stays in xray-vision-ui.
function harness() {
  let target: THREE.WebGLRenderTarget | null = null;
  const size = new THREE.Vector2(800, 600);
  let ratio = 1;
  const passes: string[] = [];
  const sizes: number[][] = [];
  const renderer = {
    autoClear: true,
    clear: (color: boolean, depth: boolean, stencil: boolean) => {
      assert.deepEqual([color, depth, stencil], [false, true, true]);
    },
    clippingPlanes: [new THREE.Plane()],
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
      target = next;
    },
    getDrawingBufferSize: (out: THREE.Vector2) => out.copy(size),
    getPixelRatio: () => ratio,
    getContext: () => ({ TEXTURE0: 0 }),
    state: { activeTexture: () => {} },
    copyFramebufferToTexture: () => passes.push("copy"),
    render: (scene: THREE.Scene) => {
      if (target) sizes.push([target.width, target.height]);
      const material = (scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
      passes.push(
        material.uniforms?.stepSize ? "blur" : material.uniforms?.normalImage ? "mix" : "mask",
      );
      if (!target) assert.equal(renderer.autoClear, false, "Preserve cut framebuffer for mixing");
    },
  };
  const source = { sketches: [emptySketch(planes.XY)], visibility: "", visible: () => true };
  const camera = new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const world = {
    renderer,
    camera,
    partialSection: planes.XY,
    activeFrame: null,
    canvas: { clientWidth: 800, clientHeight: 600 },
    height: 60,
    xraySource: () => source,
  } as unknown as World;
  const composite = new XrayComposite();
  return {
    world,
    sizes,
    source,
    size,
    composite,
    ratio: (next: number) => {
      ratio = next;
    },
    frame: () => {
      passes.length = 0;
      sizes.length = 0;
      const clipping = renderer.clippingPlanes;
      composite.render(
        world,
        () => passes.push("normal"),
        () => passes.push("cut"),
      );
      assert.equal(renderer.autoClear, true);
      assert.equal(renderer.clippingPlanes, clipping);
      assert.equal(target, null);
      return [...passes];
    },
  };
}

test("X-ray reuses stationary aperture, skips zero-radius blur and invalidates every mask input", () => {
  const original = viewDisplay();
  const h = harness();
  const cached = ["normal", "copy", "cut", "mix"];
  const rebuilt = ["normal", "copy", "cut", "mask", "blur", "blur", "mix"];
  try {
    setViewDisplay({ ...original, xrayRadius: 50 });
    assert.deepEqual(h.frame(), rebuilt);
    assert.deepEqual(h.sizes, [
      [100, 75],
      [100, 75],
      [100, 75],
    ]);
    assert.deepEqual(h.frame(), cached);
    setViewDisplay({ ...viewDisplay(), sectionFrontOpacity: 0.3 });
    assert.deepEqual(h.frame(), cached, "Body appearance does not change aperture");
    setViewDisplay({ ...viewDisplay(), xrayRadius: 20 });
    assert.deepEqual(h.frame(), ["normal", "copy", "cut", "blur", "blur", "mix"]);
    for (const change of [
      () => h.composite.invalidate(),
      () => {
        h.source.sketches = [emptySketch(planes.XY)];
      },
      () => {
        h.source.visibility = "hidden";
      },
      () => {
        h.world.camera.position.x++;
        h.world.camera.updateMatrixWorld();
      },
      () => {
        h.world.camera.zoom = 2;
        h.world.camera.updateProjectionMatrix();
      },
      () => {
        h.world.partialSection = planes.XZ;
      },
      () => {
        h.size.set(1600, 1200);
        h.ratio(2);
      },
      () => {
        setViewDisplay({ ...viewDisplay(), xrayBleed: 20 });
      },
    ]) {
      change();
      assert.deepEqual(h.frame(), rebuilt);
      assert.deepEqual(h.frame(), cached);
    }
    setViewDisplay({ ...viewDisplay(), xrayRadius: 0 });
    assert.deepEqual(h.frame(), ["normal", "copy", "cut", "mask", "mix"]);
    assert.deepEqual(h.sizes, [[1600, 1200]], "Sharp masks retain physical resolution");
    h.source.visibility = "shown";
    assert.deepEqual(h.frame(), ["normal", "copy", "cut", "mask", "mix"]);
  } finally {
    h.composite.dispose();
    setViewDisplay(original);
  }
});

test("Narrow margins and odd viewport sizes keep sufficient mask coverage", () => {
  const original = viewDisplay();
  const h = harness();
  h.size.set(803, 607);
  try {
    for (const [bleed, radius, width, height] of [
      [16, 16, 101, 76],
      [8, 16, 201, 152],
      [16, 4, 402, 304],
      [0, 50, 803, 607],
      [50, 0, 803, 607],
    ]) {
      setViewDisplay({ ...original, xrayBleed: bleed, xrayRadius: radius });
      h.frame();
      assert.deepEqual(h.sizes[0], [width, height]);
    }
  } finally {
    h.composite.dispose();
    setViewDisplay(original);
  }
});
