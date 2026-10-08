import { canonicalPlanes } from "../preferences/canonical-planes.js";
import { type PlaneId, planeIds, planes, worldPoint } from "./planes.js";
import type { World } from "./world.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const inset = 18;
const size = 28;

/** Fixed pixel-scale plane cues: view state only, using the ordinary modal picker. */
export function installModalPlaneWidgets(world: World, overlay: HTMLElement): () => void {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.classList.add("modal-plane-widgets");
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "30",
  });
  const widgets = planeIds.map((id) => ({ id, polygon: createWidget(world, id, options) }));
  svg.append(...widgets.map(({ polygon }) => polygon));
  overlay.append(svg);

  const update = (): void => {
    const visible = !!world.planePicker && !world.active;
    svg.style.display = visible ? "" : "none";
    if (!visible) return;
    const rect = world.canvas.getBoundingClientRect();
    const scale = (world.camera.top - world.camera.bottom) / world.camera.zoom / rect.height;
    for (const { id, polygon } of widgets) {
      const accepted = !world.planePickerAccept || world.planePickerAccept(planes[id]);
      const enabled = accepted && world.canNavigate();
      polygon.setAttribute("aria-disabled", String(!enabled));
      polygon.style.cursor = enabled ? "pointer" : "default";
      polygon.style.opacity = accepted ? "1" : "0.3";
      const color = canonicalPlanes().colors[id];
      polygon.setAttribute("fill", color);
      polygon.setAttribute("stroke", color);
      if (!polygon.hasAttribute("fill-opacity")) polygon.setAttribute("fill-opacity", "0.16");
      polygon.setAttribute("points", widgetPoints(world, id, rect, scale));
    }
  };
  world.changed.add(update);
  update();
  return () => {
    abort.abort();
    world.changed.delete(update);
    svg.remove();
  };
}

function createWidget(
  world: World,
  id: PlaneId,
  options: AddEventListenerOptions,
): SVGPolygonElement {
  const polygon = document.createElementNS(svgNamespace, "polygon");
  polygon.dataset.modalPlane = id;
  polygon.setAttribute("role", "button");
  polygon.setAttribute("tabindex", "-1");
  polygon.setAttribute("aria-label", `Use ${id} plane`);
  polygon.setAttribute("stroke-width", "1");
  polygon.setAttribute("stroke-linejoin", "round");
  polygon.style.pointerEvents = "all";
  const title = document.createElementNS(svgNamespace, "title");
  title.textContent = `${id} plane`;
  polygon.append(title);
  polygon.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.button && !event.metaKey && !event.ctrlKey && event.pointerType !== "touch")
        event.preventDefault();
    },
    options,
  );
  polygon.addEventListener(
    "click",
    (event) => {
      if (event.button || event.metaKey || event.ctrlKey) return;
      choose();
    },
    options,
  );
  polygon.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choose();
    },
    options,
  );
  polygon.addEventListener(
    "pointerenter",
    () => polygon.setAttribute("fill-opacity", "0.35"),
    options,
  );
  polygon.addEventListener(
    "pointerleave",
    () => polygon.setAttribute("fill-opacity", "0.16"),
    options,
  );
  return polygon;
  function choose(): void {
    if (
      !world.active &&
      world.canNavigate() &&
      world.planePicker &&
      (!world.planePickerAccept || world.planePickerAccept(planes[id]))
    ) {
      world.canvas.focus({ preventScroll: true });
      world.planePicker(id);
    }
  }
}

/** Keep an origin clearance even when a plane's projected axes oppose each other. */
function widgetPoints(world: World, id: PlaneId, rect: DOMRect, scale: number): string {
  const origin = world.project([0, 0, 0]);
  const diagonal = world.project(worldPoint(planes[id], { x: scale, y: scale }));
  let dx = diagonal.x - origin.x;
  let dy = diagonal.y - origin.y;
  if (Math.hypot(dx, dy) < 0.001) {
    const axis = world.project(worldPoint(planes[id], { x: scale, y: 0 }));
    dx = axis.x - origin.x;
    dy = axis.y - origin.y;
  }
  const distance = Math.hypot(dx, dy);
  const offsetX = (dx / distance) * (inset + size);
  const offsetY = (dy / distance) * (inset + size);
  return [
    [-size / 2, -size / 2],
    [size / 2, -size / 2],
    [size / 2, size / 2],
    [-size / 2, size / 2],
  ]
    .map(([x, y]) => {
      const p = world.project(worldPoint(planes[id], { x: x * scale, y: y * scale }));
      return `${p.x + offsetX - rect.left},${p.y + offsetY - rect.top}`;
    })
    .join(" ");
}
