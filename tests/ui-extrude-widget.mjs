import assert from "node:assert/strict";
import * as THREE from "three";
import { axialCleanupRoute } from "./ui-axial-widget.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { orientableArrowViews } from "./ui-orientable-tools.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function extrusionWidgetRoute(page, name) {
  const { centroid, centerX, centerY } = await selectProfiles(page);
  const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
  const box = await handle.boundingBox();
  assert.ok(Math.abs(box.x + box.width / 2 - centroid.x - 32) < 0.1);
  assert.ok(Math.abs(box.y + box.height / 2 - centroid.y) < 0.1);
  assert.equal(
    await page
      .locator(".extrude-controls")
      .getByRole("button", { name: "Union", exact: true })
      .isVisible(),
    true,
  );
  assert.equal(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible(), true);
  await orient(page, [1, -1, 2]);
  const { camera, unit, project } = await extrusionProjection(page, centerX, centerY);
  const start = project(0),
    end = project(4);
  const oblique = await handle.boundingBox();
  const direction = await handle.evaluate((el) => ({
    x: Number(el.dataset.directionX),
    y: Number(el.dataset.directionY),
  }));
  const width = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion.clone().invert());
  assert.ok(
    Math.abs(
      oblique.x + oblique.width / 2 - ((end.x - start.x) / 4) * unit * 48 - width.x * 32 - start.x,
    ) < 0.1,
  );
  assert.ok(
    Math.abs(
      oblique.y + oblique.height / 2 - ((end.y - start.y) / 4) * unit * 48 + width.y * 32 - start.y,
    ) < 0.1,
  );
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y) - 1) < 1e-6);
  const hx = oblique.x + oblique.width / 2,
    hy = oblique.y + oblique.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + end.x - start.x, hy + end.y - start.y, { steps: 5 });
  await refineHeldExtrusion(page, hx + end.x - start.x + 20, hy + end.y - start.y);
  const preview = await inspect(page);
  close(
    preview.preview.bodies.reduce((sum, body) => sum + body.volume, 0),
    (300 - 4 * Math.PI) * 4,
  );
  const continued = await handle.boundingBox(),
    farther = project(8);
  await page.mouse.move(continued.x + continued.width / 2, continued.y + continued.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    continued.x + continued.width / 2 + farther.x - end.x,
    continued.y + continued.height / 2 + farther.y - end.y,
    { steps: 4 },
  );
  await page.mouse.up();
  close(
    (await inspect(page)).preview.bodies.reduce((sum, body) => sum + body.volume, 0),
    (300 - 4 * Math.PI) * 8,
  );
  for (const label of ["Union", "Subtract", "Intersect", "New body"]) {
    const button = page
      .locator(".extrude-controls")
      .getByRole("button", { name: label, exact: true });
    assert.equal(await button.textContent(), "");
    assert.ok((await button.getAttribute("title")).startsWith(label));
  }
  await page.screenshot({ path: `.cache/sketch-review/${name}-extrusion-widget.png` });
  await orientableArrowViews(
    page,
    handle,
    page.locator(".extrude-controls"),
    [0, 0, 1],
    `${name}-extrude-rigid`,
  );
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await axialCleanupRoute(page);
  console.log(
    `${name}: area centroid, projected normal drag, compact contextual Boolean icons passed`,
  );
}

async function extrusionProjection(page, x, y) {
  const state = await inspect(page),
    bounds = await page.locator("canvas").boundingBox();
  const h = state.camera.height / 2,
    w = (h * bounds.width) / bounds.height;
  const camera = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  camera.position.fromArray(state.camera.position);
  camera.up.fromArray(state.camera.up);
  camera.lookAt(new THREE.Vector3(...state.camera.target));
  camera.updateMatrixWorld();
  return {
    camera,
    unit: state.camera.height / bounds.height,
    project(z) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: bounds.x + ((p.x + 1) * bounds.width) / 2,
        y: bounds.y + ((1 - p.y) * bounds.height) / 2,
      };
    },
  };
}

async function selectProfiles(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -8], [-10, 2]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  await drag(page, [0, 8], [20, 18]);
  await page.keyboard.press("c");
  await drag(page, [-16, -4], [-14, -4]);
  const centerY = (2300 + 16 * Math.PI) / (300 - 4 * Math.PI);
  const centerX = (500 + 64 * Math.PI) / (300 - 4 * Math.PI);
  const a = await at(page, -12, 0),
    b = await at(page, 10, 13);
  const centroid = await at(page, centerX, centerY);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Shift");
  return { centroid, centerX, centerY };
}

async function refineHeldExtrusion(page, x, y) {
  await page.keyboard.press("Tab");
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  assert.equal(await distance.evaluate((input) => input === document.activeElement), true);
  await distance.fill("4");
  await page.mouse.move(x, y);
  await page.mouse.up();
  assert.equal(
    await distance.inputValue(),
    "4",
    "Numeric focus owns the held drag through release",
  );
}
