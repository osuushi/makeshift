/** A drill silhouette for the guided hole tool's discovery entry. */
export function drillIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  svg.style.verticalAlign = "middle";
  svg.style.marginRight = "6px";
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M3 4h10l3 3v5H9v2l2 6H5l-2-8V4Zm13 3h3v4h-3m3-2h4M9 12v4h3");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}
