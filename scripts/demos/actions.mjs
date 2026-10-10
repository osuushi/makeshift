import assert from "node:assert/strict";
import { project } from "../../tests/ui-blend-edit.mjs";
import { at, inspect, settled } from "../../tests/ui-helpers.mjs";
import { chooseTool } from "../../tests/ui-tools.mjs";

export function actions(page, capture) {
  const run = (operation) => capture.action(operation, 30);
  const state = () => run(() => inspect(page));
  const tool = (id, query = id) =>
    run(async () => {
      const button = page.locator(`.toolbox [data-tool="${id}"]`);
      if (await button.count()) await button.click();
      else await chooseTool(page, query, id);
      await settled(page);
    });
  const click = async (xyz) => {
    const point = await run(() => project(page, xyz));
    await page.mouse.click(point.x, point.y);
    await run(() => settled(page));
  };
  const draw = async (from, to) => {
    const a = await run(() => at(page, ...from));
    const b = await run(() => at(page, ...to));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(a.x + ((b.x - a.x) * i) / 24, a.y + ((b.y - a.y) * i) / 24);
      await capture.frame();
    }
    await page.mouse.up();
    await run(() => settled(page));
  };
  const fill = (label, value, role = "textbox") =>
    run(async () => {
      const input = page.getByRole(role, { name: label, exact: true });
      await input.fill(String(value));
      await input.press("Enter");
      await settled(page);
    });
  const button = (name) => run(() => page.getByRole("button", { name, exact: true }).click());
  const accept = async () => {
    await run(() => page.getByLabel("Modeling viewport", { exact: true }).focus());
    await page.keyboard.press("Enter");
    await run(() =>
      page.waitForFunction(() => {
        const s = window.makeshiftInspect();
        return !s.busy && s.interaction === null;
      }),
    );
  };
  return { run, state, tool, click, draw, fill, button, accept };
}

export async function solid(a) {
  const s = await a.state();
  assert.equal(s.document.bodies.length, 1);
  assert.ok(s.document.bodies[0].volume > 0);
  assert.equal(s.interaction, null);
  return s.document.bodies[0];
}

export async function pointer(page) {
  await page.evaluate(() => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:-50px;top:-50px;width:14px;height:14px;border:2px solid #7951a4;border-radius:50%;background:#7951a433;transform:translate(-50%,-50%);z-index:10001;pointer-events:none";
    document.body.append(dot);
    document.addEventListener(
      "pointermove",
      (e) => {
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      () => {
        dot.style.background = "#7951a4aa";
      },
      true,
    );
    document.addEventListener(
      "pointerup",
      () => {
        dot.style.background = "#7951a433";
      },
      true,
    );
  });
}

export async function frameResult(page, capture, a) {
  await page.keyboard.press("Escape");
  const state = await a.state();
  await page.mouse.move(600, 320);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(40 / state.camera.height) / 0.01);
  await page.keyboard.up("Control");
  await a.run(() => settled(page));
  const bounds = state.document.bodies?.[0]?.bounds;
  const center = bounds
    ? bounds.slice(0, 3).map((value, i) => (value + bounds[i + 3]) / 2)
    : [0, 0, 0];
  const point = await a.run(() => project(page, center));
  // Middle-button pan uses the ordinary viewport route and leaves model data untouched.
  await page.mouse.move(600, 330);
  await page.mouse.down({ button: "middle" });
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(600 + ((580 - point.x) * i) / 15, 330 + ((330 - point.y) * i) / 15);
    await capture.frame();
  }
  await page.mouse.up({ button: "middle" });
  await a.run(() => settled(page));
  await page.mouse.move(800, 590);
}
