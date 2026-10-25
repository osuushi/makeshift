import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Native model tests cannot catch the asynchronous rejection blurring the live field.
export async function bezierFilletFocusRoute(page) {
  const fixture = JSON.parse(readFileSync("tests/fixtures/bezier-extrusion-fillet.json", "utf8"));
  await reset(page);
  await openDocument(page, {
    name: "bezier-fillet.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await page.keyboard.press("Escape");
  await orient(page, [1, 1, 0.5]);
  const original = (await inspect(page)).document;
  // Zoom before picking the captured 1 mm vertical edge.
  const point = await project(page, [5, 0, 0.5]);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  const edge = await project(page, [5, 0, 0.5]);
  await page.mouse.click(edge.x, edge.y);
  assert.deepEqual(
    (await inspect(page)).modelingSelection.map(({ kind, body, edge }) => ({ kind, body, edge })),
    fixture.selection.map((target) => ({ kind: "edge", ...target })),
  );
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  await input.press("ControlOrMeta+a");
  await page.keyboard.type("0.1");
  await previewActionReady(page, "Accept fillet");
  assert.ok(await input.evaluate((element) => document.activeElement === element));
  const provisional = await inspect(page);
  assert.equal(provisional.preview, null, "Exact measurements wait for acceptance");
  assert.deepEqual(provisional.document, original);
  const faces = provisional.visualPreview.bodies[0].faces;
  assert.ok(faces.length > 0);
  assert.notDeepEqual(
    faces,
    original.bodies[0].faces.map((face) => face.vertices),
  );
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const accepted = (await inspect(page)).document.bodies[0];
  assert.ok(accepted.volume < original.bodies[0].volume);
  assert.deepEqual(
    accepted.faces.map((face) => face.vertices),
    faces,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  // A truly smooth junction still rejects. Its asynchronous failure must keep
  // the field and error visible until the user explicitly cancels.
  await orient(page, [0, -1, 0.3]);
  const smooth = await project(page, [0, -9, 0.5]);
  await page.mouse.click(smooth.x, smooth.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.edge, original.bodies[0].edges[0].id);
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Fillet radius"]')?.getAttribute("aria-invalid") ===
      "true",
  );
  assert.match(await page.locator(".workspace-footer .status").textContent(), /cannot be rounded/);
  let state = await inspect(page);
  assert.equal(state.interaction?.kind, "body-edge-finish");
  assert.ok(await input.evaluate((element) => document.activeElement === element));
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.ok(await page.getByRole("button", { name: "Accept fillet", exact: true }).isDisabled());
  await page.keyboard.press("Escape");
  state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.deepEqual(state.document, original);
}
