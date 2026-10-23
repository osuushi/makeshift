import assert from "node:assert/strict";
import { drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Catalog/toolbox choices, regenerated SVG widgets and native geometry acceptance
// meet here; pure layer-state or numeric-owner tests cannot cover this dispatch.
export async function transformLayersKeyboardRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [4, 7], [24, 27]);
  await page.keyboard.press("v");
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("m");
  await layers(page, ["move"]);
  assert.equal(await page.locator(".scale-widget:visible").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Move layer", exact: true }).isDisabled(),
    true,
  );
  const group = page.locator(".toolbox-grid > .toolbox-row").nth(1);
  await group.locator(".toolbox-expand").click();
  assert.deepEqual(
    await page
      .locator(".toolbox-flyout .toolbox-item[data-tool]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.tool)),
    ["move", "rotate", "scale", "transform"],
  );
  await page.locator('.toolbox-flyout .toolbox-item[data-tool="scale"]').click();
  await layers(page, ["scale"]);
  assert.ok(await page.locator(".transform-box-handle:visible").count());
  assert.equal(await page.locator("[data-move-marker]:visible").count(), 0);
  await chooseTool(page, "move", "move");
  await page.getByRole("button", { name: "Rotate layer", exact: true }).click();
  await layers(page, ["move", "rotate"]);
  await chooseTool(page, "scale", "scale");
  await layers(page, ["scale"]);
  await page.keyboard.press("Meta+t");
  await layers(page, ["move", "rotate"]);
  await chooseTool(page, "rotate", "rotate");
  await layers(page, ["rotate"]);
  await page.keyboard.press("Meta+t");
  await layers(page, ["move", "rotate"]);
  await page.keyboard.press("m");
  await layers(page, ["move"]);
  await page.keyboard.press("Meta+t");
  await layers(page, ["move", "rotate"]);
  console.log(
    `${name}: toolbox singles, additive layers, last-layer guard and shortcut recall passed`,
  );

  await sketchKeyboard(page, name);
  await sketchScaleHandoff(page, name);
  await placementKeyboard(page, name);
}

async function layers(page, active) {
  for (const layer of ["move", "rotate", "scale"]) {
    const title = layer[0].toUpperCase() + layer.slice(1);
    await page.waitForFunction(
      ({ title, enabled }) => {
        const button = document.querySelector(
          `.transform-layers button[aria-label="${title} layer"]`,
        );
        return button?.getAttribute("aria-pressed") === String(enabled);
      },
      { title, enabled: active.includes(layer) },
    );
  }
}
async function sketchActive(page, marker, label) {
  await page.waitForFunction(
    ({ marker, label }) => {
      const node = document.querySelector(`[data-move-marker="${marker}"]`);
      return (
        document.documentElement.dataset.keyboardSketchWidget === marker &&
        !!node &&
        getComputedStyle(node).outlineStyle === "solid" &&
        document.activeElement?.getAttribute("aria-label") === label
      );
    },
    { marker, label },
  );
}

async function sketchKeyboard(page, name) {
  await chooseTool(page, "move", "move");
  const beforeSketch = (await inspect(page)).document;
  await page.keyboard.press("Tab");
  await sketchActive(page, "x", "Move X");
  const moveX = page.getByRole("textbox", { name: "Move X", exact: true });
  await moveX.fill("bad");
  await page.keyboard.press("Tab");
  assert.equal(await moveX.getAttribute("aria-invalid"), "true");
  assert.equal(await moveX.inputValue(), "bad");
  await sketchActive(page, "x", "Move X");
  await moveX.fill("2");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const movedSketch = (await inspect(page)).document;
  assert.ok(
    Math.abs(movedSketch.sketches[0].curves[0].a.x - beforeSketch.sketches[0].curves[0].a.x - 2) <
      1e-6,
  );
  assert.equal(await page.locator(".keyboard-widget-active").count(), 0);
  assert.equal(await page.locator("html").getAttribute("data-keyboard-sketch-widget"), null);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, beforeSketch);
  await page.mouse.click(1120, 700);
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("m");
  await page.keyboard.press("Tab");
  await sketchActive(page, "x", "Move X");
  await page.keyboard.press("Tab");
  await sketchActive(page, "y", "Move Y");
  await page.keyboard.press("Shift+Tab");
  await sketchActive(page, "x", "Move X");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("html").getAttribute("data-keyboard-sketch-widget"), null);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-keyboard-sketch.png` });
  console.log(
    `${name}: SVG Tab activation, highlight, invalid draft guard, real move and Undo passed`,
  );
}

export async function bodyKeyboardRoute(page, name) {
  const body = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await layers(page, ["move"]);
  assert.equal(await page.locator(".scale-widget:visible").count(), 0);
  await page.keyboard.press("Tab");
  const bodyX = page.getByRole("textbox", { name: "Body translation X", exact: true });
  await bodyX.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Body translation X",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Move body X", exact: true })
      .evaluate((node) => node.classList.contains("keyboard-widget-active")),
    true,
  );
  await bodyX.fill("3");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.equal(await page.locator(".keyboard-widget-active").count(), 0);
  const movedBody = (await inspect(page)).document;
  assert.ok(Math.abs(movedBody.bodies[0].center[0] - body.bodies[0].center[0] - 3) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, body);
  await bodyScaleHandoff(page, name);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-keyboard-body.png` });
  console.log(
    `${name}: fresh body defaults Move; Tab widget highlight, exact native move and Undo passed`,
  );
}

