import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { historyMenu, openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";

// Real widget events must retain a refusal after pointer/keyboard dismissal of
// workspace errors. Model tests cannot observe that escaped presentation failure.
export async function edgeLiftRoute(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/edge-lift-closed-spline.json", "utf8"));
  await openDocument(page, {
    name: "edge-lift.makeshift",
    buffer: Buffer.from(
      JSON.stringify({
        format: "makeshift",
        version: 1,
        document: fixture.document,
        camera: fixture.camera,
      }),
    ),
  });
  const original = (await inspect(page)).document;
  const point = await project(page, fixture.selection[0].point);
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.edge, fixture.operation.edges[0].edge);
  await page.keyboard.press("m");
  const handle = page.getByRole("button", { name: "Move edges Z", exact: true });
  const box = await handle.boundingBox();
  assert.ok(box);
  const a = await project(page, [17.5, 17.5, 52.026580047607425]);
  const b = await project(page, [17.5, 17.5, 52.82658004760742]);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + b.x - a.x, box.y + box.height / 2 + b.y - a.y, {
    steps: 4,
  });
  await page.mouse.up();
  let state = await inspect(page);
  assert.ok(state.preview, state.error);
  const moved = state.preview.bodies[0].edges.find((e) => e.id === fixture.operation.edges[0].edge);
  assert.ok(Math.abs(moved.landmarks.start[2] - 52.82658004760742) < 1e-6);
  assert.deepEqual(state.document, original);
  const input = page.getByRole("textbox", { name: "Edge translation Z", exact: true });
  await input.fill("100");
  await inspect(page);
  const feedback = page.locator(".edge-move-gizmo .topology-move-feedback");
  assert.equal(await feedback.isVisible(), true);
  assert.match(await feedback.textContent(), /Cannot move edges\./);
  assert.equal(await page.getByRole("button", { name: "Accept edge movement" }).isEnabled(), false);
  await input.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal(await feedback.isVisible(), true, "Refusal survives ordinary error dismissal");
  await page.screenshot({ path: ".cache/sketch-review/edge-lift-refusal.png" });
  await input.fill("0.8");
  state = await inspect(page);
  assert.ok(state.preview);
  assert.equal(await feedback.isVisible(), false);
  await input.press("Enter");
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  assert.deepEqual(accepted.bodies, state.preview.bodies);
  await historyMenu(page, "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(`${name}: captured edge lift, persistent refusal, recovery and Undo passed`);
}
