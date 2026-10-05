import assert from "node:assert/strict";
import * as THREE from "three";
import { markerMarkup } from "../.cache/sketch-tests/src/sketch/move-widget/marker.js";
import {
  installPlanarFootprint,
  installPlanarHoverExercise,
} from "./widget-planar-footprint-dom.mjs";

async function setupPlanarFixture(markup) {
  const { WidgetClearance } = await import("/widget-clearance.js");
  const { registerSketchWidgets, redrawSketchWidgets, sketchWidgetTarget, updateSketchWidgets } =
    await import("/sketch/sketch-widget-layout.js");
  document.querySelector("#options").hidden = true;
  const root = document.querySelector("#root"),
    canvas = document.querySelector("canvas");
  root.innerHTML = `<svg width="1000" height="700" style="pointer-events:none">
      <g data-move-marker="x">${markup.axis}</g>
      <g data-move-marker="rotation">${markup.rotation}</g>
    </svg>`;
  const scale = document.createElement("div");
  scale.className = "scale-widget";
  scale.style.cssText = "position:absolute;inset:0;pointer-events:none";
  scale.innerHTML = `<button class="transform-box-handle" style="position:absolute;left:-100px;top:350px;transform:translate(-50%,-50%);pointer-events:auto">Scale</button>`;
  document.body.append(scale);
  const placement = new WidgetClearance(scale),
    knob = scale.querySelector("button");
  let origin = { x: -100, y: 350 },
    redraws = 0;
  const editor = {
    sketch: { plane: {} },
    isDragging: false,
    world: {
      canvas,
      projectLocal: (_plane, point) => ({ x: origin.x + point.x, y: origin.y + point.y }),
    },
  };
  const entries = [
    { key: "x", point: { x: 0, y: 0 } },
    { key: "rotation", point: { x: 0, y: 0 } },
  ];
  const draw = () => {
    redraws++;
    updateSketchWidgets(editor, entries);
    for (const entry of entries) {
      const target = sketchWidgetTarget(editor, entry.key);
      root
        .querySelector(`[data-move-marker="${entry.key}"]`)
        .setAttribute(
          "transform",
          `translate(${target.screen.x - target.width / 2} ${target.screen.y - target.height / 2})`,
        );
    }
  };
  const dispose = registerSketchWidgets(editor, root, draw);
  const refresh = () => {
    placement.fit([knob]);
    redrawSketchWidgets(editor);
  };
  const snapshot = () => structuredClone(sketchWidgetTarget(editor, "x"));
  window.planarLayoutFixture = {
    root,
    scale,
    knob,
    placement,
    origin,
    editor,
    draw,
    dispose,
    refresh,
    snapshot,
    registerSketchWidgets,
    redrawSketchWidgets,
    sketchWidgetTarget,
    getRedraws: () => redraws,
  };
}

function measurePlanarFixture(factor) {
  const { root, scale, knob, editor, refresh, snapshot } = window.planarLayoutFixture;
  for (const svg of root.querySelectorAll("[data-move-marker] > svg")) {
    svg.setAttribute("width", String(48 * factor));
    svg.setAttribute("height", String(48 * factor));
  }
  knob.style.width = knob.style.height = `${18 * factor}px`;
  refresh();
  const first = snapshot();
  for (let i = 0; i < 12; i++) refresh();
  const rect = root.querySelector('[data-move-marker="x"] > svg').getBoundingClientRect();
  const svg = root.querySelector('[data-move-marker="x"] > svg');
  const center = new DOMPoint(0, 0).matrixTransform(svg.getScreenCTM());
  const k = knob.getBoundingClientRect();
  const repeated = snapshot();
  const stable =
    Math.hypot(repeated.screen.x - first.screen.x, repeated.screen.y - first.screen.y) < 1e-4 &&
    Math.abs(repeated.width - first.width) < 1e-4;
  const separated =
    rect.right + 6 <= k.left ||
    k.right + 6 <= rect.left ||
    rect.bottom + 6 <= k.top ||
    k.bottom + 6 <= rect.top;
  const hover = window.exercisePlanarHover(first);
  // Header pointer must release hover freeze even if editor.hover is stale.
  editor.hover = { kind: "translate", axis: "x" };
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 20, clientY: 20 }));
  scale.hidden = true;
  refresh();
  const hidden = snapshot();
  scale.hidden = false;
  refresh();
  const shown = snapshot();
  for (let i = 0; i < 12; i++) refresh();
  return {
    factor,
    first,
    stable,
    repeated,
    knobRect: { x: k.x, y: k.y, width: k.width, height: k.height },
    center: { x: center.x, y: center.y },
    separated,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    ...hover,
    hidden,
    shown,
    stableShown:
      Math.hypot(snapshot().screen.x - shown.screen.x, snapshot().screen.y - shown.screen.y) < 1e-4,
  };
}

