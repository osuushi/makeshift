import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";

/** Read-only end guides and the axis of the recovered section. */
export function profileReferences(editor: SketchEditor, overlay: HTMLElement): () => void {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const guides = document.createElementNS(ns, "path");
  svg.classList.add("profile-reference-guides");
  svg.setAttribute("aria-hidden", "true");
  svg.append(guides);
  overlay.append(svg);
  const update = () => {
    const profile = editor.store.profileEdit;
    svg.toggleAttribute("hidden", !profile || !editor.world.active);
    if (!profile || !editor.world.active) return;
    const { sketch, height } = profile;
    const radius = Math.max(
      height / 4,
      ...sketch.curves.flatMap((curve) => (curve.kind === "circle" ? [] : [curve.a.x, curve.b.x])),
    );
    const { left, top } = overlay.getBoundingClientRect();
    const screen = (point: Point) => {
      const p = editor.world.projectLocal(sketch.plane, point);
      return `${p.x - left} ${p.y - top}`;
    };
    const line = (a: Point, b: Point) => `M ${screen(a)} L ${screen(b)}`;
    guides.setAttribute(
      "d",
      [
        line({ x: 0, y: -height / 12 }, { x: 0, y: (height * 13) / 12 }),
        ...[0, height].map((y) => line({ x: 0, y }, { x: radius * 1.1, y })),
      ].join(" "),
    );
  };
  editor.world.changed.add(update);
  update();
  return () => {
    editor.world.changed.delete(update);
    svg.remove();
  };
}
