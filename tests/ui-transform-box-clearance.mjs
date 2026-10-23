import assert from "node:assert/strict";
import { projectedHull } from "../.cache/sketch-tests/src/model/transform-box-layout.js";

/** Check actual applied hit rectangles, including viewport docking and scale previews. */
export async function assertOutsideTransformBox(page) {
  const selector =
    ".body-gizmo:not([hidden]) .body-axis-handle:not([hidden]), [data-move-marker] > svg";
  await page.waitForFunction(() => {
    const nodes = [
      ...document.querySelectorAll(
        ".body-gizmo:not([hidden]) .body-axis-handle:not([hidden]), [data-move-marker] > svg",
      ),
    ];
    return nodes.every((node) => {
      const actual = getComputedStyle(node).translate.split(" ").map(Number.parseFloat);
      const target = node.style.translate.split(" ").map(Number.parseFloat);
      return [0, 1].every((i) => Math.abs((actual[i] || 0) - (target[i] || 0)) < 0.01);
    });
  });
  const { points, controls } = await page.evaluate((selector) => {
    const svg = document.querySelector(".scale-widget:not([hidden]) .transform-box-lines");
    const bounds = svg.getBoundingClientRect();
    return {
      points: [...svg.querySelectorAll("line")].flatMap((line) => [
        {
          x: bounds.left + Number(line.getAttribute("x1")),
          y: bounds.top + Number(line.getAttribute("y1")),
        },
        {
          x: bounds.left + Number(line.getAttribute("x2")),
          y: bounds.top + Number(line.getAttribute("y2")),
        },
      ]),
      controls: [...document.querySelectorAll(selector)].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          name: node.getAttribute("aria-label") ?? node.parentElement.dataset.moveMarker,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      }),
    };
  }, selector);
  const hull = projectedHull(points);
  for (const control of controls) {
    const corners = [
      { x: control.left, y: control.top },
      { x: control.right, y: control.top },
      { x: control.left, y: control.bottom },
      { x: control.right, y: control.bottom },
    ];
    assert.ok(
      hull.some((a, i) => {
        const b = hull[(i + 1) % hull.length];
        return corners.every((p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0);
      }),
      `${control.name} hit rectangle overlaps the scale box`,
    );
  }
}
