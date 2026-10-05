import { measuredControlRect, type WidgetRect, widgetRectClear } from "./widget-viewport.js";

/** Only DOM gesture ownership and displayed corrections live here. */
export class WidgetFreeze {
  private hovering = false;
  private pressed = false;
  private picked: HTMLElement | null = null;
  private immediate = false;
  private controller = new AbortController();
  get active(): boolean {
    return this.hovering || this.pressed;
  }
  constructor(
    root: HTMLElement,
    private targets: ReadonlyMap<HTMLElement, WidgetRect>,
  ) {
    const options = { signal: this.controller.signal, capture: true };
    root.addEventListener("pointerover", (event) => this.hold(event), options);
    root.addEventListener(
      "pointerout",
      (event) => {
        if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
        this.hovering = false;
        if (!this.pressed) this.picked = null;
        this.resume();
      },
      options,
    );
    root.addEventListener(
      "pointerdown",
      (event) => {
        this.picked = this.target(event.target);
        this.pressed = true;
        this.hold();
      },
      options,
    );
    for (const type of ["pointerup", "pointercancel", "blur"])
      window.addEventListener(
        type,
        (event) => {
          if (type === "blur" && event.target !== window) return;
          this.pressed = false;
          this.picked =
            type === "pointerup" && event instanceof PointerEvent
              ? this.target(document.elementFromPoint(event.clientX, event.clientY))
              : null;
          this.hovering = !!this.picked;
          this.resume();
        },
        options,
      );
  }
  private target(target: EventTarget | null): HTMLElement | null {
    return target instanceof Node
      ? ([...this.targets.keys()].find((element) => element.contains(target)) ?? null)
      : null;
  }
  private hold(event?: PointerEvent): void {
    if (!this.pressed && event) this.picked = this.target(event.target);
    // A new press also freezes animations begun while the pointer stayed in this assembly.
    if (this.hovering && !this.pressed) return;
    this.hovering = true;
    for (const element of this.targets.keys()) {
      const translation = getComputedStyle(element).translate;
      element.style.transition = "none";
      element.style.translate = translation;
    }
  }
  resume(immediate = this.immediate): void {
    this.immediate = immediate;
    if (this.active) return;
    for (const [element, point] of this.targets) {
      element.style.transition =
        immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "none"
          : "translate 100ms ease-out";
      element.style.translate = `${point.x}px ${point.y}px`;
    }
  }
  heldControls(visible: HTMLElement[], obstacles: WidgetRect[], viewport: WidgetRect): boolean[] {
    const held = visible.map(() => false);
    if (!this.active) return held;
    const current = visible.map(measuredControlRect),
      reserved = [...obstacles];
    const picked = visible.indexOf(this.picked as HTMLElement);
    const order = visible
      .map((_, i) => i)
      .sort((a, b) =>
        a === picked
          ? -1
          : b === picked
            ? 1
            : Number(visible[b].matches("button,input")) -
              Number(visible[a].matches("button,input")),
      );
    for (const i of order) {
      const previous = this.targets.get(visible[i]);
      if (!previous) continue;
      const grew =
        current[i].width > previous.width + 0.01 || current[i].height > previous.height + 0.01;
      // A press owns its exact correction until release. Idle hover may keep that
      // correction only while normal model/camera tracking leaves its footprint safe.
      const pinned = i === picked && this.pressed;
      if (pinned || ((i === picked || !grew) && widgetRectClear(current[i], reserved, viewport))) {
        held[i] = true;
        reserved.push(current[i]);
      }
    }
    return held;
  }
  dispose(): void {
    this.controller.abort();
    this.picked = null;
  }
}
