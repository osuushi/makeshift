import { project } from "../../tests/ui-blend-edit.mjs";
import { at, settled } from "../../tests/ui-helpers.mjs";

export function motions(page, capture, run, pause) {
  const dragPixels = async (from, to, seconds = 2, accelerate = false) => {
    await page.mouse.move(from.x, from.y);
    await capture.hold(0.15);
    await page.mouse.down();
    const frames = Math.round(seconds * capture.fps);
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const progress = accelerate ? t * t : t;
      await page.mouse.move(
        from.x + (to.x - from.x) * progress,
        from.y + (to.y - from.y) * progress,
      );
      await capture.frame();
    }
    await page.mouse.up();
    await run(() => settled(page));
    await capture.hold(pause);
  };
  const draw = async (from, to, seconds = 2) =>
    dragPixels(await run(() => at(page, ...from)), await run(() => at(page, ...to)), seconds);
  const hover = async (xyz, seconds = 0.5) => {
    const point = await run(() => project(page, xyz));
    await page.mouse.move(point.x, point.y);
    await capture.hold(seconds);
  };
  const dragWorld = async (from, to, seconds = 1, accelerate = false) =>
    dragPixels(
      await run(() => project(page, from)),
      await run(() => project(page, to)),
      seconds,
      accelerate,
    );
  const dragHandle = async (label, from, to, seconds = 1.5) => {
    const box = await run(() =>
      page.getByRole("button", { name: label, exact: true }).boundingBox(),
    );
    const base = await run(() => project(page, from));
    const tip = await run(() => project(page, to));
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await dragPixels(start, { x: start.x + tip.x - base.x, y: start.y + tip.y - base.y }, seconds);
  };
  return { draw, dragPixels, hover, dragWorld, dragHandle };
}
