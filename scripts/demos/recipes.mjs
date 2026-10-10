import assert from "node:assert/strict";
import { orient } from "../../tests/ui-blend-edit.mjs";
import { plate } from "../../tests/ui-body-fillet.mjs";
import { decoratorCylinder } from "../../tests/ui-decorator-cylinder.mjs";
import { drag, settled } from "../../tests/ui-helpers.mjs";
import { chooseTool } from "../../tests/ui-tools.mjs";
import { solid } from "./actions.mjs";

async function sketchSetup(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
}
async function profileSetup(page) {
  await sketchSetup(page);
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [3, -7], [11, 7], ["Shift"]);
  await chooseTool(page, "return to modeling", "modeling");
}
async function topSetup(page) {
  await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
  await settled(page);
}

export const recipes = [
  {
    id: "primitives",
    title: "Primitives",
    description: "Start with a solid shape and adjust its size.",
    setup: topSetup,
    async record(page, c, a) {
      await a.tool("cube");
      await a.click([0, 0, 0]);
      await a.run(() =>
        page.waitForFunction(() => !!window.makeshiftInspect().preview?.bodies.length),
      );
      await c.hold(0.5);
      await a.accept();
      await solid(a);
      await a.run(() => orient(page, [1, -1, 1]));
    },
  },
  {
    id: "sketching",
    title: "Sketching",
    description: "Draw a profile with ordinary curves.",
    setup: sketchSetup,
    async record(page, c, a) {
      await a.tool("rectangle");
      await a.draw([-12, -9], [12, 9]);
      await c.hold(0.4);
      await a.tool("circle");
      await a.draw([0, 0], [5, 0]);
      await page.keyboard.press("Escape");
      const sketch = (await a.state()).document.sketches[0];
      assert.equal(sketch.curves.filter((v) => v.kind === "segment").length, 4);
      assert.equal(sketch.curves.filter((v) => v.kind === "circle").length, 1);
    },
  },
  {
    id: "extrude",
    title: "Extrude",
    description: "Give a flat profile some depth.",
    setup: profileSetup,
    async record(page, c, a) {
      await a.click([7, 0, 0]);
      await a.button("Drag extrusion");
      await a.fill("Extrusion distance", 12);
      assert.ok((await a.state()).preview.bodies[0].volume > 0);
      await c.hold(0.6);
      await a.accept();
      const body = await solid(a);
      assert.ok(Math.abs(body.volume - 8 * 14 * 12) < 1);
      await a.run(() => orient(page, [1, -1, 1]));
    },
  },
  {
    id: "revolve",
    title: "Revolve",
    description: "Turn a profile around an axis.",
    setup: profileSetup,
    async record(page, c, a) {
      await a.click([7, 0, 0]);
      await a.tool("revolve");
      await a.click([0, -12, 0]);
      await a.fill("Revolution angle", 270);
      assert.ok((await a.state()).preview.bodies[0].volume > 0);
      await c.hold(0.6);
      await a.button("Accept revolution");
      const body = await solid(a);
      assert.ok(Math.abs(body.volume - Math.PI * (121 - 9) * 14 * 0.75) < 1);
      await a.run(() => orient(page, [1, -0.5, 1]));
    },
  },
  {
    id: "edge-finishes",
    title: "Fillet & chamfer",
    description: "Round an edge or give it a bevel.",
    setup: plate,
    async record(page, c, a) {
      const original = (await a.state()).document.bodies[0].volume;
      await a.button("Fillet edges");
      await a.fill("Fillet radius", 3);
      assert.ok((await solid(a)).volume < original);
      await a.run(() => orient(page, [-1, 1, 1]));
      await c.hold(1);
      await a.tool("undo");
      await a.run(() => orient(page, [0, 0, 1]));
      await page.keyboard.press("Escape");
      await a.click([0, 10, 10]);
      await a.tool("chamfer");
      await a.button("Chamfer edges");
      await a.fill("Chamfer distance", 3);
      assert.ok((await solid(a)).volume < original);
      await a.run(() => orient(page, [-1, 1, 1]));
    },
  },
  ...["threads", "knurling"].map((id) => ({
    id,
    title: id === "threads" ? "Threads" : "Knurling",
    description:
      id === "threads"
        ? "Add screw threads to a cylindrical face."
        : "Add an adjustable grip pattern.",
    setup: (page) => decoratorCylinder(page, 8, 14),
    async record(page, c, a) {
      const original = (await a.state()).document.bodies;
      await a.tool(id);
      await a.run(() =>
        page.waitForFunction(
          () =>
            window.makeshiftInspect().decoratorPreviewBounds.length > 0 &&
            !document.querySelector(".decorator-preview-status")?.matches(":not([hidden])"),
        ),
      );
      await c.hold(0.6);
      if (id === "threads")
        await a.run(() =>
          page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("fdm-coarse"),
        );
      else
        await a.run(() =>
          page.getByRole("combobox", { name: "Knurl preset", exact: true }).selectOption("coarse"),
        );
      await a.run(() =>
        page.waitForFunction(
          () =>
            window.makeshiftInspect().decoratorPreviewBounds.length > 0 &&
            !document.querySelector(".decorator-preview-status")?.matches(":not([hidden])"),
        ),
      );
      const state = await a.state();
      assert.equal(state.document.decorators[0].definition, `freac.${id}`);
      assert.deepEqual(state.document.bodies, original);
      if (id === "threads") assert.equal(state.document.decorators[0].settings.pitch, 1.5);
      else assert.equal(state.document.decorators[0].settings.preset, "coarse");
      await page.keyboard.press("Escape");
    },
  })),
];
