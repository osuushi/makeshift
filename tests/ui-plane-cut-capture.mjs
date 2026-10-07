import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/plane-cut-bent-shell.json", "utf8"));
export async function planeCutCaptureRoute(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "plane-cut-bent-shell.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  const original = (await inspect(page)).document;
  await orient(page, [1, -1, 1]);
  for (const plane of ["YZ", "XY", "XZ"]) {
    if (!(await inspect(page)).modelingSelection.length)
      await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await chooseTool(page, "Split Body", "split");
    await pickPlane(page, plane);
    const state = await inspect(page);
    assert.ok(
      state.preview?.bodies.length >= 2,
      `${name} ${plane}: ${state.notice}; ${await page.locator(".plane-cut-widget").textContent()}`,
    );
    assert.deepEqual(state.document, original);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    const history = await page.evaluate(() => window.makeshiftHistory());
    const frames = {
      YZ: { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
      XY: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
      XZ: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
    };
    assert.deepEqual(history.at(-1).operation.parameters.operation.frame, frames[plane]);
  }
  if (!(await inspect(page)).modelingSelection.length)
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "Split Body", "split");
  await pickPlane(page, "YZ");
  await inspect(page);
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  assert.equal(after.bodies.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await bodyArchiveRoute(page, `${name}-plane-cut`);
  const beforeMove = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("3");
  await inspect(page);
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document.bodies[0];
  assert.notEqual(moved.brep, beforeMove.bodies[0].brep);
  assert.ok(Math.abs(moved.center[0] - beforeMove.bodies[0].center[0] - 3) < 1e-7);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document.bodies.map((b) => b.brep),
    beforeMove.bodies.map((b) => b.brep),
  );
  console.log(`${name}: captured plane cuts, cancel, history, archive and subsequent Move passed`);
}
