import assert from "node:assert/strict";
import { project } from "../../tests/ui-blend-edit.mjs";
import { at, inspect, settled } from "../../tests/ui-helpers.mjs";
import { chooseTool } from "../../tests/ui-tools.mjs";

export function actions(page, capture) {
  const run = (operation) => capture.action(operation, 30);
  const state = () => run(() => inspect(page));
  const tool = async (id, query = id) => {
    const button = page.locator(`.toolbox [data-tool="${id}"]`);
    if (await button.count()) await run(() => button.click());
    else if (id === "undo") await run(() => chooseTool(page, query, id));
    else {
      await page.keyboard.press("Meta+f");
      await run(() => page.getByRole("combobox", { name: "Find a tool" }).fill(query));
      await capture.hold(0.8);
      await run(() => page.locator(`[data-command="${id}"]`).click());
    }
    await run(() => settled(page));
    await capture.hold(0.8);
  };
  const click = async (xyz) => {
    const point = await run(() => project(page, xyz));
    await page.mouse.click(point.x, point.y);
    await run(() => settled(page));
    await capture.hold(0.8);
  };
  const dragPixels = async (from, to, seconds = 2) => {
    await page.mouse.move(from.x, from.y);
    await capture.hold(0.3);
    await page.mouse.down();
    const frames = Math.round(seconds * capture.fps);
    for (let i = 1; i <= frames; i++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * i) / frames,
        from.y + ((to.y - from.y) * i) / frames,
      );
      await capture.frame();
    }
    await page.mouse.up();
    await run(() => settled(page));
    await capture.hold(1);
  };
  const draw = async (from, to) =>
    dragPixels(await run(() => at(page, ...from)), await run(() => at(page, ...to)));
  const fill = async (label, value, role = "textbox") => {
    const input = page.getByRole(role, { name: label, exact: true });
    await run(() => input.fill(String(value)));
    await run(() => settled(page));
    await capture.hold(1);
    await run(() => input.press("Enter"));
    await run(() => settled(page));
    await capture.hold(1);
  };
  const button = async (name) => {
    await run(() => page.getByRole("button", { name, exact: true }).click());
    await run(() => settled(page));
    await capture.hold(0.8);
  };
  const accept = async () => {
    await run(() => page.getByLabel("Modeling viewport", { exact: true }).focus());
    await page.keyboard.press("Enter");
    await run(() =>
      page.waitForFunction(() => {
        const s = window.makeshiftInspect();
        return !s.busy && s.interaction === null;
      }),
    );
    await capture.hold(1);
  };
  return { run, state, tool, click, draw, dragPixels, fill, button, accept };
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
