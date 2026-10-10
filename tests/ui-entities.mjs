import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function entitiesRoute(page, name) {
  await reset(page);
  const list = await page.getByRole("complementary", { name: "Entities" }).boundingBox();
  const toolbox = await page.locator(".toolbox").boundingBox();
  const more = await page.getByRole("button", { name: "More tools", exact: true }).boundingBox();
  assert.ok(list.x < 40 && toolbox.x < 40 && toolbox.y > list.y + list.height);
  assert.ok(more.x >= toolbox.x && more.y >= toolbox.y);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  await page.keyboard.press("l");
  await drag(page, [-8, 3], [8, 3]);
  const pick = await at(page, 5, -3);
  const lineY = (await inspect(page)).document.sketches[0].curves.at(-1).a.y;
  const line = await at(page, 5, lineY);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0].kind, "body");
  await page.mouse.click(900, 700);
  await page.mouse.move(900, 720);
  const clip = { x: Math.round(line.x - 20), y: Math.round(line.y - 8), width: 40, height: 16 };
  const buried = await page.screenshot({ clip });
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await page.mouse.move(900, 720);
  const absent = await page.screenshot({ clip });
  assert.deepEqual(buried, absent, "Buried line and sketch fill are completely occluded");
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await page.mouse.move(900, 720);
  assert.notDeepEqual(
    await page.screenshot({ clip }),
    absent,
    "Hiding the body reveals the source",
  );
  await page.mouse.click(pick.x, pick.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "profile");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activeSketch, accepted.sketches[0].id);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("l");
  await drag(page, [-8, 3], [8, 3]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(900, 700);
  await page.mouse.move(900, 720);
  const surface = await page.screenshot({ clip });
  await page.getByRole("button", { name: "Hide Sketch 2", exact: true }).click();
  await page.mouse.move(900, 720);
  assert.notDeepEqual(
    await page.screenshot({ clip }),
    surface,
    "Coplanar surface sketch stays visible",
  );
  assert.deepEqual((await inspect(page)).document.bodies, accepted.bodies);
  await page.getByRole("button", { name: "Show Sketch 2", exact: true }).click();
  await page.screenshot({ path: `.cache/sketch-review/${name}-entities.png` });
  console.log(
    `${name}: entity selection/visibility/editing, buried sketch occlusion and surface visibility passed`,
  );
}
