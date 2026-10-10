import { project } from "../../tests/ui-blend-edit.mjs";
import { inspect, settled } from "../../tests/ui-helpers.mjs";

/** Frame the subject before the first recorded frame, through ordinary navigation. */
export async function prepareCamera(page, focus) {
  const state = await inspect(page);
  const bounds = state.document.bodies?.[0]?.bounds;
  const center =
    focus ??
    (bounds ? bounds.slice(0, 3).map((value, i) => (value + bounds[i + 3]) / 2) : [0, 0, 0]);
  await page.mouse.move(600, 320);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(44 / state.camera.height) / 0.01);
  await page.keyboard.up("Control");
  await settled(page);
  const point = await project(page, center);
  await page.mouse.move(600, 330);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(600 + 580 - point.x, 330 + 330 - point.y, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await settled(page);
  await page.mouse.move(800, 590);
}
