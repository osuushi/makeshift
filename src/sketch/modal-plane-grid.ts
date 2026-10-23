const namespace = "http://www.w3.org/2000/svg";
let nextId = 0;

/** Decorative plane-local grid; the original polygon remains the input target. */
export function createModalPlaneGrid(): SVGGElement {
  const id = `modal-plane-grid-${nextId++}`;
  const group = document.createElementNS(namespace, "g");
  group.style.pointerEvents = "none";
  group.innerHTML = `
    <defs>
      <radialGradient id="${id}-fade">
        <stop offset="0" stop-color="white"/>
        <stop offset="0.45" stop-color="white" stop-opacity="0.95"/>
        <stop offset="0.75" stop-color="white" stop-opacity="0.45"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
      </radialGradient>
      <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="-72" y="-72" width="144" height="144">
        <rect x="-72" y="-72" width="144" height="144" fill="url(#${id}-fade)"/>
      </mask>
      <pattern id="${id}-lines" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M 0 7 V 0 H 7" fill="none" stroke="currentColor" stroke-width="0.8"/>
      </pattern>
    </defs>
    <g mask="url(#${id}-mask)">
      <rect x="-72" y="-72" width="144" height="144" fill="white" fill-opacity="0.35"/>
      <rect x="-72" y="-72" width="144" height="144" fill="url(#${id}-lines)" fill-opacity="0.65"/>
    </g>`;
  return group;
}

export function updateModalPlaneGrid(
  grid: SVGGElement,
  polygon: SVGPolygonElement,
  size: number,
  color: string,
): void {
  const [a, b, , d] = Array.from(polygon.points);
  const ux = (b.x - a.x) / size;
  const uy = (b.y - a.y) / size;
  const vx = (d.x - a.x) / size;
  const vy = (d.y - a.y) / size;
  const cx = a.x + ((ux + vx) * size) / 2;
  const cy = a.y + ((uy + vy) * size) / 2;
  grid.setAttribute("transform", `matrix(${ux} ${uy} ${vx} ${vy} ${cx} ${cy})`);
  grid.style.color = color;
}
