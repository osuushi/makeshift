import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { circularFinish, plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

async function selectBoundary(page, round, height, partial = false) {
  if ((await inspect(page)).modelingSelection.length) {
    await browseTools(page, "Select");
    await chooseTool(page, "clear selection", "selection-clear");
    await inspect(page);
  }
  const points = round
    ? [[-Math.sqrt(32), -Math.sqrt(32), height]]
    : [
        [0, -10, height],
        [10, 0, height],
        [0, 10, height],
        [-10, 0, height],
      ];
  for (const [i, point] of points.entries()) {
    if (partial && i) break;
    await orient(page, [point[0], point[1], 4]);
    const p = await project(page, point);
    if (i) await page.keyboard.down("Shift");
    await page.mouse.click(p.x, p.y);
    if (i) await page.keyboard.up("Shift");
    const selection = (await inspect(page)).modelingSelection;
    assert.equal(selection.length, i + 1);
    assert.ok(selection.every((t) => t.kind === "edge"));
  }
}
async function quantity(page, value, axis = "Z") {
  const handle = page.getByRole("button", { name: `Move edges ${axis}`, exact: true });
  if (!(await handle.isVisible())) {
    // An end-on canonical axis is intentionally absent from the 2D widget.
    await page.keyboard.down("Meta");
    await page.mouse.move(950, 600);
    await page.mouse.down();
    await page.mouse.move(1030, 525, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Meta");
    await inspect(page);
  }
  await handle.click();
  await page
    .getByRole("textbox", { name: `Edge translation ${axis}`, exact: true })
    .fill(String(value));
  return inspect(page);
}
export async function prepareShoulder(page, name, round) {
  if (round) await circularFinish(page, name, "chamfer");
  else {
    const { center } = await plate(page);
    await page.mouse.click(center.x, center.y);
    await browseTools(page, "Select");
    await chooseTool(page, "select face boundary edges", "selection-boundary");
    await page.keyboard.press("Shift+F");
    await page.getByRole("button", { name: "Chamfer edges", exact: true }).click();
    await page.getByRole("textbox", { name: "Chamfer distance", exact: true }).fill("2");
    await inspect(page);
    await page.getByRole("button", { name: "Accept chamfer", exact: true }).click();
    await inspect(page);
  }
  const original = (await inspect(page)).document;
  if (!round) {
    await selectBoundary(page, false, 8, true);
    await page.keyboard.press("m");
    await quantity(page, 1, "Z");
    assert.equal(
      await page.getByRole("button", { name: "Accept edge movement" }).isEnabled(),
      true,
    );
    assert.ok((await inspect(page)).preview);
    await page.keyboard.press("Escape");
    await inspect(page);
  }
  return original;
}
export async function edgeMoveRoute(page, name, electron, round) {
  const original = await prepareShoulder(page, name, round);
  await selectBoundary(page, round, 8);
  await chooseTool(page, "transform", "transform");
  assert.equal(
    await page.getByRole("button", { name: "Move edges normal", exact: true }).isVisible(),
    false,
  );
  const selected = (await inspect(page)).modelingSelection;
  let state = await quantity(page, 1);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  assert.deepEqual(state.document, original);
  const expected = round
    ? Math.PI * (64 * 9 + (64 + 48 + 36) / 3)
    : 400 * 9 + (400 + 320 + 256) / 3;
  volumeClose(state.preview.bodies[0].volume, expected);
  const input = page.getByRole("textbox", { name: "Edge translation Z", exact: true });
  await input.fill("-8");
  await inspect(page);
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal(await page.getByRole("button", { name: "Accept edge movement" }).isEnabled(), false);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  await input.fill("1");
  await inspect(page);
  await page.screenshot({
    path: `.cache/sketch-review/${name}-${round ? "round" : "rectangular"}-edge-move.png`,
  });
  await page.getByRole("button", { name: "Accept edge movement", exact: true }).click();
  const accepted = (await inspect(page)).document;
  volumeClose(accepted.bodies[0].volume, expected);
  assert.deepEqual((await inspect(page)).modelingSelection, selected);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  const box = await page.getByRole("button", { name: "Move edges Z", exact: true }).boundingBox();
  const a = await project(page, [0, 0, 9]),
    b = await project(page, [0, 0, 8]);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + b.x - a.x, box.y + box.height / 2 + b.y - a.y, {
    steps: 4,
  });
  await page.mouse.up();
  state = await inspect(page);
  assert.ok(state.preview);
  assert.deepEqual(state.document, accepted);
  await page.getByRole("button", { name: "Cancel edge movement", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-${round ? "round" : "rectangular"}-edge`, electron);
  await selectBoundary(page, round, 9);
  await page.keyboard.press("m");
  state = await quantity(page, -1);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  volumeClose(state.preview.bodies[0].volume, original.bodies[0].volume);
  await page.keyboard.press("Enter");
  await inspect(page);
  if (round) await rotatedRound(page, name, selected[0].edge);
  console.log(
    `${name}: ${round ? "round" : "rectangular"} edge translation, drag, rejection recovery, history, archive and re-edit passed`,
  );
}

async function rotatedRound(page, name, edgeId) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "rotate", "rotate");
  await page.getByRole("button", { name: "Rotate body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("37");
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  const edge = original.bodies[0].edges.find((e) => e.id === edgeId);
  assert.equal(edge.curve.kind, "circle");
  const center = edge.curve.center;
  const point = edge.points.slice(12, 15);
  const normal = [0, -Math.sin((37 * Math.PI) / 180), Math.cos((37 * Math.PI) / 180)];
  await browseTools(page, "Select");
  await chooseTool(page, "clear selection", "selection-clear");
  await orient(
    page,
    point.map((v, i) => (v - center[i]) / 8 + normal[i] * 0.6),
  );
  const p = await project(page, point);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.edge, edgeId);
  await page.keyboard.press("m");
  const state = await quantity(page, 1, "normal");
  assert.ok(state.preview, await page.getByRole("status").textContent());
  const moved = state.preview.bodies[0].edges.find((e) => e.id === edgeId);
  for (let i = 0; i < 3; i++) close(moved.curve.center[i], center[i] + normal[i]);
  await page.keyboard.press("Enter");
  await inspect(page);
  console.log(`${name}: rotated shoulder follows the boundary-normal handle`);
}

function volumeClose(actual, expected) {
  // OCCT integrates rebuilt ruled spline surfaces numerically. Compare volume
  // with relative tolerance; coordinate and boundary checks stay at 1e-6 mm.
  assert.ok(
    Math.abs(actual - expected) < Math.max(1e-6, Math.abs(expected) * 1e-8),
    `Volume: ${actual} != ${expected}`,
  );
}
