const paths = {
  chevron: '<path d="m9 5 7 7-7 7"/>',
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  down: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
} as const;

/** Inspector chrome uses drawn strokes, never font-dependent symbols. */
export function inspectorIcon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("inspector-icon");
  if (name === "chevron") svg.classList.add("inspector-chevron");
  svg.innerHTML = paths[name];
  return svg;
}
