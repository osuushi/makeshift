import { project } from "../../tests/ui-blend-edit.mjs";
import { inspect, settled } from "../../tests/ui-helpers.mjs";

/** Frame the subject before the first recorded frame, through ordinary navigation. */
export async function prepareCamera(page, focus, height = 44) {
  const state = await inspect(page);
  const bounds = state.document.bodies?.[0]?.bounds;
  const center =
    focus ??
    (bounds ? bounds.slice(0, 3).map((value, i) => (value + bounds[i + 3]) / 2) : [0, 0, 0]);
  await page.mouse.move(600, 320);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(height / state.camera.height) / 0.01);
  await page.keyboard.up("Control");
  await settled(page);
  const point = await project(page, center);
  // Trackpad scroll avoids the browser's middle-click primary-selection paste.
  await page.mouse.wheel(point.x - 580, point.y - 330);
  await settled(page);
  await page.mouse.move(800, 590);
}
