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
    for (const { face, group, polygon, text } of entries) {
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
      const shade = face.kind === "face" ? 255 : Math.round(235 + 14 * direction.z);
      polygon.setAttribute("fill", `rgb(${shade} ${shade} ${shade})`);
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
