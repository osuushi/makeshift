import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { viewerExtrudeRoute } from "./ui-viewer-extrude.mjs";

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
  // Controller kind changes internally; the user-facing toolbox must keep the primitive.
  assert.equal(
    await page.locator(`.toolbox-grid [data-tool="${tool}"]`).getAttribute("aria-pressed"),
    "true",
  );
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
    await viewerExtrudeRoute(page, name);
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
        await page
          .locator(tool === "sphere" ? ".revolve-options" : ".axial-panel")
          .getByRole("button", { name: "Union", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      if (tool === "cone") assert.equal(s.preview.bodies[0].faces.length, 2);
      if (tool === "sphere") assert.equal(s.document.sketches[0].curves[1].kind, "segment");
      await accept(page);
      assert.equal((await inspect(page)).document.bodies.length, 1);
      assert.equal(await page.locator(`.toolbox-grid [data-tool="${tool}"]`).count(), 1);
    }
    await backSidePrimitives(page);
    console.log(
      `${name}: Primitive sketch, pointer release and editable Extrude/Revolve handoffs passed`,
    );
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);

async function backSidePrimitives(page) {
  for (const tool of ["cube", "cylinder", "cone"]) {
    await reset(page);
    await orient(page, [0.15, 0.2, -1]);
    await settled(page);
    const state = await clickTool(page, tool, [0, 0, 0]);
    const body = state.preview.bodies[0];
    assert.ok(body.center[2] < 0, `${tool} extends toward the underside viewer`);
    assert.ok(Math.abs(body.bounds[5]) < 1e-6, `${tool} keeps its footprint on XY`);
    assert.ok(
      Number(await page.getByLabel("Extrusion distance", { exact: true }).inputValue()) > 0,
    );
    await accept(page);
    assert.deepEqual((await inspect(page)).document.bodies[0].bounds, body.bounds);
  }
}