async function placementKeyboard(page, name) {
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "move", "move");
  await layers(page, ["move"]);
  await page.getByRole("button", { name: "Rotate layer", exact: true }).click();
  await layers(page, ["move", "rotate"]);
  await page.keyboard.press("m");
  await layers(page, ["move"]);
  await page.keyboard.press("Meta+t");
  await layers(page, ["move", "rotate"]);
  await chooseTool(page, "move", "move");
  const before = (await inspect(page)).document;
  await tabToField(page, "Translation X");
  const x = page.getByRole("textbox", { name: "Translation X", exact: true });
  await x.fill("4");
  await page.keyboard.press("Tab");
  const y = page.getByRole("textbox", { name: "Translation Y", exact: true });
  await y.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Translation Y",
  );
  assert.ok(
    Math.abs(
      (await inspect(page)).document.sketches[0].plane.origin[0] -
        before.sketches[0].plane.origin[0] -
        4,
    ) < 1e-6,
  );
  await y.fill("3");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const moved = (await inspect(page)).document;
  assert.ok(
    Math.abs(moved.sketches[0].plane.origin[1] - before.sketches[0].plane.origin[1] - 3) < 1e-6,
  );
  assert.equal(await page.locator(".keyboard-widget-active").count(), 0);
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: 3D sketch layers and Tab axis handoff accept placement with separate Undo steps`,
  );
}

async function tabToField(page, label) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.keyboard.press("Tab");
    if (
      await page.evaluate(
        (label) => document.activeElement?.getAttribute("aria-label") === label,
        label,
      )
    )
      return;
  }
  assert.fail(`Tab did not reach ${label}`);
}

async function sketchScaleHandoff(page, name) {
  const before = (await inspect(page)).document;
  await chooseTool(page, "scale", "scale");
  await page.getByRole("button", { name: "Move layer", exact: true }).click();
  await page.locator(".transform-box-handle:visible").first().click();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.1");
  await inspect(page);
  await tabToField(page, "Move X");
  await sketchActive(page, "x", "Move X");
  const scaled = (await inspect(page)).document;
  assert.notDeepEqual(scaled, before, "Tab accepts the pending scale before opening Move");
  await page.getByRole("textbox", { name: "Move X", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.ok(
    Math.abs(
      (await inspect(page)).document.sketches[0].curves[0].a.x -
        scaled.sketches[0].curves[0].a.x -
        2,
    ) < 1e-6,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, scaled);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(`${name}: Scale -> SVG Move Tab handoff accepts separate geometry edits`);
}
async function bodyScaleHandoff(page, name) {
  const before = (await inspect(page)).document;
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:visible").first().click();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.1");
  const candidate = (await inspect(page)).preview;
  assert.notEqual(candidate.bodies[0].volume, before.bodies[0].volume);
  await tabToField(page, "Body translation X");
  const scaled = (await inspect(page)).document;
  assert.ok(Math.abs(scaled.bodies[0].volume - candidate.bodies[0].volume) < 1e-3);
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.ok(
    Math.abs((await inspect(page)).document.bodies[0].center[0] - scaled.bodies[0].center[0] - 2) <
      1e-6,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, scaled);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(`${name}: Scale -> body Move Tab handoff accepts separate native edits`);
}
