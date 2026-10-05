import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { orientableArrowViews } from "./ui-orientable-tools.mjs";

export async function directionalWidgetRoute(page, plate) {
  const points = await plate(page);
  const input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  assert.equal(await input.inputValue(), "0");
  assert.ok(await page.getByRole("button", { name: "Accept fillet", exact: true }).isDisabled());
  assert.ok(
    await page.getByRole("button", { name: "Commit and clean up", exact: true }).isDisabled(),
  );
  for (const key of ["Tab", "Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    await inspect(page);
    assert.ok(await input.evaluate((field) => field === document.activeElement));
  }
  await page.keyboard.press("Escape");
  await inspect(page);
  const handle = page.getByRole("button", { name: "Fillet edges", exact: true });
  assert.equal(await page.locator(".edge-size-handle:visible").count(), 1);
  for (const [x, y, dx, dy] of [
    [6, 10, 0, 1],
    [-10, -5, 1, 0],
  ]) {
    const scale = (points.top.y - points.center.y) / 10;
    const click = { x: points.center.x - x * scale, y: points.center.y + y * scale };
    await page.mouse.click(click.x, click.y);
    await inspect(page);
    assert.ok(Math.abs(Number(await handle.getAttribute("data-direction-x")) - dx) < 0.01);
    assert.ok(Math.abs(Number(await handle.getAttribute("data-direction-y")) - dy) < 0.01);
    const root = page.locator(".body-edge-finish-widget");
    const position = await root.boundingBox();
    assert.ok(Math.hypot(position.x - click.x, position.y - click.y) < 2);
  }
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await inspect(page);
  assert.ok(Number(await page.getByRole("textbox", { name: "Fillet radius" }).inputValue()) > 0);
  await page.getByRole("textbox", { name: "Fillet radius" }).fill("100");
  await inspect(page);
  assert.equal(await handle.getAttribute("data-geometry-invalid"), "true");
  await page.getByRole("textbox", { name: "Fillet radius" }).fill("1");
  await inspect(page);
  assert.equal(await handle.getAttribute("data-geometry-invalid"), "false");
  await input.fill("0");
  await inspect(page);
  assert.ok(await page.getByRole("button", { name: "Accept fillet", exact: true }).isDisabled());
  assert.ok(
    await page.getByRole("button", { name: "Commit and clean up", exact: true }).isDisabled(),
  );
  await input.fill("1");
  await inspect(page);
  await page.getByRole("button", { name: "Switch to chamfer", exact: true }).click();
  await inspect(page);
  assert.equal(await page.locator(".edge-size-handle:visible").count(), 1);
  const chamfer = page.getByRole("button", { name: "Chamfer edges", exact: true });
  const before = Number(await chamfer.getAttribute("data-direction-y"));
  await orient(page, [1, -1, 2]);
  await inspect(page);
  const dx = Number(await chamfer.getAttribute("data-direction-x"));
  const dy = Number(await chamfer.getAttribute("data-direction-y"));
  assert.ok(Math.abs(Math.hypot(dx, dy) - 1) < 1e-6);
  assert.ok(Math.abs(dy - before) > 0.01, "Orbit reprojects the surface movement direction");
  await page.screenshot({ path: ".cache/sketch-review/directional-widget.png" });
  const selection = await inspect(page);
  const body = selection.document.bodies[0];
  const edge = body.edges.find((e) => e.id === selection.modelingSelection[0].edge);
  const outward = [-Math.SQRT1_2, 0, Math.SQRT1_2];
  const width = new THREE.Vector3(...edge.curve.b)
    .sub(new THREE.Vector3(...edge.curve.a))
    .cross(new THREE.Vector3(...outward))
    .normalize()
    .toArray();
  await orientableArrowViews(
    page,
    chamfer,
    page.locator(".body-edge-finish-widget"),
    outward,
    "chamfer-rigid",
    width,
  );
  await page.keyboard.press("Escape");
  await inspect(page);
}
