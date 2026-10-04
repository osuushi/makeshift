import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { edgeFinishPrism, pickWorld } from "./ui-edge-finish-fixtures.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { deliveredPlaneDelta, deliveredRotation } from "./ui-widget-delivered-input.mjs";
import {
  acceptHistory,
  assertWidgetTargets,
  directionDrag,
  dragPixels,
  sweepWidgets,
} from "./ui-widget-reachability.mjs";
import { panTo } from "./ui-widget-wheel.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const input = (page, name) => page.getByRole("textbox", { name, exact: true });
const axial =
  ".axial-widget:not([hidden]) > .axial-arrow, .axial-widget:not([hidden]) > .axial-panel";

export async function extrusionReachability(page, name) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const p = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(p.x, p.y);
  const before = (await inspect(page)).document;
  const selector = `${axial}, .extrude-axis-sphere, .extrude-twist-handle`;
  if (name === "electron") await openAgentChrome(page);
  await sweepWidgets(page, [0, 0, 0], selector, "Extrude/Twist/axis");
  await page.screenshot({ path: `.cache/sketch-review/${name}-widgets-extrude-docked.png` });
  const extrusionZero = await project(page, [0, 0, 0]),
    extrusionUnit = await project(page, [0, 0, 1]);
  const state = await directionDrag(page, button(page, "Drag extrusion"), 25);
  const down = state.widgetGesture[0],
    up = state.widgetGesture.at(-1);
  const unit = { x: extrusionUnit.x - extrusionZero.x, y: extrusionUnit.y - extrusionZero.y };
  // WebKit delivers integer mouse clients. Verify geometry against actual input,
  // independently projecting one world unit rather than copying product drag math.
  const exactDepth =
    ((up.x - down.x) * unit.x + (up.y - down.y) * unit.y) / (unit.x ** 2 + unit.y ** 2);
  const distance = Number(await input(page, "Extrusion distance").inputValue());
  assert.ok(
    distance > 0 && state.preview?.bodies?.length,
    JSON.stringify({
      distance,
      interaction: state.interaction,
      modelingTool: state.modelingTool,
      message: state.message,
      preview: state.preview,
      selection: state.modelingSelection,
    }),
  );
  assert.ok(
    Math.abs(distance - Number(exactDepth.toPrecision(4))) < 1e-6,
    JSON.stringify({
      name,
      distance,
      exactDepth,
      unit: { x: extrusionUnit.x - extrusionZero.x, y: extrusionUnit.y - extrusionZero.y },
      gesture: state.widgetGesture,
      camera: state.camera,
    }),
  );
  assert.ok(
    Math.abs(state.preview.bodies[0].volume - 400 * exactDepth) < 0.01,
    JSON.stringify({
      volume: state.preview.bodies[0].volume,
      exactDepth,
      distance,
      sketches: before.sketches,
      gesture: state.widgetGesture,
    }),
  );
  await axisAndTwist(page, selector);
  await button(page, "Cancel extrusion").click();
  assert.deepEqual((await inspect(page)).document, before);
  await button(page, "Drag extrusion").click();
  await input(page, "Extrusion distance").fill("10");
  await inspect(page);
  await acceptHistory(page, button(page, "Accept extrusion"), before);
  if (name === "electron") {
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" }));
    await page.getByRole("button", { name: "Collapse agent terminal" }).click();
  }
  console.log(
    `${name}: docked extrusion, compensated axis/twist, volume, Cancel and one Undo/Redo passed`,
  );
}

async function axisAndTwist(page, selector) {
  await input(page, "Extrusion distance").fill("10");
  await inspect(page);
  // Offset compensation preserves source-plane axis deltas after the sphere docks.
  const a = await project(page, [0, 0, 0]),
    b = await project(page, [2, 0, 0]),
    u = await project(page, [1, 0, 0]),
    v = await project(page, [0, 1, 0]);
  let state = await dragPixels(
    page,
    button(page, "Position extrusion axis"),
    { x: b.x - a.x, y: b.y - a.y },
    ["Meta"],
  );
  const axis = deliveredPlaneDelta(state.widgetGesture, a, u, v);
  const axisGesture = state.widgetGesture;
  await input(page, "Extrusion twist").fill("30");
  state = await inspect(page);
  const cap = state.preview.bodies[0].faces.find(
    (face) =>
      face.vertices.length && face.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
  );
  assert.ok(cap);
  const coordinates = [0, 1].map((axis) => cap.vertices.filter((_, i) => i % 3 === axis));
  const capCenter = coordinates.map((values) => (Math.min(...values) + Math.max(...values)) / 2);
  const c = Math.cos(Math.PI / 6),
    s = Math.sin(Math.PI / 6);
  const expected = [axis.x * (1 - c) + axis.y * s, axis.y * (1 - c) - axis.x * s];
  assert.ok(
    capCenter.every((v, i) => Math.abs(v - expected[i]) < 0.01),
    JSON.stringify({ capCenter, expected, axisGesture }),
  );
  assert.ok(Math.abs(state.preview.bodies[0].volume - 4000) < 0.01);
  await assertWidgetTargets(page, selector, "Extrude/Twist after axis movement");
  const canvas = await page.locator("#world canvas").boundingBox();
  await panTo(page, [0, 0, 0], { x: canvas.width / 2, y: canvas.height / 2 });
  await orient(page, [0, 0, 1]);
  await panTo(page, [0, 0, 0], { x: -40, y: canvas.height / 2 });
  // Rotate the nominal plane pointer about the true axis, then transport back to display.
  const handle = button(page, "Drag extrusion twist");
  const geometry = await handle.evaluate((element) => {
    const r = element.getBoundingClientRect(),
      values = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, dx: values[0] || 0, dy: values[1] || 0 };
  });
  const origin = await project(page, [axis.x, axis.y, 0]);
  const x = geometry.x - geometry.dx - origin.x,
    y = geometry.y - geometry.dy - origin.y;
  const angle = Math.PI / 9;
  state = await dragPixels(
    page,
    handle,
    {
      x: x * (Math.cos(angle) - 1) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * (Math.cos(angle) - 1),
    },
    ["Shift"],
  );
  const actualRotation = deliveredRotation(state.widgetGesture, origin, {
    x: geometry.dx,
    y: geometry.dy,
  });
  const actualTwist = Number(await input(page, "Extrusion twist").inputValue());
  assert.ok(
    Math.abs(actualTwist - Number((30 - actualRotation).toPrecision(4))) < 1e-6,
    JSON.stringify({ actualTwist, actualRotation, gesture: state.widgetGesture }),
  );
  assert.ok(Math.abs(state.preview.bodies[0].volume - 4000) < 0.01);
}

