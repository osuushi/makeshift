import assert from "node:assert/strict";
import { placed } from "./primitives.mjs";

async function preview(a, page) {
  await a.run(() =>
    page.waitForFunction(
      () =>
        window.makeshiftInspect().decoratorPreviewBounds.length > 0 &&
        !document.querySelector(".decorator-preview-status")?.matches(":not([hidden])"),
    ),
  );
}
async function preset(a, page, label, value) {
  await a.run(() => page.getByRole("combobox", { name: label, exact: true }).selectOption(value));
  await preview(a, page);
}

export async function threads(page, c, a) {
  await a.tool("cylinder");
  await a.dragWorld([-14, 0, 0], [-10, 0, 0], 0.8);
  await placed(a, 1);
  await page.keyboard.press("Escape");
  await a.tool("cube");
  await a.dragWorld([0, -8, 0], [16, 8, 0], 0.6);
  await placed(a, 2);
  await page.keyboard.press("Escape");
  const beforeDrill = (await a.state()).document.bodies[1].volume;
  await a.tool("drill");
  await a.dragWorld([8, 0, 16], [12, 0, 16], 1);
  await placed(a, 2);
  const drilled = (await a.state()).document.bodies;
  assert.ok(drilled[1].volume < beforeDrill);
  await page.keyboard.press("Escape");
  await a.click([-14, -4, 4]);
  await a.tool("threads");
  await preview(a, page);
  await c.hold(0.7);
  await preset(a, page, "Preset", "fdm-coarse");
  await page.keyboard.press("Escape");
  // Far inner wall is visible through the top opening from the ground view.
  await a.click([8, 4, 13]);
  assert.ok((await a.state()).modelingSelection.some((target) => target.kind === "face"));
  await a.tool("threads");
  await preview(a, page);
  await preset(a, page, "Preset", "fdm-coarse");
  await preset(a, page, "Cut into", "hole");
  const state = await a.state();
  assert.equal(state.document.decorators.length, 2);
  assert.deepEqual(state.document.bodies, drilled);
  const [rod, hole] = state.document.decorators;
  assert.equal(rod.settings.cut, "rod");
  assert.equal(hole.settings.cut, "hole");
  for (const key of ["pitch", "profile", "hand"])
    assert.equal(rod.settings[key], hole.settings[key]);
  const supports = state.document.decorators.map((d) => {
    const target = d.faces[0];
    return state.document.bodies
      .find((b) => b.id === target.body)
      .faces.find((f) => f.id === target.face).cylinder;
  });
  assert.ok(Math.abs(supports[0].radius - supports[1].radius) < 1e-6);
}

export async function knurling(page, c, a) {
  const original = (await a.state()).document.bodies;
  await a.tool("knurling");
  await preview(a, page);
  await c.hold(0.8);
  await preset(a, page, "Preset", "coarse");
  await c.hold(0.8);
  await preset(a, page, "Preset", "fine");
  const state = await a.state();
  assert.equal(state.document.decorators[0].definition, "freac.knurling");
  assert.equal(state.document.decorators[0].settings.preset, "fine");
  assert.deepEqual(state.document.bodies, original);
}
