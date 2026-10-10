import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function clickTool(page, tool, point) {
  await chooseTool(page, tool, tool);
  const p = await project(page, point);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => {
    const s = window.makeshiftInspect();
    return (
      !s.busy && ["extrude", "revolve"].includes(s.interaction?.kind) && !!s.preview?.bodies?.length
    );
  });
  return inspect(page);
}
async function accept(page) {
  await page.getByLabel("Modeling viewport").focus();
  await page.keyboard.press("Enter");
  await modalCompleted(page);
}

// Compact integration gate: real release -> accepted sketch -> editable native preview.
await withUiRuntimes(
  async (page, name) => {
    for (const tool of ["cylinder", "cone", "sphere"]) {
      await reset(page);
      await page
        .getByRole("button", { name: "Top view", exact: true })
        .locator("polygon")
        .dblclick();
      await settled(page);
      const s = await clickTool(page, tool, [0, 0, 0]);
      assert.equal(s.interaction.kind, tool === "sphere" ? "revolve" : "extrude");
      assert.equal(s.document.sketches[0].curves[0].kind, "circle");
      assert.equal(s.document.bodies?.length ?? 0, 0);
      assert.equal(
        await page.getByRole("button", { name: "Union", exact: true }).getAttribute("aria-pressed"),
        "true",
      );
      if (tool === "cone") assert.equal(s.preview.bodies[0].faces.length, 2);
      if (tool === "sphere") assert.equal(s.document.sketches[0].curves[1].kind, "segment");
      await accept(page);
      assert.equal((await inspect(page)).document.bodies.length, 1);
    }
    await reset(page);
    await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
    await settled(page);
    const cube = await clickTool(page, "cube", [0, 0, 0]);
    const size = cube.preview.bodies[0].bounds[5];
    await accept(page);
    const cut = await clickTool(page, "drill", [size / 2, size / 2, size]);
    assert.equal(cut.interaction.kind, "extrude");
    assert.ok(
      Number(await page.getByLabel("Extrusion distance", { exact: true }).inputValue()) < 0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Subtract", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(cut.preview.bodies[0].volume < cube.preview.bodies[0].volume);
    await accept(page);
    assert.ok((await inspect(page)).document.bodies[0].volume > 0);
    console.log(
      `${name}: Primitive sketch, pointer release and editable Extrude/Revolve handoffs passed`,
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
