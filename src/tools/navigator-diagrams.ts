import { selectionDiagram } from "./navigator-selection-diagrams.js";

/** Explanatory, shared before/after drawings, not toolbar glyphs. */
const box = '<path d="m18 34 27-15 29 15-28 16Z M18 34v27l28 16 28-16V34 M46 50v27"/>';
const circle = '<circle cx="46" cy="48" r="25"/>';
const curve = '<path d="M14 72C25 12 58 12 79 65"/>';
const arrow = '<path d="M88 48h23m-8-7 8 7-8 7"/>';
const result = (drawing: string) =>
  `<g transform="translate(112 0)" class="diagram-result">${drawing}</g>`;
const line = '<path d="M17 69 74 25"/>';
const profile = '<path d="M18 61 47 46 75 61 46 77Z"/>';
const plane = '<path d="m12 61 44-35 28 21-44 35Z"/>';
const documentShape = '<path d="M26 17h33l14 15v48H26Z M59 17v16h14 M35 43h27M35 53h27M35 63h18"/>';
const grid = '<path d="M18 21h56v56H18Z M18 40h56M18 59h56M37 21v56M56 21v56"/>';
const point = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="4" class="diagram-point"/>`;
function booleanDrawing(id: string): string {
  const left =
    '<rect x="16" y="25" width="40" height="40" rx="2"/><circle cx="61" cy="57" r="24" class="diagram-secondary"/>';
  const shapes: Record<string, string> = {
    union: '<path d="M16 25h40v8a24 24 0 1 1-18 32H16Z"/>',
    subtract: '<path d="M16 25h40v8a24 24 0 0 0-18 32H16Z"/>',
    intersect: '<path d="M56 33v32H38a24 24 0 0 1 18-32Z"/>',
  };
  return left + arrow + result(shapes[id]);
}
function solidDrawing(id: string): string | null {
  if (["union", "subtract", "intersect"].includes(id)) return booleanDrawing(id);
  if (["cube", "extrude"].includes(id)) return profile + arrow + result(box);
  if (["cylinder", "cone", "sphere", "revolve"].includes(id)) {
    const round =
      id === "cone"
        ? '<path d="m19 70 27-49 27 49"/><ellipse cx="46" cy="70" rx="27" ry="8"/>'
        : id === "sphere" || id === "revolve"
          ? `${circle}<ellipse cx="46" cy="48" rx="11" ry="25"/>`
          : '<ellipse cx="46" cy="25" rx="25" ry="9"/><path d="M21 25v46c0 12 50 12 50 0V25"/><path d="M21 71c0-12 50-12 50 0"/>';
    return circle + arrow + result(round);
  }
  if (id === "loft")
    return (
      '<ellipse cx="45" cy="23" rx="17" ry="7"/><rect x="15" y="65" width="62" height="15"/>' +
      arrow +
      result(
        '<ellipse cx="45" cy="23" rx="17" ry="7"/><path d="M28 23 15 65v15h62V65L62 23 M15 65h62"/>',
      )
    );
  if (id === "erode")
    return (
      box +
      arrow +
      result(
        `<g class="diagram-secondary">${box}</g><g transform="translate(12 12) scale(.73)">${box}</g>`,
      )
    );
  if (["shell", "drill"].includes(id))
    return (
      box +
      arrow +
      result(
        box +
          (id === "drill"
            ? '<ellipse cx="46" cy="34" rx="10" ry="6"/>'
            : '<path d="m25 36 20-10 22 10-21 11Z M25 36v20l21 12 21-12V36"/>'),
      )
    );
  if (["fillet", "chamfer", "sketch-fillet"].includes(id))
    return (
      '<path d="M20 77V23h55"/>' +
      arrow +
      result(
        id === "chamfer" ? '<path d="M20 77V43l20-20h35"/>' : '<path d="M20 77V47q0-24 24-24h31"/>',
      )
    );
  if (id === "split")
    return (
      box +
      arrow +
      result(
        '<path d="m18 27 27-15 29 15-28 16Z M18 27v13l28 16 28-16V27M46 43v13 M18 55l28 16 28-16v15L46 86 18 70Z M46 71v15"/>',
      )
    );
  if (id === "imprint")
    return box + arrow + result(`${box}<path d="m18 48 28 16 28-16" class="diagram-selection"/>`);
  if (id === "cross-section")
    return (
      box +
      arrow +
      result(
        '<path d="m18 48 27-15 29 15-28 16Z M18 48v14l28 16 28-16V48M46 64v14"/><ellipse cx="46" cy="48" rx="11" ry="6"/><path d="m10 48 37-22 36 22" class="diagram-secondary"/>',
      )
    );
  if (["offset", "cleanup"].includes(id))
    return (
      box +
      '<path d="M32 27v42" class="diagram-secondary"/>' +
      arrow +
      result(id === "offset" ? `<g transform="translate(-8 -5) scale(1.15)">${box}</g>` : box)
    );
  return null;
}
function sketchDrawing(id: string): string | null {
  if (id === "trim")
    return `<path d="M15 65 74 13M30 16v63M60 16v63"/>${arrow}${result('<path d="m15 65 15-13m30-27 14-12M30 16v63M60 16v63"/>')}`;
  const drawings: Record<string, string> = {
    line,
    rectangle: '<rect x="17" y="25" width="58" height="46"/>',
    circle,
    bezier: `${curve}<path d="m14 72 10-46m55 39-20-40" class="diagram-secondary"/>`,
    pen: '<path d="M13 72 29 30Q57 1 77 66"/>',
    trim: '<path d="M15 65 34 48m14-12 26-23 M30 16v63"/>',
  };
  if (drawings[id])
    return `${result(drawings[id])}<path d="M19 76h55M19 76V22" class="diagram-secondary"/>${arrow}`;
  if (id === "sketch-offset")
    return curve + arrow + result(`${curve}<path d="M26 78C35 31 55 31 68 72"/>`);
  if (["project", "use-edge"].includes(id))
    return (
      box +
      arrow +
      result(`${plane}<path d="M29 59 54 38 68 48 43 69Z" class="diagram-secondary"/>`)
    );
  if (
    id.startsWith("sketch-") ||
    ["start-sketch", "edit-sketch", "new-sketch-on-plane", "construction-plane"].includes(id)
  )
    return (
      plane +
      arrow +
      result(
        plane +
          (id === "construction-plane"
            ? '<path d="M46 44V13m-6 6 6-6 6 6"/>'
            : '<path d="m31 59 23-18 11 9-23 18Z"/>'),
      )
    );
  return null;
}
function relationshipDrawing(id: string): string | null {
  if (id.startsWith("lock-"))
    return (
      '<path d="M18 62h58M18 56v12m58-12v12 M18 38h58m-50-5-8 5 8 5m42-10 8 5-8 5"/>' +
      arrow +
      result(
        '<rect x="29" y="43" width="34" height="29" rx="3"/><path d="M35 43V31a11 11 0 0 1 22 0v12"/>' +
          point(46, 56),
      )
    );
  if (id.startsWith("constraint-")) {
    const kind = id.slice(11);
    const after =
      kind === "horizontal"
        ? '<path d="M17 48h57"/>'
        : kind === "vertical"
          ? '<path d="M46 20v57"/>'
          : kind === "concentric"
            ? `${circle}<circle cx="46" cy="48" r="14"/>`
            : kind === "tangent"
              ? '<circle cx="46" cy="39" r="21"/><path d="M16 60h60"/>'
              : '<path d="m16 60 50-32m-40 48 50-32"/>';
    return `${line}<path d="m19 27 49 44" class="diagram-secondary"/>${arrow}${result(after)}`;
  }
  if (id.startsWith("points-") || id.startsWith("point-"))
    return (
      '<path d="M13 70 35 42m23 0 22 28"/>' +
      point(35, 42) +
      point(58, 42) +
      arrow +
      result(
        id === "points-unfuse"
          ? `<path d="M13 70 35 42m23 0 22 28"/>${point(35, 42)}${point(58, 42)}`
          : `<path d="M13 70 46 42 80 70"/>${point(46, 42)}`,
      )
    );
  return null;
}
function utilityDrawing(id: string): string {
  if (id === "mirror")
    return `<path d="M20 70V24l45 46Z"/>${arrow}${result('<path d="M70 70V24L25 70Z M17 12v72"/>')}`;
  if (id === "settings")
    return (
      grid +
      arrow +
      result(
        '<path d="M18 28h58M18 48h58M18 68h58"/><circle cx="32" cy="28" r="6"/><circle cx="60" cy="48" r="6"/><circle cx="43" cy="68" r="6"/>',
      )
    );
  if (id === "knurling")
    return (
      box +
      arrow +
      result(
        `${box}<path d="m20 40 23 26m-23-16 23 26m-13-32 13 15m-23 2 23-10m-23 20 23-10m-13 16 13-6"/>`,
      )
    );
  if (["transform", "duplicate"].includes(id))
    return (
      box +
      arrow +
      result(
        '<g transform="translate(25 -8) scale(.7)">' +
          box +
          "</g>" +
          (id === "duplicate"
            ? `<g transform="translate(-3 27) scale(.6)">${box}</g>`
            : '<path d="M12 81h69M46 12v70" class="diagram-secondary"/>'),
      )
    );
  if (["threads", "gear", "knurling", "decorator-library"].includes(id))
    return (
      box +
      arrow +
      result(
        id === "gear"
          ? '<path d="m40 15 12 0 3 9 9 4 9-3 6 10-6 7v12l6 7-6 10-9-3-9 4-3 9H40l-3-9-9-4-9 3-6-10 6-7V42l-6-7 6-10 9 3 9-4Z"/><circle cx="46" cy="48" r="14"/>'
          : box +
              '<path d="m20 39 25 14m-25-5 25 14m-25-5 25 14m6-18 21-12m-21 21 21-12m-21 21 21-12"/>',
      )
    );
  if (id === "grid" || id === "sketch-grid") return grid + arrow + result(grid + point(37, 40));
  const selection = selectionDiagram(id, box, arrow);
  if (selection) return selection;
  if (id === "clear-sketch")
    return curve + arrow + result('<path d="M18 77h58M18 77V22" class="diagram-secondary"/>');
  if (id === "modeling") return plane + arrow + result(box);
  if (id === "import-mesh")
    return `${box}<path d="m18 34 28 43 28-43M18 61l56-27"/>${arrow}${result(box)}`;
  if (id === "reopen-operation")
    return box + arrow + result(`${box}<path d="M8 28C8 5 79 5 79 28m-7-6 7 6 5-8"/>`);
  return (
    (id.startsWith("export-") || id === "capture" ? box : documentShape) +
    arrow +
    result(
      documentShape +
        (id === "cancel-export"
          ? '<path d="m32 40 32 32m0-32-32 32"/>'
          : '<path d="m35 60 9 9 18-21"/>'),
    )
  );
}
export function toolDiagram(id: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 210 96");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("tool-diagram");
  svg.innerHTML =
    solidDrawing(id) ?? sketchDrawing(id) ?? relationshipDrawing(id) ?? utilityDrawing(id);
  return svg;
}
