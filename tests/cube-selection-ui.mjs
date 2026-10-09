import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    for (const finish of ["button", "enter", "click-off"]) {
      await reset(page);
      await page
        .getByRole("button", { name: "Top view", exact: true })
        .locator("polygon")
        .dblclick();
      await settled(page);
      await chooseTool(page, "cube", "cube");
      const start = await project(page, [0, 0, 0]);
      const end = await project(page, [20, 16, 0]);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(() => {
        const s = window.makeshiftInspect();
        return !s.busy && s.interaction?.kind === "extrude" && !!s.preview?.bodies?.length;
      });
      if (finish === "button")
        await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
      else if (finish === "enter") await page.keyboard.press("Enter");
      else {
        const box = await page.getByLabel("Modeling viewport").boundingBox();
        await page.mouse.click(box.x + 30, box.y + box.height - 30);
      }
      await page.waitForFunction(() => !window.makeshiftInspect().interaction);
      const face = await project(page, [10, 8, 16]);
      await page.mouse.click(face.x, face.y);
      const state = await inspect(page);
      assert.equal(state.modelingSelection.length, 1, `${finish}: first click selects`);
      assert.equal(state.modelingSelection[0].kind, "face", `${finish}: selects the cap`);
    }
    console.log(
      `${name}: first face click after Cube button, Enter and click-off completion passed`,
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
