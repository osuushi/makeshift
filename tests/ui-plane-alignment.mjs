import assert from "node:assert/strict";
import * as THREE from "three";
import { project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

/** Prepare near-quarter-turn views through real cube pointer drags, with no pose injection. */
export async function preparePlaneAlignment(
  page,
  construction = false,
  quarter = 1,
  bottom = false,
) {
  await reset(page);
  if (construction) {
    await orientWithTurntable(page, [0.2, -0.2, 1]);
    const hit = await findRaycastPoint(page, "XY");
    await page.mouse.click(hit.x, hit.y);
    await chooseTool(page, "construction plane", "construction-plane");
    await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Plane translation Z", exact: true })
      .fill(bottom ? "-12" : "12");
    await page.keyboard.press("Enter");
    await settled(page);
  }
  if (bottom) await orientWithTurntable(page, [0.1, -0.1, -1]);
  await page
    .getByRole("button", { name: `${bottom ? "Bottom" : "Top"} view`, exact: true })
    .locator("polygon")
    .dblclick();
  await navigationIdle(page);
  const box = await page.locator(".orientation-cube").boundingBox();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.mouse.move(cx + 22, cy);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  const radians = (quarter * Math.PI) / 2 - 0.1;
  for (let step = 1; step <= 24; step++) {
    const angle = (radians * step) / 24;
    await page.mouse.move(cx + 22 * Math.cos(angle), cy + 22 * Math.sin(angle));
  }
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  // Tilt slightly; cancel release leveling to retain the near-quarter roll.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 5, cy + 7, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await navigationIdle(page);
  const before = await inspect(page);
  const point = construction
    ? await project(page, [4, 4, bottom ? -12 : 12])
    : await findRaycastPoint(page, "XY");
  return { before, point, construction };
}

export function assertPlaneAlignment(before, after, construction) {
  assert.ok(
    orientation(before.camera).angleTo(orientation(after.camera)) < 0.3,
    "Double-click follows the nearest quarter turn instead of a long roll",
  );
  assert.ok(Math.abs(after.camera.up[0]) > 0.999999, "Plane camera keeps the sideways orientation");
  const direction = new THREE.Vector3(...after.camera.position)
    .sub(new THREE.Vector3(...after.camera.target))
    .normalize();
  assert.ok(Math.abs(direction.z) > 0.999999);
  assert.deepEqual(
    after.document,
    before.document,
    "Entry changes no accepted geometry or plane frame",
  );
  assert.equal(after.camera.height, before.camera.height);
  assert.equal(after.activePlane, construction ? "Construction plane" : "XY");
  const { origin, u, v } = after.projection;
  assert.ok(Math.abs(u.x - origin.x) < 1e-6, "Plane u projects vertically");
  assert.ok(Math.abs(v.y - origin.y) < 1e-6, "Plane v projects horizontally");
}

export async function planeAlignmentRoute(page, name) {
  for (const construction of [false, true]) {
    for (const quarter of [1, 3]) {
      for (const bottom of [false, true]) {
        console.log(
          `${name}: ${construction ? "construction" : "coordinate"}, quarter ${quarter}, bottom ${bottom}`,
        );
        const { before, point } = await preparePlaneAlignment(page, construction, quarter, bottom);
        await page.mouse.dblclick(point.x, point.y);
        const after = await inspect(page);
        assertPlaneAlignment(before, after, construction);
        await page.keyboard.press("r");
        await drag(page, [-8, -6], [8, 6]);
        const drawn = await inspect(page);
        assert.equal(drawn.document.sketches[0].curves.length, 4);
        assert.deepEqual(
          drawn.document.sketches[0].plane,
          construction
            ? before.document.constructionPlanes[0].frame
            : { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
        );
      }
    }
  }
  console.log(
    `${name}: coordinate/construction double-click near 90/270 on both sides, grid and drawing passed`,
  );
}

function orientation(camera) {
  const view = new THREE.PerspectiveCamera();
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  return view.quaternion;
}
