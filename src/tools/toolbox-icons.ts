const icons: Record<string, string> = {
  "sketch-grid":
    '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  select: '<path d="M5 3v17l5-5 3 7 3-1-3-7h7L5 3Z"/>',
  line: '<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  rectangle: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  pen: '<path d="m4 20 4-1 10-10-3-3L5 16l-1 4Z"/><path d="m13 7 3 3"/>',
  trim: '<path d="M4 4 20 20M20 4 4 20"/><path d="M8 8 4 4m12 12 4 4"/>',
  "start-sketch": '<path d="M4 4h12v12H4z"/><path d="m13 13 6-6 2 2-6 6-3 1 1-3Z"/>',
  cube: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  cylinder:
    '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 18c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  sphere:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 2.5 3 13.5 0 18M12 3c-3 2.5-3 13.5 0 18"/>',
  cone: '<path d="m12 3 9 17H3L12 3Z"/><ellipse cx="12" cy="20" rx="9" ry="3"/>',
  drill: '<path d="M9 3h6v4H9zM8 7h8l2 5v5l-6 5-6-5v-5l2-5Z"/><path d="M12 12v7"/>',
  extrude: '<path d="M4 9 12 5l8 4-8 4-8-4Z"/><path d="M4 9v7l8 4 8-4V9M12 13v7M8 7l8 4v6"/>',
  offset: '<path d="M5 5h12v12H5z"/><path d="M8 8h12v12H8zM2 2h12v12"/>',
  bezier:
    '<path d="M3 19C4 2 20 22 21 5"/><circle cx="3" cy="19" r="2"/><circle cx="21" cy="5" r="2"/>',
  union: '<circle cx="9" cy="10" r="6"/><circle cx="15" cy="14" r="6"/>',
  fillet: '<path d="M4 21V10a6 6 0 0 1 6-6h11"/><path d="M8 21V12a4 4 0 0 1 4-4h9"/>',
  transform: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  "construction-plane": '<path d="m2 16 7-12 13 4-7 12-13-4Z"/><path d="M12 5v14"/>',
  threads: '<path d="M8 3h8v18H8zM5 6l14-2M5 10l14-2M5 14l14-2M5 18l14-2"/>',
  "cross-section": '<path d="M3 6h18v14H3zM12 2v22"/>',
  "export-step": '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 14h8m-3-3 3 3-3 3"/>',
};
export function toolboxIcon(id: string): SVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.6");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.innerHTML = icons[id] ?? '<path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="M8 12h8M12 8v8"/>';
  return icon;
}
