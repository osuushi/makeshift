import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Touch camera capture used to swallow every stationary finger tap before the
// canonical-plane/model handlers; synthesized mouse-only tests cannot catch it.
export async function tabletEntryRoute(page, name) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 2 });
    Object.defineProperty(navigator, "platform", { value: "MacIntel" });
  });
  await reset(page);
  await orient(page, [0.2, 0.2, 1]);
  let p = await findRaycastPoint(page, "XY");
  await page.touchscreen.tap(p.x, p.y);
  assert.equal((await inspect(page)).activePlane, null);
  await page.keyboard.press("Meta+Enter");
  assert.equal((await inspect(page)).activePlane, "XY");
  await chooseTool(page, "return to modeling", "modeling");
  p = await findRaycastPoint(page, "XY");
  await page.touchscreen.tap(p.x, p.y);
  await page.touchscreen.tap(p.x, p.y);
  assert.equal((await inspect(page)).activePlane, "XY", "Finger double tap enters world plane");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  const hideSketch = page.getByRole("button", { name: "Hide Sketch 1", exact: true });
  if (await hideSketch.isVisible()) await hideSketch.click();
  await orient(page, [1, -1, 1]);
  p = await project(page, [3, -10, 5]);
  await page.touchscreen.tap(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.keyboard.press("Meta+Enter");
  assert.ok((await inspect(page)).activePlane, "Finger face selection then Cmd-Enter enters face");
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [1, -1, 1]);
  p = await project(page, [3, -10, 5]);
  await page.touchscreen.tap(p.x, p.y);
  await page.touchscreen.tap(p.x, p.y);
  assert.ok((await inspect(page)).activePlane, "Finger double tap enters planar face");
  assert.match(
    await page.getByRole("button", { name: "Search tools", exact: true }).textContent(),
    /⌘P/,
  );
  await page.keyboard.press("Meta+p");
  await page.getByRole("dialog", { name: "Find a tool" }).waitFor();
  await page.keyboard.press("Escape");
  // Exercise the iPad key-command fallback separately: desktop engines do not
  // reproduce UIKit's native Find dispatch, so device retesting remains required.
  assert.equal(
    await page.evaluate(() => {
      const event = new KeyboardEvent("keypress", {
        key: "p",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    true,
  );
  await page.getByRole("dialog", { name: "Find a tool" }).waitFor();
  await selectedFacePlane(page);
  console.log(
    `${name}: finger entry, keyboard/keypress shortcuts and selected-face plane creation passed`,
  );
}

async function selectedFacePlane(page) {
  await page.keyboard.press("Escape");
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [1, -1, 1]);
  const p = await project(page, [3, -10, 5]);
  await page.touchscreen.tap(p.x, p.y);
  const selected = await inspect(page);
  const target = selected.modelingSelection[0];
  assert.equal(target.kind, "face");
  const frame = selected.document.bodies
    .find((b) => b.id === target.body)
    .faces.find((f) => f.id === target.face).plane;
  await chooseTool(page, "construction plane", "construction-plane");
  const created = await inspect(page);
  assert.deepEqual(created.document.constructionPlanes[0].frame, frame);
  assert.equal(created.interaction, null, "Selected face creates immediately and leaves idle Move");
  assert.equal(created.modelingTool, "move");
}
