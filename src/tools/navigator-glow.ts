/** Proximity changes light intensity only; target geometry stays fixed. */
export function illuminateTargets(grid: HTMLElement, pointer?: { x: number; y: number }): void {
  for (const target of grid.querySelectorAll<HTMLElement>(".navigator-target")) {
    const bounds = target.getBoundingClientRect();
    const distance = pointer
      ? Math.hypot(
          pointer.x - bounds.x - bounds.width / 2,
          pointer.y - bounds.y - bounds.height / 2,
        )
      : Number.POSITIVE_INFINITY;
    const proximity = Math.max(0, Math.min(1, 1 - (distance - bounds.width / 2) / 100));
    target.style.setProperty("--target-proximity", String(proximity * proximity));
  }
}
