import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { commonKeys, keyTool } from "./ui-common-shortcuts.mjs";
import { at, close, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function unchanged(page, before) {
  const state = await inspect(page);
  for (const key of [
    "document",
    "interaction",
    "modelingTool",
    "modelingSelection",
    "tool",
    "activePlane",
  ])
    assert.deepEqual(state[key], before[key], `Shortcut ownership: ${key}`);
}
async function idleGuards(page) {
  await reset(page);
  const before = await inspect(page);
  await page.locator("canvas").focus();
  for (const guard of ["repeat", "isComposing", "metaKey", "ctrlKey", "altKey"])
    await page.locator("canvas").evaluate((canvas, guard) => {
      canvas.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "U",
          shiftKey: true,
          [guard]: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, guard);
  await unchanged(page, before);
  await page.keyboard.press("Shift+L");
  await unchanged(page, before);
  await keyTool(page, "Shift+E"); // Unassigned even in idle Modeling.
  await unchanged(page, before);
  assert.doesNotMatch(
    await page.getByRole("status").textContent(),
    /Select complete bodies to erode/,
  );
  await keyTool(page, "l");
  assert.equal((await inspect(page)).interaction.kind, "loft");
  await keyTool(page, "l");
  assert.equal((await inspect(page)).interaction.kind, "loft");
  assert.doesNotMatch(await page.getByRole("status").textContent(), /Finish or cancel/);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
}
async function menuOwnership(page) {
  const before = await inspect(page);
  await page.keyboard.press("Meta+f");
  const search = page.getByRole("combobox", { name: "Find a tool" });
  for (const [id, badge] of [
    ["union", "⇧U"],
    ["subtract", "⇧S"],
    ["intersect", "⇧I"],
    ["loft", "L"],
  ]) {
    await search.fill(id);
    const actual = await page.locator(`[data-command="${id}"] kbd`).textContent();
    assert.equal(
      actual,
      badge.startsWith("⇧") && actual.startsWith("Shift+") ? badge.replace("⇧", "Shift+") : badge,
    );
  }
  await search.fill("erode");
  assert.equal(await page.locator('[data-command="erode"] kbd').textContent(), "");
  await search.fill("");
  for (const key of commonKeys) await page.keyboard.press(key);
  assert.equal(await search.inputValue(), "USIl");
  await unchanged(page, before);
  await page.keyboard.press("Escape");
  const fileMenu = page.getByRole("button", { name: "File / Edit", exact: true });
  if (await fileMenu.count()) {
    await fileMenu.click();
    for (const key of commonKeys) await page.keyboard.press(key);
    await unchanged(page, before);
    await page.keyboard.press("Escape");
  }
}
async function modalOwnership(page) {
  await plate(page);
  const newCommand = page.getByRole("button", { name: "File / Edit", exact: true });
  if (await newCommand.count()) {
    await chooseTool(page, "new document", "new");
    const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await cancel.focus();
    const before = await inspect(page);
    for (const key of commonKeys) await page.keyboard.press(key);
    await unchanged(page, before);
    assert.equal(await dialog.isVisible(), true);
    await cancel.click();
  }
  for (const tool of ["mirror", "transform"]) {
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    const original = (await inspect(page)).document;
    await chooseTool(page, tool, tool);
    // Released valid edits may now switch; latest invalid settings keep ownership.
    if (tool === "transform") {
      await page.locator(".transform-box-handle:visible").last().click();
      await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("0");
    } else {
      await orient(page, [1, 1, 1]);
      await pickPlane(page, "YZ");
      const preview = (await inspect(page)).preview;
      assert.equal(preview.bodies.length, 2);
      close(preview.bodies[1].volume, original.bodies[0].volume);
      await page.getByRole("textbox", { name: "Mirror offset", exact: true }).fill("");
    }
    const before = await inspect(page);
    assert.equal(before.interaction.kind, tool === "mirror" ? "mirror" : "scale");
    assert.deepEqual(before.document, original);
    for (const key of commonKeys) await keyTool(page, key);
    await unchanged(page, before);
    assert.equal(
      await page
        .getByRole("textbox", {
          name: tool === "mirror" ? "Mirror offset" : "Transform scale X",
          exact: true,
        })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page.keyboard.press("Escape");
    await modalCompleted(page);
    assert.deepEqual((await inspect(page)).document, original);
  }
}
async function extrudeOwnership(page) {
  const { center } = await plate(page);
  await page.mouse.click(center.x, center.y);
  await keyTool(page, "e");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  const before = await inspect(page);
  assert.equal(before.interaction.kind, "extrude");
  for (const key of ["u", "s", "i", "Shift+U", "Shift+S", "Shift+I"]) {
    await keyTool(page, key);
    const mode = { u: "union", s: "subtract", i: "intersect" }[key.at(-1).toLowerCase()];
    assert.equal(
      await page
        .locator(`.extrude-controls button[data-mode="${mode}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal((await inspect(page)).interaction.kind, "extrude");
    assert.deepEqual((await inspect(page)).document, before.document);
  }
  const input = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await input.fill("");
  const invalid = await inspect(page);
  assert.equal(invalid.preview, null);
  for (const key of ["Shift+E", "l"]) await keyTool(page, key);
  await unchanged(page, invalid);
  assert.equal(await input.inputValue(), "");
  await input.fill("12");
  for (const key of commonKeys) await page.keyboard.press(key);
  assert.equal(await input.inputValue(), "12USIl");
  assert.equal((await inspect(page)).interaction.kind, "extrude");
  assert.deepEqual((await inspect(page)).document, before.document);
  await input.fill("0");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
}
async function sketchGestureOwnership(page) {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await chooseTool(page, "Toggle grid snapping", "grid");
    assert.equal((await inspect(page)).gridSnap, false);
    await keyTool(page, "l");
    assert.equal((await inspect(page)).tool, "line");
    const start = await at(page, 0, 0),
      end = await at(page, 5.4, 3.7);
    for (const point of [start, end])
      for (const value of [point.x, point.y])
        assert.equal(Number.isInteger(value), true, `Gesture client ${JSON.stringify(point)}`);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.keyboard.press("E");
    await page.mouse.move(end.x, end.y, { steps: 5 });
    assert.ok((await inspect(page)).activePlane);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const state = await inspect(page);
    assert.equal(state.tool, "line");
    assert.equal((state.document.bodies ?? []).length, 0);
    assert.equal(state.document.sketches.length, 1);
    const sketch = state.document.sketches[0];
    assert.equal(sketch.curves.length, 1);
    const segment = sketch.curves[0];
    assert.equal(segment.kind, "segment");
    close(segment.a.x, 0);
    close(segment.a.y, 0);
    const endpointDiagnostic = JSON.stringify({
      requested: [5.4, 3.7],
      actual: [segment.b.x, segment.b.y],
      startClient: start,
      endClient: end,
      gridSnap: state.gridSnap,
    });
    close(segment.b.x, 5.4, `Held Shift X ${endpointDiagnostic}`);
    close(segment.b.y, 3.7, `Held Shift Y ${endpointDiagnostic}`);
    assert.equal(sketch.constraints.length, 0);
  } finally {
    await page.setViewportSize(viewport);
  }
}
async function nativeFieldOwnership(page) {
  await plate(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "Erode", "erode");
  const method = page.getByRole("combobox", { name: "Erosion method", exact: true });
  await method.focus();
  const before = await inspect(page);
  for (const key of commonKeys) await page.keyboard.press(key);
  await unchanged(page, before);
  assert.equal(await method.inputValue(), "fast");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
}
async function waitAgentStatus(page, running) {
  const deadline = Date.now() + 120000;
  let last;
  while (Date.now() < deadline) {
    last = await page.evaluate(async () => {
      const status = await window.makeshiftAgent.request({ kind: "settings" });
      return {
        running: status.running,
        workspace: status.workspace,
        error: status.error,
        exitCode: status.exitCode,
      };
    });
    if (!last.error && last.running === running && (!running || last.workspace)) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Agent status did not reach running=${running}: ${JSON.stringify(last)}`);
}
async function terminalOwnership(page) {
  await reset(page);
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: {
        preset: "custom",
        executable: "/bin/sh",
        args: ["-i"],
        env: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor({ state: "visible" });
  await waitAgentStatus(page, true);
  const input = page.locator(".agent-screen textarea");
  await input.focus();
  const before = await inspect(page);
  try {
    for (const key of commonKeys) await page.keyboard.press(key);
    await page.keyboard.press("Meta+f");
    assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), false);
    await unchanged(page, before);
    await page.keyboard.press("Control+c");
  } finally {
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await waitAgentStatus(page, false);
    await page.getByRole("button", { name: "Collapse agent terminal", exact: true }).click();
  }
}
export async function shortcutOwnership(page, name) {
  await idleGuards(page);
  await menuOwnership(page);
  await modalOwnership(page);
  await extrudeOwnership(page);
  await nativeFieldOwnership(page);
  await sketchGestureOwnership(page);
  if (name === "electron") await terminalOwnership(page);
  console.log(
    `${name}: shortcuts retain modal/local, field/select/search/popover, Sketch L and held-Shift ownership${name === "electron" ? ", real PTY focus" : ""}`,
  );
}
