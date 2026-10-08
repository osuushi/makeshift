import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function seedWidgetBody(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-12, -12], [12, 12]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("20");
  await settled(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await settled(page);
  await page.keyboard.press("Escape");
  await orient(page, [1, -1, 1]);
  assert.equal((await inspect(page)).document.bodies.length, 1);
}

export async function widgetPoint(page, id) {
  return page.locator(`[data-modal-plane="${id}"]`).evaluate((polygon) => {
    const points = [...polygon.points];
    const rect = polygon.ownerSVGElement.getBoundingClientRect();
    return {
      x: rect.left + points.reduce((n, p) => n + p.x, 0) / points.length,
      y: rect.top + points.reduce((n, p) => n + p.y, 0) / points.length,
    };
  });
}

export async function chooseWidget(page, id) {
  const p = await widgetPoint(page, id);
  await page.mouse.click(p.x, p.y);
  await settled(page);
}

export async function modalPlaneWidgetRoute(page, name) {
  await seedWidgetBody(page);
  assert.equal(await page.locator(".modal-plane-widgets").isVisible(), false);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  const before = await inspect(page);
  await chooseTool(page, "Split Body", "split");
  assert.equal(await page.locator(".modal-plane-widgets").isVisible(), true);
  assert.equal(await page.locator("[data-modal-plane]").count(), 3);
  const yz = page.getByRole("button", { name: "Use YZ plane", exact: true });
  assert.equal(await yz.getAttribute("aria-disabled"), "false");
  await orient(page, [0, 0, 1]);
  const finite = await page.locator("[data-modal-plane]").evaluateAll((widgets) => {
    const groups = widgets.map((widget) => [...widget.points]);
    return groups.every((points) =>
      points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    );
  });
  assert.ok(finite, "Edge-on cues retain finite placement");
  await chooseWidget(page, "YZ");
  assert.equal((await inspect(page)).preview.bodies.length, 2, "Edge-on cue remains clickable");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);
  await chooseTool(page, "Split Body", "split");
  await orient(page, [1, -1, 1]);
  assert.equal(
    await page
      .getByRole("button", { name: "Use XY plane", exact: true })
      .getAttribute("aria-disabled"),
    "true",
  );
  await chooseWidget(page, "XY");
  assert.equal((await inspect(page)).preview, null, "Inapplicable cue cannot change the tool");
  const originalSize = await yz.boundingBox();
  const point = await widgetPoint(page, "YZ");
  await page.mouse.move(point.x, point.y);
  // Ctrl-wheel is the ordinary pinch path.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await settled(page);
  const zoomedSize = await yz.boundingBox();
  assert.ok(Math.abs(zoomedSize.width - originalSize.width) < 0.01);
  assert.ok(Math.abs(zoomedSize.height - originalSize.height) < 0.01);
  const press = await widgetPoint(page, "YZ");
  const cameraBefore = (await inspect(page)).camera;
  await page.mouse.move(press.x, press.y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(press.x + 80, press.y + 45, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await settled(page);
  assert.notDeepEqual((await inspect(page)).camera.position, cameraBefore.position);
  await orient(page, [1, -1, 1]);
  await chooseWidget(page, "YZ");
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.keyboard.press("Escape");
  const cancelled = await inspect(page);
  assert.deepEqual(cancelled.document, before.document);
  assert.deepEqual(cancelled.modelingSelection, before.modelingSelection);
  assert.equal(await page.locator(".modal-plane-widgets").isVisible(), false);
  await acceptedWidgetEdits(page, before);
  console.log(`${name}: modal plane cues, zoom, orbit, split/imprint, cancel and Undo passed`);
}

async function acceptedWidgetEdits(page, before) {
  await chooseTool(page, "Split Body", "split");
  await chooseWidget(page, "YZ");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
  await page.keyboard.press("Escape");
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Control");
  await settled(page);
  await worldClick(page, [0, 0, 20]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "Imprint", "imprint");
  await chooseWidget(page, "YZ");
  const preview = await inspect(page);
  assert.equal(preview.preview.bodies[0].faces.length, 7);
  await page.keyboard.press("Enter");
  const imprinted = await inspect(page);
  assert.equal(imprinted.document.bodies[0].faces.length, 7);
  assert.ok(imprinted.modelingSelection.every((target) => target.kind === "edge"));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
}
