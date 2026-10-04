import assert from "node:assert/strict";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("c");
    await drag(page, [0, 0], [8, 0]);
    const input = page.getByRole("textbox", { name: "Radius", exact: true });
    await input.fill("9");
    const point = await at(page, 9, 0);
    await page.evaluate(async () => {
      const { DimensionFieldDraft } = await import("/dimension-field-draft.ts");
      const original = DimensionFieldDraft.prototype.finish;
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      window.switchProbe = {
        reached: false,
        release,
        restore: () => {
          DimensionFieldDraft.prototype.finish = original;
        },
      };
      DimensionFieldDraft.prototype.finish = async function () {
        const accepted = await original.call(this);
        if (accepted && !window.switchProbe.reached) {
          window.switchProbe.reached = true;
          await held;
        }
        return accepted;
      };
    });
    const switching = chooseTool(page, "Rectangle", "rectangle");
    try {
      await page.waitForFunction(() => window.switchProbe.reached);
      const before = await inspect(page);
      assert.equal(before.busy, false);
      assert.equal(before.interaction, null, "The real numeric edit has accepted and released");
      close(before.document.sketches[0].curves[0].radius, 9);
      assert.ok(before.commands.some((c) => c.unavailable === "Switching tools…"));
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 20, point.y + 20);
      await page.mouse.up();
      await page.locator("canvas").focus();
      await page.keyboard.press("v");
      await input.focus();
      const during = await inspect(page);
      assert.equal(
        during.interaction,
        null,
        "Pointer/key/field input cannot acquire another edit during switch completion",
      );
      assert.equal(during.tool, before.tool);
      assert.deepEqual(during.document, before.document);
    } finally {
      await page.evaluate(() => {
        window.switchProbe.restore();
        window.switchProbe.release();
        delete window.switchProbe;
      });
      await switching;
    }
    await modalCompleted(page);
    const state = await inspect(page);
    assert.equal(state.tool, "rectangle");
    close(state.document.sketches[0].curves[0].radius, 9);
    console.log(
      `${name}: real accepted/released numeric completion held; canvas/key/focus ownership excludes a second edit until requested mode completes`,
    );
  },
  { viewport: { width: 1280, height: 800 }, timeout: 30000 },
);
