export const toolboxIconPaths: Record<string, string> = {
  "toolbox-menu": '<path d="M3 6h7l2 3h9v11H3V6Z"/>',
  "guide-points": '<circle cx="12" cy="12" r="8"/><path d="M7 12h10M12 7v10"/>',
  "sketch-grid":
    '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  select: '<path d="M5 3v17l5-5 3 7 3-1-3-7h7L5 3Z"/>',
  line: '<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  rectangle: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  pen: '<path d="m3 21 4-13 8-3 4 4-3 8-13 4Zm0 0 7-7M14 4l2-2 6 6-2 2Z"/><circle cx="11.5" cy="12.5" r="2"/>',
  trim: '<circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m7 16 13-13M17 16 4 3"/>',
  "start-sketch": '<path d="M4 4h12v12H4z"/><path d="m13 13 6-6 2 2-6 6-3 1 1-3Z"/>',
  cube: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  cylinder:
    '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 18c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  sphere:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 2.5 3 13.5 0 18M12 3c-3 2.5-3 13.5 0 18"/>',
  cone: '<path d="m12 3 9 17H3L12 3Z"/><ellipse cx="12" cy="20" rx="9" ry="3"/>',
  extrude:
    '<path d="m3 16 7-4 7 4-7 4-7-4ZM3 16v-6l7-4 7 4v6M3 10l7 4 7-4M10 14v6M21 14V2m-3 3 3-3 2 3"/>',
  offset: '<path d="M5 5h12v12H5z"/><path d="M8 8h12v12H8zM2 2h12v12"/>',
  bezier:
    '<path d="M3 19C4 2 20 22 21 5"/><circle cx="3" cy="19" r="2"/><circle cx="21" cy="5" r="2"/>',
  union: '<circle cx="9" cy="10" r="6"/><circle cx="15" cy="14" r="6"/>',
  fillet: '<path d="M4 21V10a6 6 0 0 1 6-6h11"/><path d="M8 21V12a4 4 0 0 1 4-4h9"/>',
  transform: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  move: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  rotate: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  scale: '<rect x="3" y="13" width="8" height="8"/><path d="M13 3h8v8M21 3l-9 9"/>',
  "construction-plane": '<path d="m2 16 7-12 13 4-7 12-13-4Z"/><path d="M12 5v14"/>',
  threads: '<path d="M8 3h8v18H8zM5 6l14-2M5 10l14-2M5 14l14-2M5 18l14-2"/>',
  "cross-section": '<path d="M3 6h18v14H3zM12 2v22"/>',
  revolve:
    '<path d="M12 2v20" stroke-dasharray="2 2"/><path d="M9 4H5v12h4M15 5c8 2 8 11 1 14m0-4v4h4"/>',
  loft: '<ellipse cx="12" cy="5" rx="5" ry="2.5"/><ellipse cx="12" cy="19" rx="9" ry="3"/><path d="M7 5C7 11 3 12 3 19M17 5c0 6 4 7 4 14"/>',
  subtract: '<path d="M12 4a8 8 0 1 0 8 11 7 7 0 0 1-8-11Z"/><path d="M14 6h8"/>',
  intersect:
    '<circle cx="8" cy="12" r="7" stroke-dasharray="2 2"/><circle cx="16" cy="12" r="7" stroke-dasharray="2 2"/><path d="M12 6.3a7 7 0 0 1 0 11.4 7 7 0 0 1 0-11.4Z" fill="currentColor" fill-opacity=".18"/>',
  split: '<path d="M3 5h6v14H3V5ZM15 5h6v14h-6V5ZM12 2v20"/><path d="m8 11-2 1 2 1m8-2 2 1-2 1"/>',
  imprint:
    '<path d="m2 10 10-6 10 6-10 7-10-7ZM2 10v6l10 6 10-6v-6M12 17v5"/><path d="m8 10 4-2 4 2-4 3-4-3Z"/>',
  chamfer: '<path d="M4 21V11l7-7h10M8 21v-8l5-5h8"/>',
  shell:
    '<path d="m3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v11"/><path d="m7 7 5-2 5 2-5 2-5-2Z" fill="currentColor" fill-opacity=".15"/>',
  erode: '<path d="M3 4h10v4h4v5h4v8H3V4Z"/><path d="M17 3h1m3 4h1m-7 5h1m-9 5h3"/>',
  gear: '<path d="M19.02 9.09L19.37 10.16L21.85 10.26L21.85 13.74L19.37 13.84L19.02 14.91L18.51 15.91L20.19 17.74L17.74 20.19L15.91 18.51L14.91 19.02L13.84 19.37L13.74 21.85L10.26 21.85L10.16 19.37L9.09 19.02L8.09 18.51L6.26 20.19L3.81 17.74L5.49 15.91L4.98 14.91L4.63 13.84L2.15 13.74L2.15 10.26L4.63 10.16L4.98 9.09L5.49 8.09L3.81 6.26L6.26 3.81L8.09 5.49L9.09 4.98L10.16 4.63L10.26 2.15L13.74 2.15L13.84 4.63L14.91 4.98L15.91 5.49L17.74 3.81L20.19 6.26L18.51 8.09Z"/><circle cx="12" cy="12" r="3.5"/>',
  knurling:
    '<path d="M4 4h16v16H4zM4 10l6-6M4 16 16 4M6 20 20 6M12 20l8-8M18 20l2-2M4 14l6 6M4 8l12 12M6 4l14 14M12 4l8 8M18 4l2 2"/>',
  "sketch-offset":
    '<path d="M3 19V9a6 6 0 0 1 6-6h10M8 19v-9a2 2 0 0 1 2-2h9M13 13l7 7m-4 0h4v-4"/>',
  "sketch-fillet":
    '<path d="M4 20V4h16" stroke-dasharray="2 3"/><path d="M4 20v-6A10 10 0 0 1 14 4h6M12 12l6 6m-4 0h4v-4"/>',
  project:
    '<path d="m2 17 10-4 10 4-10 5-10-5ZM6 5h12M6 3v8m-2-2 2 2 2-2M18 3v8m-2-2 2 2 2-2"/><path d="M6 17h12" stroke-dasharray="2 2"/>',
  "use-edge":
    '<path d="m3 7 8-4 8 4v11l-8 4-8-4V7Zm0 0 8 4 8-4M11 11v11" stroke-dasharray="2 2"/><path d="m3 7 8 4 8-4" stroke-width="2.4"/><path d="M21 11v10m-2-2 2 2 2-2"/>',
  mirror:
    '<path d="M12 2v20" stroke-dasharray="2 2"/><path d="M3 5v14l6-4V9L3 5ZM21 5v14l-6-4V9l6-4Z"/>',
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
  const paths = toolboxIconPaths[id];
  if (!paths) throw new Error(`Missing toolbox icon: ${id}`);
  icon.innerHTML = paths;
  return icon;
}
