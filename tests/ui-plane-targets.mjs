import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseWidget } from "./ui-modal-plane-widgets.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function planeTargetsRoute(page, name) {
  for (const id of ["XY", "XZ", "YZ"]) {
    await reset(page);
    const before = await inspect(page);
    await orient(page, { XY: [0.2, 0.2, 1], XZ: [0.2, 1, 0.2], YZ: [1, 0.2, 0.2] }[id]);
    await assertTargetContainsOrigin(page, id);
    const hit = await findRaycastPoint(page, id);
    assert.deepEqual((await inspect(page)).document, before.document, "Hover is presentation only");
    if (id === "XY")
      await page.screenshot({ path: `.cache/sketch-review/${name}-plane-target-hover.png` });
    await page.mouse.click(hit.x, hit.y);
    assert.equal((await inspect(page)).activePlane, null, "Single-click stays in Modeling");
    assert.equal((await inspect(page)).planeTargets.find((p) => p.id === id).selected, true);
    await page.getByRole("button", { name: "Application settings" }).hover();
    assert.equal((await inspect(page)).planeTargets.find((p) => p.id === id).hovered, false);
    assert.equal((await inspect(page)).planeTargets.find((p) => p.id === id).selected, true);
    await page.keyboard.press("Enter");
    assert.equal((await inspect(page)).activePlane, id, "Enter uses the selected reference");
    await reset(page);
    await orient(page, { XY: [0.2, 0.2, 1], XZ: [0.2, 1, 0.2], YZ: [1, 0.2, 0.2] }[id]);
    const doubleClick = await findRaycastPoint(page, id);
    await page.mouse.dblclick(doubleClick.x, doubleClick.y);
    assert.equal((await inspect(page)).activePlane, id, "Double-click enters its plane");
    assert.deepEqual((await inspect(page)).document, before.document);
  }
  await reset(page);
  await pickMirrorPlane(page, await deselectOnPlane(page));
  await reset(page);
  await assertEditorTabOrder(page);
  await reset(page);
  await page.keyboard.press("Meta+f");
  await page.getByRole("combobox", { name: "Find a tool" }).fill("Sketch on XY");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activePlane, "XY", "Keyboard plane entry uses Tools");
  await reset(page);
  for (const id of ["XY", "XZ", "YZ"]) {
    await chooseTool(page, `Sketch on ${id}`, `sketch-${id.toLowerCase()}`);
    assert.equal((await inspect(page)).activePlane, id, `${id} accessible target activates`);
    await reset(page);
  }
  console.log(`${name}: plane hover, selection, Enter and double-click passed`);
}

async function assertEditorTabOrder(page) {
  assert.equal(await page.locator(".toolbox").count(), 0, "Old toolbar is removed");
  const tools = page.getByRole("button", { name: "Tools", exact: true });
  let focused = false;
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Tab");
    focused = await tools.evaluate((button) => button === document.activeElement);
    if (focused) break;
  }
  assert.equal(focused, true, "Tools is keyboard accessible");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  await page.keyboard.press("Escape");
}

async function assertTargetContainsOrigin(page, id) {
  const { origin, points } = await page.evaluate(targetGeometry, id);
  assert.ok(inside(origin, points), `${id} section contains the projected world origin`);
}

export async function findRaycastPoint(page, id) {
  const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const { origin, points } = await page.evaluate(targetGeometry, id),
    bounds = {
      left: Math.max(canvas.x, Math.min(...points.map((point) => point.x))),
      right: Math.min(canvas.x + canvas.width, Math.max(...points.map((point) => point.x))),
      top: Math.max(canvas.y, Math.min(...points.map((point) => point.y))),
      bottom: Math.min(canvas.y + canvas.height, Math.max(...points.map((point) => point.y))),
    },
    candidates = points.flatMap((point) =>
      [0.85, 0.65, 0.45].map((weight) => ({
        x: origin.x + (point.x - origin.x) * weight,
        y: origin.y + (point.y - origin.y) * weight,
      })),
    );
  for (let row = 1; row < 8; row++) {
    for (let column = 1; column < 8; column++) {
      const point = {
        x: bounds.left + ((bounds.right - bounds.left) * column) / 8,
        y: bounds.top + ((bounds.bottom - bounds.top) * row) / 8,
      };
      if (inside(point, points)) candidates.push(point);
    }
  }
  for (const point of candidates) {
    const overButton = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName !== "CANVAS",
      point,
    );
    if (overButton) continue;
    await page.mouse.move(point.x, point.y);
    if ((await inspect(page)).planeTargets.find((p) => p.id === id)?.hovered) return point;
  }
  assert.fail(`Could not raycast the ${id} coordinate-plane section`);
}

