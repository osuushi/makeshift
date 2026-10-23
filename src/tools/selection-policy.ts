/** Whole categories may be removed, never individual members of a category. */
export function narrowCategories<T>(
  selected: readonly T[],
  category: (target: T) => string,
  valid: (targets: T[]) => boolean,
): T[] | null {
  if (valid([...selected])) return [...selected];
  const categories = [...new Set(selected.map(category))];
  const choices: T[][] = [];
  for (let mask = 1; mask < 2 ** categories.length - 1; mask++) {
    const targets = selected.filter((target) => mask & (1 << categories.indexOf(category(target))));
    if (valid(targets)) choices.push(targets);
  }
  // Prefer retaining categories, but never guess between incomparable valid choices.
  const maximal = choices.filter(
    (choice) =>
      !choices.some(
        (other) => other.length > choice.length && choice.every((t) => other.includes(t)),
      ),
  );
  return maximal.length === 1 ? maximal[0] : null;
}

export interface SelectionPolicy {
  model?: readonly string[];
  sketch?: readonly string[];
  single?: boolean;
  pickBodies?: boolean;
}
const solids = ["body", "face", "edge"];
const curves = ["segment", "circle", "arc", "bezier", "group"];
const points = ["endpoint", "curve-center", "midpoint", "group-center", "group-handle"];
const geometry = [...curves, ...points];
/** Audited selection-dependent catalog entries. Workspace/history/busy guards remain separate. */
export const selectionPolicies: Readonly<Record<string, SelectionPolicy>> = {
  extrude: { model: ["profile", "face"] },
  revolve: { model: ["profile", "face"] },
  loft: { model: ["profile", "face"] },
  offset: { model: ["body", "face"] },
  shell: { model: ["body", "face"] },
  erode: { model: solids, pickBodies: true },
  fillet: { model: ["face", "edge"] },
  chamfer: { model: ["face", "edge"] },
  union: { model: solids, pickBodies: true },
  subtract: { model: solids, pickBodies: true },
  intersect: { model: solids, pickBodies: true },
  duplicate: { model: solids, pickBodies: true },
  cleanup: { model: solids },
  split: { model: solids, pickBodies: true },
  "tag-geometry": { model: ["face", "edge"] },
  imprint: { model: ["face"] },
  transform: { model: [...solids, "sketch", "profile"], sketch: geometry },
  move: { model: [...solids, "sketch", "profile"], sketch: geometry },
  rotate: { model: [...solids, "sketch", "profile"], sketch: geometry },
  scale: { model: [...solids, "sketch", "profile"], sketch: geometry },
  mirror: { model: [...solids, "sketch", "profile"], sketch: curves },
  threads: { model: ["face"] },
  gear: { model: ["face"] },
  knurling: { model: ["face"] },
  "edit-sketch": { model: ["sketch", "profile"], single: true },
  "new-sketch-on-plane": { model: ["sketch", "profile"], single: true },
  "sketch-on-face": { model: ["face"], single: true },
  "select-face": { model: ["profile"], single: true },
  "sketch-offset": { sketch: curves },
  "sketch-fillet": { sketch: ["segment", "arc", "bezier", "endpoint", "group-handle"] },
  "constraint-horizontal": { sketch: ["segment"], single: true },
  "constraint-vertical": { sketch: ["segment"], single: true },
  "constraint-parallel": { sketch: ["segment"] },
  "constraint-equal": { sketch: ["segment"] },
  "constraint-concentric": { sketch: ["circle", "arc"] },
  "constraint-tangent": { sketch: ["segment", "circle", "arc", "bezier"] },
  "point-on-edge": { sketch: ["endpoint", "curve-center", "segment", "circle", "arc"] },
  "point-tangent": { sketch: ["endpoint", "curve-center"] },
  "points-fuse": { sketch: ["endpoint", "curve-center"] },
  "points-unfuse": { sketch: ["endpoint", "curve-center"] },
  "points-coincident": { sketch: ["endpoint", "curve-center"] },
  "lock-width": { sketch: ["group"], single: true },
  "lock-height": { sketch: ["group"], single: true },
  "lock-length": { sketch: ["segment"], single: true },
  "lock-radius": { sketch: ["circle", "arc"], single: true },
  "lock-cornerAngle": { sketch: ["segment", "group-handle"] },
  isolate: { model: [...solids, "sketch", "profile"], sketch: geometry },
  copy: { model: ["body", "sketch", "profile"], sketch: geometry },
  delete: { model: [...solids, "sketch", "profile"], sketch: geometry },
  "selection-only-faces": { model: ["body", "face"] },
  "selection-only-edges": { model: ["edge"] },
  "selection-boundary": { model: ["body", "face"] },
  "selection-add-faces": { model: ["edge"] },
  "selection-add-edges": { model: ["face"] },
  "selection-bodies": { model: ["face", "edge"] },
  "selection-remove-edges": { model: [...solids, "sketch", "profile"] },
  "selection-remove-faces": { model: [...solids, "sketch", "profile"] },
  "selection-clear": { model: [...solids, "sketch", "profile"], sketch: geometry },
};
