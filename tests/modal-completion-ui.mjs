import assert from "node:assert/strict";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function holdResult(page, kind = "shell") {
  await page.evaluate(async (kind) => {
    const { ModelClient } = await import("/model-client.ts");
    const request = ModelClient.prototype.request;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    window.calculationProbe = {
      reached: false,
      release,
      restore: () => {
        ModelClient.prototype.request = request;
      },
    };
    // Actual native geometry runs first; delay publication to the modal controller.
    ModelClient.prototype.request = async function (operation) {
      const result = await request.call(this, operation);
      if (operation.kind === kind) {
        window.calculationProbe.reached = true;
        await gate;
      }
      return result;
    };
  }, kind);
}

async function route(page, name) {
  for (const choice of ["Wait", "Cancel operation"]) {
    await decoratorCylinder(page, 8);
    const original = (await inspect(page)).document;
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await chooseTool(page, "shell", "shell");
    await holdResult(page);
    try {
      await page.getByRole("textbox", { name: "Shell thickness", exact: true }).fill("-1");
      await page.waitForFunction(() => window.calculationProbe.reached);
      const started = Date.now();
      await page.getByRole("button", { name: "Application settings", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Calculation in progress", exact: true });
      assert.equal(await dialog.isVisible(), false, "Calculation gets a 500 ms grace period");
      await dialog.waitFor({ state: "visible" });
      assert.ok(Date.now() - started >= 450, "Prompt respects the grace period");
      assert.deepEqual(
        (await inspect(page)).document,
        original,
        "No acceptance before the wait decision",
      );
      await dialog.getByRole("button", { name: choice, exact: true }).click();
      await page.evaluate(() => window.calculationProbe.release());
      await page
        .getByRole("dialog", { name: "Settings", exact: true })
        .waitFor({ state: "visible" });
      const state = await inspect(page);
      assert.equal(state.interaction, null);
      if (choice === "Wait") {
        assert.ok(state.document.bodies[0].volume < original.bodies[0].volume);
      } else
        assert.deepEqual(state.document, original, "Cancellation preserves the accepted document");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      if (choice === "Wait") {
        await chooseTool(page, "undo", "undo");
        assert.deepEqual(
          (await inspect(page)).document,
          original,
          "Wait accepts exactly one Undo step",
        );
        await chooseTool(page, "redo", "redo");
        assert.deepEqual((await inspect(page)).document, state.document);
      }
    } finally {
      await page.evaluate(() => {
        window.calculationProbe.release();
        window.calculationProbe.restore();
        delete window.calculationProbe;
      });
    }
  }
  console.log(
    `${name}: 500 ms prompt, Wait/Cancel, real shell geometry and exact Undo/Redo passed`,
  );
  await sketchPointerHandoff(page, name);
  await releasedGestureSwitch(page, name);
}

async function sketchPointerHandoff(page, name) {
  for (const value of ["9", "-1"]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("c");
    await drag(page, [-20, 0], [-12, 0]);
    const original = (await inspect(page)).document;
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill(value);
    await drag(page, [10, 0], [18, 0]);
    const accepted = (await inspect(page)).document;
    const circles = accepted.sketches[0].curves;
    assert.equal(circles.length, 2, "Buffered pointer completes the new drawing gesture");
    close(
      circles[0].radius,
      value === "9" ? 9 : 8,
      "Numeric edit commits or cancels before drawing",
    );
    close(circles[1].radius, 8, "New circle retains the physical drag");
    await chooseTool(page, "undo", "undo");
    const numeric = (await inspect(page)).document;
    assert.equal(numeric.sketches[0].curves.length, 1);
    if (value === "9") {
      close(numeric.sketches[0].curves[0].radius, 9, "First Undo removes the new gesture");
      await chooseTool(page, "undo", "undo");
    }
    assert.deepEqual((await inspect(page)).document, original);
  }
  console.log(`${name}: valid/invalid numeric modal→new circle handoff and separate Undo passed`);
}
async function releasedGestureSwitch(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await holdResult(page, "preview");
  try {
    const start = await at(page, -20, 0),
      end = await at(page, -12, 0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
    await page.waitForFunction(() => window.calculationProbe.reached);
    const switching = chooseTool(page, "Rectangle", "rectangle");
    const prompt = page.getByRole("dialog", { name: "Calculation in progress", exact: true });
    await prompt.waitFor({ state: "visible" });
    await prompt.getByRole("button", { name: "Wait", exact: true }).click();
    await page.evaluate(() => window.calculationProbe.release());
    await switching;
    const state = await inspect(page);
    assert.equal(state.interaction, null);
    assert.equal(state.tool, "rectangle", "Requested switch survives automatic gesture acceptance");
    assert.equal(state.document.sketches[0].curves.length, 1);
    close(
      state.document.sketches[0].curves[0].radius,
      8,
      "Released circle accepts its final solve",
    );
  } finally {
    await page.evaluate(() => {
      window.calculationProbe.release();
      window.calculationProbe.restore();
      delete window.calculationProbe;
    });
  }
  console.log(
    `${name}: switch awaits released gesture calculation and automatic acceptance passed`,
  );
}
const routes = { pointer: sketchPointerHandoff, release: releasedGestureSwitch };
assert.ok(!process.argv[2] || routes[process.argv[2]], "Unknown modal completion route");
await withUiRuntimes(routes[process.argv[2]] ?? route, {
  defaults: ["chromium", "webkit"],
  timeout: 20000,
});
