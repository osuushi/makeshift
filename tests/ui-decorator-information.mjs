import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { openThreadAdvanced } from "./ui-decorator-advanced.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function decoratorInformationRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  await drag(page, [0, 0], [4, 0]);
  const ring = await at(page, 0, -6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(ring.x, ring.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  await chooseTool(page, "threads", "threads");
  await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("metric");
  await openThreadAdvanced(page);
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  await pitch.fill("8");
  await pitch.press("Enter");
  await inspect(page);
  assert.doesNotMatch(
    await page.getByRole("region", { name: "Decorators", exact: true }).innerText(),
    /Reference Ø/,
  );
  await page.getByRole("button", { name: "Show affected faces", exact: true }).click();
  const selection = (await inspect(page)).modelingSelection;
  assert.equal(selection.length, 2);
  assert.ok(selection.every((s) => s.kind === "face"));
  await page.getByRole("combobox", { name: "Cut into", exact: true }).selectOption("hole");
  await inspect(page);
  assert.equal(
    await page.getByRole("button", { name: "Show affected faces", exact: true }).count(),
    0,
  );
  assert.doesNotMatch(
    await page.getByRole("region", { name: "Decorators", exact: true }).innerText(),
    /rod minor diameter/,
  );
}
