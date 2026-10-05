import * as THREE from "three";
import { uiScale } from "../preferences/ui-scale.js";
import { arrowWidthAxis, markerMarkup } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import "./directional-widget.css";

export type DirectionalShape = "fillet" | "chamfer" | "extrude" | "offset" | "shell" | "height";
type Stroke = Vector[];
const arc = (point: (angle: number) => Vector, start = 0, end = Math.PI * 2): Stroke =>
  Array.from({ length: 49 }, (_, i) => point(start + ((end - start) * i) / 48));

/** Operation silhouettes in a rigid local frame: X is the positive edit direction. */
function toolStrokes(shape: Exclude<DirectionalShape, "height">): Stroke[] {
  const arrow: Stroke[] = [
    [
      [0, 0, 0],
      [24, 0, 0],
    ],
    [
      [14, -8, 0],
      [24, 0, 0],
      [14, 8, 0],
    ],
  ];
  switch (shape) {
    case "fillet":
      return [
        ...arrow,
        arc((t) => [-20 + 16 * Math.cos(t), 20 * Math.sin(t), 0], -Math.PI / 2, Math.PI / 2),
      ];
    case "chamfer":
      return [
        ...arrow,
        [
          [-20, -20, 0],
          [-6, -7, 0],
          [-6, 7, 0],
          [-20, 20, 0],
        ],
      ];
    case "extrude":
      return [
        ...arrow,
        arc((t) => [-8, 16 * Math.cos(t), 16 * Math.sin(t)]),
        arc((t) => [-23, 16 * Math.cos(t), 16 * Math.sin(t)], 0, Math.PI),
        [
          [-8, -16, 0],
          [-23, -16, 0],
        ],
        [
          [-8, 16, 0],
          [-23, 16, 0],
        ],
      ];
    case "offset":
      return [
        ...arrow,
        arc((t) => [-22 + 5 * Math.cos(t), 16 * Math.sin(t), 0], -Math.PI / 2, Math.PI / 2),
        arc((t) => [-10 + 5 * Math.cos(t), 16 * Math.sin(t), 0], -Math.PI / 2, Math.PI / 2),
      ];
    case "shell":
      return [
        ...arrow,
        [
          [-5, -21, 0],
          [-24, -21, 0],
          [-24, 21, 0],
          [-5, 21, 0],
        ],
        [
          [-5, -11, 0],
          [-14, -11, 0],
          [-14, 11, 0],
          [-5, 11, 0],
        ],
      ];
  }
}

/** Sphere-swept contours, projected together in the tool's chosen frame. */
export function directionalWidget(
  camera: THREE.Camera,
  normal: Vector,
  shape: DirectionalShape,
  width: Vector = arrowWidthAxis(normal),
): string {
  if (shape === "height") return markerMarkup(camera, normal, width, false);
  const inverse = camera.quaternion.clone().invert();
  const u = new THREE.Vector3(...normal),
    v = new THREE.Vector3(...width);
  const w = u.clone().cross(v).applyQuaternion(inverse);
  u.applyQuaternion(inverse);
  v.applyQuaternion(inverse);
  const paths = toolStrokes(shape).map((points) =>
    points
      .map(
        ([x, y, z], i) =>
          `${i ? "L" : "M"}${u.x * x + v.x * y + w.x * z},${-u.y * x - v.y * y - w.y * z}`,
      )
      .join(" "),
  );
  const layer = (outline: boolean) =>
    paths
      .map(
        (d, i) =>
          `<path data-contour="${i}" d="${d}" fill="none" stroke="${outline ? "#151515" : "#fff"}" stroke-width="${outline ? 7 : 4}"/>`,
      )
      .join("");
  return `<svg viewBox="-32 -32 64 64" data-tool-shape="${shape}" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${layer(true)}${layer(false)}</svg>`;
}

/** A fixed transverse offset keeps end-on controls clear of the selection click. */
export function directionalOffset(
  camera: THREE.Camera,
  normal: Vector,
  distance = 48,
  width: Vector = arrowWidthAxis(normal),
) {
  const p = new THREE.Vector3(...normal)
    .multiplyScalar(distance * uiScale())
    .addScaledVector(new THREE.Vector3(...width), 32 * uiScale())
    .applyQuaternion(camera.quaternion.clone().invert());
  return { x: p.x, y: -p.y };
}
