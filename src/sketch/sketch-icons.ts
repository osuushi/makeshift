const paths = {
  undo: "M3 10h11a6 6 0 0 1 0 12 M3 10l6-6 M3 10l6 6",
  redo: "M21 10H10a6 6 0 0 0 0 12 M21 10l-6-6 M21 10l-6 6",
  rotate: "M19 8a8 8 0 1 0 1 7 M19 3v5h-5",
  translate: "M3 12h18 M7 8l-4 4 4 4 M17 8l4 4-4 4",
  parallel: "M5 18 11 6 M13 18 19 6",
  perpendicular: "M6 4v15h14 M6 14h5v5",
  equal: "M5 9h14 M5 15h14",
  horizontal: "M3 12h18 M3 9v6 M21 9v6",
  vertical: "M12 3v18 M9 3h6 M9 21h6",
  coincident: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M3 12h4 M17 12h4 M12 3v4 M12 17v4",
  concentric: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  tangent: "M2 20h20 M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
  unlock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0 M12 14v3",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  angle: "M3 4v17h18 M3 14a7 7 0 0 1 7 7",
  unfuse:
    "M2 12h4 M18 12h4 M6 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M18 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M10 4l4 16",
  move: "M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4",
};
export type SketchIcon = keyof typeof paths;
export function sketchIcon(name: SketchIcon): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", paths[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
