import type { GestureTarget } from "./navigator-gesture.js";

type Point = { x: number; y: number };

/** Place once per screen, clearing the pointer without changing card order. */
export function placeNavigatorTargets(grid: HTMLElement, pointer?: Point): void {
  for (const target of grid.querySelectorAll<HTMLElement>(".navigator-target")) {
    const card = target.parentElement?.getBoundingClientRect();
    if (!card) continue;
    const radius = target.getBoundingClientRect().width / 2;
    const center = { x: card.width / 2, y: card.height / 2 };
    const candidates = [center];
    if (pointer) {
      const local = { x: pointer.x - card.x, y: pointer.y - card.y };
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8;
        candidates.push({
          x: Math.max(
            radius + 4,
            Math.min(card.width - radius - 4, local.x + Math.cos(angle) * (radius + 16)),
          ),
          y: Math.max(
            radius + 4,
            Math.min(card.height - radius - 4, local.y + Math.sin(angle) * (radius + 16)),
          ),
        });
      }
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
      );
    }
    const position = candidates.find(
      (p) =>
        !pointer || Math.hypot(card.x + p.x - pointer.x, card.y + p.y - pointer.y) >= radius + 12,
    );
    target.style.visibility = position ? "" : "hidden";
    target.style.left = `${(position ?? center).x - 1}px`;
    target.style.top = `${(position ?? center).y - 1}px`;
  }
}

export function navigatorTargets(grid: HTMLElement): GestureTarget[] {
  return [...grid.querySelectorAll<HTMLElement>(".navigator-target")]
    .filter((element) => element.style.visibility !== "hidden")
    .map((element) => {
      const r = element.getBoundingClientRect();
      return {
        id: element.parentElement?.dataset.entry ?? "",
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        radius: r.width / 2,
      };
    });
}
