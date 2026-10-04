import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const twist = (page) => page.getByRole("textbox", { name: "Extrusion twist", exact: true });
const glyph = (page) => page.getByRole("button", { name: "Drag extrusion twist", exact: true });
async function moveAxis(page, point, cancel = false) {
  const box = await page
    .getByRole("button", { name: "Position extrusion axis", exact: true })
    .boundingBox();
  assert.ok(box);
  await page.keyboard.down("Meta");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 5 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await inspect(page);
}
async function guard(page, disabled) {
  await page.waitForFunction(
    (disabled) => document.querySelector('[aria-label="Extrusion twist"]')?.disabled === disabled,
    disabled,
  );
  assert.equal(await twist(page).isDisabled(), disabled);
  assert.equal(await glyph(page).isDisabled(), disabled);
  assert.equal(
    await page.getByRole("button", { name: "Position extrusion axis", exact: true }).isEnabled(),
    true,
  );
  if (disabled) {
    assert.match(await twist(page).getAttribute("title"), /around its own axis does not change/);
    assert.match(await glyph(page).getAttribute("title"), /Move the axis/);
    await glyph(page).hover();
  }
}

async function deleteAndClear(page, accepted) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  let state = await inspect(page);
  assert.deepEqual(state.document.bodies, []);
  assert.deepEqual(state.document.sketches, accepted.sketches);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "edit sketch", "edit-sketch");
  await chooseTool(page, "clear sketch", "clear-sketch");
  state = await inspect(page);
  assert.equal(state.document.sketches[0].curves.length, 0);
  assert.deepEqual(state.document.bodies, accepted.bodies);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
}

async function reeditCap(page, accepted) {
  await orient(page, [0, 0, 1]);
  const cap = await project(page, [5, -5, 20]);
  await page.mouse.click(cap.x, cap.y);
  const state = await inspect(page);
  const capFace = accepted.bodies[0].faces.find(
    (face) => face.plane && Math.abs(face.plane.origin[2] - 20) < 1e-6,
  );
  assert.ok(capFace);
  assert.equal(state.modelingSelection.length, 1);
  assert.equal(state.modelingSelection[0]?.face, capFace.id);
  await page.keyboard.press("e");
  await guard(page, true);
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await inspect(page);
  await page.getByRole("button", { name: "Cancel extrusion", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, accepted);
}

await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("c");
    await drag(page, [0, 0], [10, 0]);
    await chooseTool(page, "return to modeling", "modeling");
    const center = await project(page, [0, 0, 0]);
    await page.mouse.click(center.x, center.y);
    await guard(page, true);
    const document = (await inspect(page)).document;
    const offset = await project(page, [5, 0, 0]);
    await moveAxis(page, offset, true);
    await guard(page, true);
    await moveAxis(page, offset);
    await guard(page, false);
    assert.deepEqual((await inspect(page)).document, document);
    const length = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
    await length.fill("20");
    await inspect(page);
    const started = performance.now();
    await twist(page).fill("90");
    let state = await inspect(page);
    assert.ok(performance.now() - started < 8000);
    assert.ok(state.preview?.bodies?.length, await page.getByRole("status").textContent());
    assert.ok(Math.abs(state.preview.bodies[0].volume - 2000 * Math.PI) < 1e-5);
    assert.deepEqual(state.document, document);
    await twist(page).fill("bad");
    assert.equal((await inspect(page)).preview, null);
    assert.ok(
      await page.getByRole("button", { name: "Accept extrusion", exact: true }).isDisabled(),
    );
    await moveAxis(page, center);
    await guard(page, true);
    state = await inspect(page);
    assert.ok(
      state.preview.bodies[0].faces.some((face) => face.cylinder),
      "Returning the axis restores an analytic cylinder",
    );
    await moveAxis(page, offset);
    await guard(page, false);
    assert.equal((await inspect(page)).preview, null);
    await twist(page).fill("90");
    await inspect(page);
    await page.screenshot({ path: `.cache/sketch-review/${name}-circle-twist.png` });
    // The delayed cleanup probe can briefly disable Accept during a click.
    await page.waitForFunction(
      () =>
        document.querySelector(".extrude-controls .commit-cleanup")?.getAttribute("aria-busy") ===
        "false",
    );
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.makeshiftInspect();
      return !state.busy && !state.interaction && state.document.bodies?.length === 1;
    });
    const accepted = (await inspect(page)).document;
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await reeditCap(page, accepted);
    await deleteAndClear(page, accepted);
    console.log(
      `${name}: circle twist guard/tooltip, axis cancel/reposition/recenter, real preview, acceptance/history, cap re-edit and Delete/Clear passed`,
    );
  },
  { timeout: 30000 },
);