function targetGeometry(plane) {
  const target = window.makeshiftInspect().planeTargets.find((p) => p.id === plane),
    origin = document.querySelector(".origin");
  if (!target || !(origin instanceof HTMLElement)) throw new Error(`Missing ${plane} plane target`);
  const marker = origin.getBoundingClientRect();
  return { origin: { x: marker.left - 8, y: marker.top - 8 }, points: target.points };
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}

/** Pick a displayed reference patch through the actual canvas, including explicit tool modes. */
export async function pickPlane(page, id) {
  if (await page.locator(".modal-plane-widgets").isVisible()) {
    assert.equal(
      await page
        .getByRole("button", { name: `Use ${id} plane`, exact: true })
        .getAttribute("aria-disabled"),
      "false",
    );
    await chooseWidget(page, id);
    return;
  }
  // Full-view references overlap everywhere; face the requested plane for an
  // unambiguous pointer route, rather than relying on finite origin-patch corners.
  await orient(page, { XY: [0.2, 0.2, 1], XZ: [0.2, 1, 0.2], YZ: [1, 0.2, 0.2] }[id]);
  const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const points = [
    { x: box.x + 12, y: box.y + box.height * 0.25 },
    { x: box.x + box.width - 12, y: box.y + box.height * 0.25 },
    { x: box.x + box.width - 12, y: box.y + box.height - 12 },
    { x: box.x + 12, y: box.y + box.height - 12 },
  ];
  const center = points.reduce((p, q) => ({ x: p.x + q.x / 4, y: p.y + q.y / 4 }), { x: 0, y: 0 });
  // Outer corners avoid model faces and intersecting reference planes.
  for (const weight of [0.9, 0.7, 0.5, 0.3])
    for (const corner of points) {
      const p = {
        x: center.x + (corner.x - center.x) * weight,
        y: center.y + (corner.y - center.y) * weight,
      };
      const hit = await page.evaluate(
        ({ p, id }) => {
          if (document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS") return false;
          const targets = window
            .makeshiftInspect()
            .planeTargets.filter((t) => t.visible && t.selectable);
          // Reject points inside another reference patch: depth cannot make these ambiguous.
          const inside = (polygon) => {
            let result = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
              const a = polygon[i],
                b = polygon[j];
              if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
                result = !result;
            }
            return result;
          };
          return targets.filter((t) => inside(t.points)).every((t) => t.id === id);
        },
        { p, id },
      );
      if (hit) {
        await page.mouse.click(p.x, p.y);
        await inspect(page);
        return;
      }
    }
  assert.fail(`No unambiguous exposed patch for ${id}; orient the camera before picking`);
}

async function deselectOnPlane(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [24, 18], [36, 26]);
  const region = await at(page, 30, 22);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  const before = await inspect(page);
  assert.equal(before.modelingSelection[0]?.kind, "profile");
  const target = await findRaycastPoint(page, "XY");
  await page.mouse.click(target.x, target.y);
  const after = await inspect(page);
  assert.equal(after.activePlane, null);
  assert.deepEqual(after.modelingSelection, [], "Plane single-click deselects geometry");
  assert.deepEqual(after.document, before.document);
  return region;
}

async function pickMirrorPlane(page, region) {
  await page.mouse.click(region.x, region.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("6");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "mirror", "mirror");
  await orient(page, [1, 0.2, 0.2]);
  const target = await findRaycastPoint(page, "YZ");
  await page.mouse.click(target.x, target.y);
  const state = await inspect(page);
  assert.equal(state.activePlane, null, "Plane picking stays in Modeling");
  assert.equal(state.preview?.bodies.length, 2, "Single-click chooses the mirror plane");
  await page.keyboard.press("Escape");
}
