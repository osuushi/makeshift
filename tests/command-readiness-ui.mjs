import assert from "node:assert/strict";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function route(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const original = (await inspect(page)).document;
  const region = await at(page, 6, 6);
  await page.evaluate(async () => {
    const { NumericEdit } = await import("/numeric-edit.ts");
    const originalCommit = NumericEdit.prototype.commit;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    window.readinessProbe = {
      reached: false,
      release,
      restore: () => {
        NumericEdit.prototype.commit = originalCommit;
      },
    };
    NumericEdit.prototype.commit = async function () {
      await originalCommit.call(this);
      window.readinessProbe.reached = true;
      await held;
    };
  });
  let returned = false;
  const switching = chooseTool(page, "return to modeling", "modeling").then(() => {
    returned = true;
  });
  try {
    await page.waitForFunction(() => window.readinessProbe.reached);
    const during = await inspect(page);
    assert.equal(during.busy, false, "The real numeric commit has completed");
    assert.equal(during.activePlane, "XY", "Workspace exit awaits ordinary command completion");
    assert.ok(during.commands.some((command) => command.unavailable === "Switching tools…"));
    assert.deepEqual(during.document, original);
    assert.equal(
      returned,
      false,
      "chooseTool must wait for command completion, not only native busy",
    );
  } finally {
    await page.evaluate(() => {
      window.readinessProbe.restore();
      window.readinessProbe.release();
      delete window.readinessProbe;
    });
    await switching;
  }
  const exited = await inspect(page);
  assert.equal(exited.activePlane, null);
  assert.deepEqual(exited.document, original);
  await page.mouse.click(region.x, region.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  close(state.preview.bodies[0].volume, 2000);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  state = await inspect(page);
  close(state.document.bodies[0].volume, 2000);
  console.log(
    `${name}: held real numeric completion, command readiness and exact extrusion passed`,
  );
}
await withUiRuntimes(route, { defaults: ["chromium", "webkit", "electron"] });
