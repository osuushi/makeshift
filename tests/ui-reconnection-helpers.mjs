import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { hold } from "./ui-overlap-gesture.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function clearSelection(page) {
  if (!(await inspect(page)).modelingSelection.length) return;
  await browseTools(page, "Select");
  await chooseTool(page, "clear selection", "selection-clear");
  await inspect(page);
}
export async function pickAt(page, point, view) {
  await clearSelection(page);
  await orient(page, view);
  const p = await project(page, point);
  await page.mouse.click(p.x, p.y);
  return inspect(page);
}
export async function pickFace(page, face, chooser = false) {
  let area = -1,
    center,
    normal;
  const vertices = face.vertices;
  for (let i = 0; i < vertices.length; i += 9) {
    const a = vertices.slice(i, i + 3),
      b = vertices.slice(i + 3, i + 6),
      c = vertices.slice(i + 6, i + 9);
    const u = b.map((n, j) => n - a[j]),
      v = c.map((n, j) => n - a[j]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const size = Math.hypot(...n);
    if (size <= area) continue;
    area = size;
    normal = n.map((x) => x / size);
    center = a.map((x, j) => (x + b[j] + c[j]) / 3);
  }
  if (chooser) {
    // A narrow face can share the rim's pointer hit region. Use the same explicit
    // choice a user makes when the ordinary click prefers that nearby edge.
    await clearSelection(page);
    await orient(page, normal);
    await hold(page, await project(page, center));
    await page
      .getByRole("dialog", { name: "Choose overlapping geometry" })
      .locator(`[data-kind="face"][data-key="${face.id}"]`)
      .hover();
    await page.mouse.up();
  } else await pickAt(page, center, normal);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, face.id);
}
export async function startMove(page) {
  await page.keyboard.press("m");
  const button = page.getByRole("button", { name: "Allow face warping", exact: true });
  assert.equal(await button.count(), 0, "Movement has no alternate warping mode");
}
export async function quantity(page, kind, axis, value) {
  await page.getByRole("button", { name: `Move ${kind} ${axis}`, exact: true }).click();
  await page
    .getByRole("textbox", {
      name: `${kind === "edges" ? "Edge" : "Face"} translation ${axis}`,
      exact: true,
    })
    .fill(String(value));
  const state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  return state;
}
export async function accept(page, kind) {
  await page.getByRole("button", { name: `Accept ${kind} movement`, exact: true }).click();
  return inspect(page);
}