export async function solidAxialReachability(
  page,
  name,
  modes = ["offset", "shell", "erode", "fillet", "chamfer"],
) {
  for (const mode of modes) {
    const before = await edgeFinishPrism(page);
    if (["fillet", "chamfer"].includes(mode)) {
      await pickWorld(page, [10, 10, 5]);
      await chooseTool(page, mode, mode);
      await sweepWidgets(
        page,
        before.bodies[0].center,
        ".body-edge-finish-widget:not([hidden]) > .edge-size-handle:not([hidden]), .body-edge-finish-widget:not([hidden]) > .edge-finish-panel",
        mode,
      );
      const state = await directionDrag(
        page,
        button(page, `${mode === "fillet" ? "Fillet" : "Chamfer"} edges`),
        12,
      );
      assert.ok(state.preview?.bodies?.length);
      assert.ok(state.preview.bodies[0].volume < before.bodies[0].volume);
    } else {
      if (mode === "offset") await pickWorld(page, [0, 0, 10]);
      else await button(page, "Select Body 1").click();
      await chooseTool(page, mode === "offset" ? "offset faces" : mode, mode);
      if (mode === "erode")
        await page.getByRole("combobox", { name: "Erosion method" }).selectOption("accurate");
      await sweepWidgets(page, before.bodies[0].center, axial, mode);
      const action = {
        offset: "Offset faces",
        shell: "Shell thickness handle",
        erode: "Erosion distance handle",
      }[mode];
      const state = await directionDrag(page, button(page, action), mode === "shell" ? -10 : 10);
      assert.ok(state.preview?.bodies?.length, `${mode}: actual docked drag candidate`);
      const result =
        mode === "erode"
          ? state.preview.bodies.find((body) => body.id !== before.bodies[0].id)
          : state.preview.bodies[0];
      assert.ok(result);
      assert.ok(
        mode === "offset"
          ? result.volume > before.bodies[0].volume
          : result.volume > 0 && result.volume < before.bodies[0].volume,
        JSON.stringify({ mode, volume: result.volume, original: before.bodies[0].volume }),
      );
      if (mode === "erode") {
        assert.deepEqual(
          state.preview.bodies.find((body) => body.id === before.bodies[0].id),
          before.bodies[0],
        );
        for (let i = 0; i < 3; i++) {
          assert.ok(result.bounds[i] > before.bodies[0].bounds[i]);
          assert.ok(result.bounds[i + 3] < before.bodies[0].bounds[i + 3]);
        }
      }
    }
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(
    `${name}: Offset/Shell/Analytic Erode/Fillet/Chamfer edge docking and actual size drags passed`,
  );
}

async function openAgentChrome(page) {
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
}

export async function blendResizeReachability(page, name) {
  await edgeFinishPrism(page);
  await pickWorld(page, [10, 10, 5]);
  await chooseTool(page, "fillet", "fillet");
  await button(page, "Fillet edges").click();
  await input(page, "Fillet radius").fill("2");
  await inspect(page);
  await button(page, "Accept fillet").click();
  const before = (await inspect(page)).document;
  const face = before.bodies[0].faces.find((face) => face.blend && face.offsetHandle);
  assert.ok(face);
  await page.keyboard.press("Escape");
  const { center, normal } = face.offsetHandle;
  await orient(page, [normal[0] - normal[1] * 0.6, normal[1] + normal[0] * 0.6, normal[2] + 0.3]);
  await pickWorld(page, center);
  assert.equal((await inspect(page)).modelingSelection[0].face, face.id);
  await chooseTool(page, "offset faces", "offset");
  await sweepWidgets(page, before.bodies[0].center, axial, "existing fillet-face resize");
  const state = await directionDrag(page, button(page, "Resize fillet"), 8);
  const body = state.preview.bodies[0];
  const radius = body.faces.find((face) => face.blend).blend.radius;
  assert.ok(radius > 0 && radius < 2);
  assert.ok(body.volume > before.bodies[0].volume);
  // One vertical rounded corner removes r²(1−π/4) from each horizontal section.
  assert.ok(Math.abs(body.volume - (4000 - 10 * radius ** 2 * (1 - Math.PI / 4))) < 0.001);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(`${name}: docked existing fillet-face resize, independent volume and Cancel passed`);
}
