import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

/** Verify readable arrows and geometric placement during actual navigation. */
export async function orientableArrowViews(page, handle, root, normal, name, _section = null) {
  const original = (await inspect(page)).document;
  const canonical = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const n = new THREE.Vector3(...normal);
  const reference = canonical.reduce((a, b) =>
    Math.abs(n.dot(new THREE.Vector3().fromArray(a))) <= Math.abs(n.dot(new THREE.Vector3(...b)))
      ? a
      : b,
  );
  const width = new THREE.Vector3(...reference)
    .addScaledVector(n, -n.dot(new THREE.Vector3(...reference)))
    .normalize();
  async function check() {
    const { camera: state } = await inspect(page);
    const camera = new THREE.PerspectiveCamera();
    camera.position.fromArray(state.position);
    camera.up.fromArray(state.up);
    camera.lookAt(new THREE.Vector3(...state.target));
    const inverse = camera.quaternion.clone().invert();
    const u = n.clone().applyQuaternion(inverse);
    const placementWidth = width.clone().applyQuaternion(inverse);
    const frame = await measuredWidgetFrame(handle, root);
    assert.ok(Math.abs(frame.width - 64) < 1e-3);
    assert.ok(Math.abs(frame.height - 64) < 1e-3);
    // The rendered target may move clear of panels; its projected local frame
    // must still match exactly after removing that measured display correction.
    assert.ok(
      Math.abs(
        frame.x + 32 - frame.correction.x - frame.anchor.x - u.x * 48 - placementWidth.x * 32,
      ) < 0.1,
      JSON.stringify(frame),
    );
    assert.ok(
      Math.abs(
        frame.y + 32 - frame.correction.y - frame.anchor.y + u.y * 48 + placementWidth.y * 32,
      ) < 0.1,
      JSON.stringify(frame),
    );
    const paths = await handle.locator("svg path").evaluateAll((elements) =>
      elements.map((p) => ({
        d: p.getAttribute("d"),
        stroke: p.getAttribute("stroke"),
        width: p.getAttribute("stroke-width"),
      })),
    );
    assert.ok(paths.length >= 6, "A tool-specific contour accompanies the drag arrow");
    paths.forEach((p, i) => {
      assert.equal(p.stroke, i < paths.length / 2 ? "#151515" : "#fff");
      assert.equal(p.width, i < paths.length / 2 ? "7" : "4");
    });
    const coordinates = (path) => path.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
    const shaft = coordinates(paths[0]);
    const head = coordinates(paths[1]);
    assert.ok(Math.hypot(shaft[2] - shaft[0], shaft[3] - shaft[1]) >= 12 - 1e-8);
    assert.ok(Math.abs(Math.hypot(head[0] - head[4], head[1] - head[5]) - 16) < 1e-8);
    assert.ok(Math.hypot(head[2], head[3]) >= 12 - 1e-8, "Tip stays at least 30 degrees off axis");
    assert.ok(Math.hypot(head[2] - shaft[2], head[3] - shaft[3]) < 1e-8);
    const projected = Math.hypot(u.x, u.y);
    if (projected > 1e-8) {
      const dx = shaft[2] - shaft[0],
        dy = shaft[3] - shaft[1];
      assert.ok((dx * u.x - dy * u.y) / (Math.hypot(dx, dy) * projected) > 1 - 1e-8);
    }
  }
  await check();
  await page.screenshot({ path: `.cache/sketch-review/${name}-front.png` });
  for (let i = 0; i < 6; i++) {
    await orient(page, [0.15 + i * 0.2, -0.1 - i * 0.1, 1]);
    await check();
  }
  await page.screenshot({ path: `.cache/sketch-review/${name}-oblique.png` });
  const before = (await inspect(page)).camera.height;
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -45);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (before) => window.makeshiftInspect().camera.height !== before,
    before,
  );
  await check();
  assert.deepEqual((await inspect(page)).document, original);
}

async function measuredWidgetFrame(handle, root) {
  const rootElement = await root.elementHandle();
  const frame = await handle.evaluate((node, anchor) => {
    const b = node.getBoundingClientRect(),
      origin = anchor.getBoundingClientRect();
    const translate = getComputedStyle(node).translate;
    const [x = 0, y = 0] = translate === "none" ? [] : translate.split(" ").map(parseFloat);
    return {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      anchor: { x: origin.x, y: origin.y },
      correction: { x, y },
    };
  }, rootElement);
  await rootElement.dispose();
  return frame;
}
