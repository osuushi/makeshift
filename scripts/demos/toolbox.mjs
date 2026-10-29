// Demo contexts start with the default toolbox. Match any remembered alternative
// in a group so earlier tool choices do not change the route to the next tool.
const groups = [
  ["move", "rotate", "scale", "transform"],
  ["line", "rectangle", "circle", "pen", "trim"],
  ["cube", "cylinder", "sphere", "cone"],
  ["extrude", "revolve", "loft"],
  ["union", "subtract", "intersect", "split", "imprint"],
  ["fillet", "chamfer", "shell", "offset"],
];
const drawers = [
  ["Sketch editing", ["bezier", "sketch-offset", "sketch-fillet"]],
  ["Surface details", ["erode", "threads", "gear", "knurling"]],
  ["Planes & references", ["construction-plane", "project", "use-edge", "cross-section"]],
];

export async function chooseDemoToolboxTool(page, id, run, hold) {
  const button = page.locator(`.toolbox [data-tool="${id}"]:visible`).first();
  if (!(await button.count())) {
    const group = groups.find((items) => items.includes(id));
    const drawer = drawers.find(([, items]) => items.includes(id));
    if (group) {
      const current = page.locator(
        group.map((item) => `.toolbox-grid [data-tool="${item}"]`).join(","),
      );
      await run(() => current.locator("..").locator(".toolbox-expand").click());
      await hold();
    } else if (drawer || id === "mirror") {
      await run(() => page.locator('.toolbox [data-menu="Other Tools"] > .toolbox-item').click());
      await hold();
      if (drawer) {
        await run(() =>
          page.locator(`.toolbox [data-menu="${drawer[0]}"] > .toolbox-item`).click(),
        );
        await hold();
      }
    } else return false;
  }
  await run(() => button.click());
  return true;
}
