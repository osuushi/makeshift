/** Highlights illustrate selection changes without suggesting geometry edits. */
export function selectionDiagram(id: string, box: string, arrow: string): string | null {
  if (
    !id.startsWith("select") &&
    !["tag-geometry", "isolate", "end-isolation", "show-bodies", "hide-bodies"].includes(id)
  )
    return null;
  const face = '<path d="m18 34 28 16v27L18 61Z" class="diagram-selection"/>';
  const edge = '<path d="M46 50v27" class="diagram-selection"/>';
  const boundary = '<path d="m18 34 28 16v27L18 61Z" fill="none" class="diagram-selection"/>';
  const whole = `<g class="diagram-selection">${box}</g>`;
  let before = "",
    after = face;
  if (["selection-remove-edges", "selection-only-faces"].includes(id)) {
    before = face + edge;
    after = face;
  }
  if (["selection-remove-faces", "selection-only-edges"].includes(id)) {
    before = face + edge;
    after = edge;
  }
  if (id === "selection-add-faces") {
    before = edge;
    after = edge + face;
  }
  if (id === "selection-add-edges") {
    before = face;
    after = face + boundary;
  }
  if (id === "selection-boundary") {
    before = face;
    after = boundary;
  }
  if (id === "selection-bodies") {
    before = face;
    after = whole;
  }
  if (id === "selection-clear") {
    before = face + edge;
    after = "";
  }
  if (id === "tag-geometry") after += '<path d="M54 54h24l9 10-9 10H54Z"/>';
  if (id.startsWith("select-all-")) after = whole;
  if (["isolate", "end-isolation", "show-bodies", "hide-bodies"].includes(id)) {
    const surrounding = `<g transform="translate(38 9) scale(.6)" class="diagram-secondary">${box}</g>`;
    const show = id === "show-bodies" || id === "end-isolation";
    return `${(show ? box : box + surrounding) + arrow}<g transform="translate(112 0)" class="diagram-result">${show ? box + surrounding : id === "hide-bodies" ? '<path d="M17 77h62" class="diagram-secondary"/>' : box}</g>`;
  }
  return `${box + before + arrow}<g transform="translate(112 0)">${box}${after}</g>`;
}