function disposePlanarFixture() {
  const {
    editor,
    root,
    draw,
    dispose,
    refresh,
    snapshot,
    placement,
    registerSketchWidgets,
    redrawSketchWidgets,
    sketchWidgetTarget,
    getRedraws,
  } = window.planarLayoutFixture;
  const nextDispose = registerSketchWidgets(editor, root, draw);
  dispose();
  refresh();
  const replacementSurvives = !!snapshot();
  nextDispose();
  const missing = sketchWidgetTarget(editor, "x");
  const before = getRedraws();
  redrawSketchWidgets(editor);
  placement.dispose();
  return { replacementSurvives, missing, disposedCallback: getRedraws() === before };
}

export async function planarLayoutDom(page, name) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1);
  camera.position.z = 10;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  await page.evaluate(setupPlanarFixture, {
    axis: markerMarkup(camera, [1, 0, 0], [0, 1, 0], false),
    rotation: markerMarkup(camera, [1, 0, 0], [0, 1, 0], true),
  });
  await page.evaluate(installPlanarFootprint);
  await page.evaluate(installPlanarHoverExercise);
  const results = [];
  for (const factor of [0.8, 1.5]) results.push(await page.evaluate(measurePlanarFixture, factor));
  console.log(
    `${name}: planar hover footprint ${JSON.stringify(results.map((state) => ({ factor: state.factor, hover: state.hoverFootprint, offset: state.hovered.offset })))}`,
  );
  const states = await page.evaluate(disposePlanarFixture);
  for (const state of results) {
    assert.equal(
      state.stable,
      true,
      `${name}: repeated two-overlay refresh ${state.factor} ${JSON.stringify([state.first, state.repeated])}`,
    );
    assert.equal(
      state.separated,
      true,
      `${name}: planar glyph avoids Scale knob ${JSON.stringify(state)}`,
    );
    assert.ok(Math.abs(state.first.width - 48 * state.factor) < 1e-4);
    assert.ok(Math.abs(state.first.radius - 22 * state.factor) < 1e-4);
    assert.ok(Math.abs(state.center.x - state.first.screen.x) < 1e-4);
    assert.ok(Math.abs(state.center.y - state.first.screen.y) < 1e-4);
    assert.deepEqual(
      state.safeHovered.offset,
      state.repeated.offset,
      "Safe canvas hover freezes correction",
    );
    assert.notDeepEqual(
      state.hovered.offset,
      state.safeHovered.offset,
      "Unsafe idle hover fits immediately",
    );
    for (const footprint of [
      state.safeHoverFootprint,
      state.hoverFootprint,
      state.releasedFootprint,
      state.rotationFootprint,
    ]) {
      assert.equal(footprint.viewportSafe, true, JSON.stringify(footprint));
      assert.equal(footprint.obstaclesClear, true, JSON.stringify(footprint));
      assert.equal(footprint.mapMatches, true, JSON.stringify(footprint));
    }
    assert.deepEqual(
      state.dragging.offset,
      state.pressed.offset,
      "Actual drag keeps captured correction through release",
    );
    assert.deepEqual(
      state.pressed.offset,
      state.hovered.offset,
      "Press freezes after leaving glyph",
    );
    assert.notDeepEqual(
      state.released.offset,
      state.first.offset,
      "Release fits current projection",
    );
    assert.notDeepEqual(
      state.hidden.screen,
      state.shown.screen,
      "Scale hide/show releases its footprint",
    );
    assert.equal(state.stableShown, true);
  }
  assert.equal(states.replacementSurvives, true, "Old disposal preserves matching replacement");
  assert.equal(states.missing, null);
  assert.equal(states.disposedCallback, true);
  console.log(
    `${name}: planar shared map, UI80/150 geometry, Scale priority, hover/press and disposal passed`,
  );
}
