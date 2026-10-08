import { canonicalPlanes } from "../preferences/canonical-planes.js";
import { type CubeSurface, cubeSurfaces } from "./orientation-cube-geometry.js";
import type { World } from "./world.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const scale = 38;

/** A camera-only control, outside the modeling overlay's input surface. */
export function createOrientationCube(world: World) {
  const cube = document.createElementNS(svgNamespace, "svg");
  cube.classList.add("orientation-cube");
  cube.setAttribute("viewBox", "0 0 144 144");
  cube.setAttribute(
    "aria-label",
    "Orientation cube. Drag to rotate; click to align; double-click a face for canonical roll.",
  );
  const entries = cubeSurfaces().map((face) => createSurface(cube, face));
  world.host.append(cube);
  const draw = () => {
    const inverse = world.camera.quaternion.clone().invert();
    const colors = canonicalPlanes().colors;
    for (const { face, group, polygon, text } of entries) {
      if (face.kind === "face") {
        const plane = face.normal.x ? "YZ" : face.normal.y ? "XZ" : "XY";
        const color = colors[plane];
        polygon.setAttribute("fill", color);
        group.style.setProperty("--cube-label-color", labelColor(color));
      }
      const direction = face.normal.clone().applyQuaternion(inverse);
      const visible = direction.z > 0.015;
      group.style.display = visible ? "" : "none";
      group.setAttribute("tabindex", "-1");
      if (!visible) continue;
      const points = face.vertices.map((vertex) => {
        const p = vertex.clone().applyQuaternion(inverse);
        return `${72 + p.x * scale},${72 - p.y * scale}`;
      });
      polygon.setAttribute("points", points.join(" "));
      if (face.kind !== "face") {
        const shade = Math.round(235 + 14 * direction.z);
        polygon.setAttribute("fill", `rgb(${shade} ${shade} ${shade})`);
      }
      if (!text) continue;
      const right = face.up.clone().cross(face.normal).applyQuaternion(inverse);
      const up = face.up.clone().applyQuaternion(inverse);
      // Local text coordinates lie on the face: x follows right, SVG y follows -up.
      text.setAttribute(
        "transform",
        `matrix(${right.x} ${-right.y} ${-up.x} ${up.y} ${72 + direction.x * scale} ${72 - direction.y * scale})`,
      );
      text.style.visibility = direction.z > 0.18 ? "visible" : "hidden";
    }
  };
  return { cube, entries, draw };
}

/** Choose the label ink with the higher contrast against the configured face color. */
function labelColor(color: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return (luminance + 0.05) / (0.0075 + 0.05) >= 1.05 / (luminance + 0.05) ? "#151515" : "#ffffff";
}

function createSurface(cube: SVGSVGElement, face: CubeSurface) {
  const group = document.createElementNS(svgNamespace, "g");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", `${face.name} view`);
  group.dataset.kind = face.kind;
  const title = document.createElementNS(svgNamespace, "title");
  title.textContent = `${face.name}${face.kind === "edge" ? " · 45°" : face.kind === "corner" ? " · Isometric" : ""} view`;
  const polygon = document.createElementNS(svgNamespace, "polygon");
  group.append(title, polygon);
  const text = face.kind === "face" ? document.createElementNS(svgNamespace, "text") : null;
  if (text) {
    text.textContent = face.name.toUpperCase();
    group.append(text);
  }
  cube.append(group);
  return { face, group, polygon, text };
}
