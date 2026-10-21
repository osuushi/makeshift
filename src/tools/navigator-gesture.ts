export interface GestureTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
}
/** Pure spatial state: a new screen cannot activate underneath a stationary pointer. */
export class NavigatorGesture {
  private blocked = new Set<string>();
  reset(targets: GestureTarget[], x: number, y: number): void {
    this.blocked = new Set(targets.filter((t) => this.inside(t, x, y, 8)).map((t) => t.id));
  }
  enter(targets: GestureTarget[], x: number, y: number): string | undefined {
    for (const t of targets) {
      if (this.blocked.has(t.id)) {
        if (!this.inside(t, x, y, 8)) this.blocked.delete(t.id);
      } else if (this.inside(t, x, y)) {
        this.blocked.add(t.id);
        return t.id;
      }
    }
    return undefined;
  }
  private inside(t: GestureTarget, x: number, y: number, margin = 0): boolean {
    return Math.hypot(t.x - x, t.y - y) <= t.radius + margin;
  }
}
