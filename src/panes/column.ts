import { gesture } from "./gesture.js";
import { preference, remember, type Side } from "./layout.js";
import { button } from "./pane.js";

export class DockColumn {
  readonly root = document.createElement("aside");
  readonly stack = document.createElement("div");
  readonly chooser = document.createElement("select");
  private rail: HTMLButtonElement;
  private width: number;
  private closed: boolean;
  private abort = new AbortController();
  private small = false;
  private peek = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private app: HTMLElement,
    readonly side: Side,
    show: (id: string) => void,
  ) {
    this.width = Number(preference(`${side}Width`, side === "left" ? 212 : 246)) || 212;
    this.closed = preference(`${side}Closed`, false);
    this.root.dataset.side = side;
    this.root.className = "pane-column";
    this.root.setAttribute("aria-label", `${side} dock`);
    this.stack.className = "pane-stack";
    this.chooser.setAttribute("aria-label", `Show pane in ${side} dock`);
    this.chooser.onchange = () => {
      show(this.chooser.value);
      this.chooser.selectedIndex = 0;
    };
    this.rail = button(`Toggle or drag to resize ${side} dock`, "");
    this.rail.className = "pane-rail";
    const tab = document.createElement("span");
    tab.className = "pane-tab";
    tab.setAttribute("aria-hidden", "true");
    this.rail.append(tab);
    this.root.append(this.chooser, this.stack, this.rail);
    app.append(this.root);
    gesture(this.rail, () => {
      clearTimeout(this.timer);
      const width = this.root.clientWidth;
      return {
        move: (dx) => {
          this.width = Math.max(
            186,
            Math.min(app.clientWidth * 0.44, width + (side === "left" ? dx : -dx)),
          );
          this.open();
        },
        end: (dragged) => {
          if (dragged) remember(`${side}Width`, this.width);
          else this.toggle();
        },
      };
    });
    this.rail.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const grow = (event.key === "ArrowRight") === (side === "left");
      this.width = Math.max(186, Math.min(app.clientWidth * 0.44, this.width + (grow ? 16 : -16)));
      this.open();
      remember(`${side}Width`, this.width);
    };
    this.rail.onclick = (e) => {
      if (e.detail === 0) this.toggle();
    };
    this.rail.onpointerenter = (e) => {
      if (e.pointerType === "mouse" && (this.small || this.closed))
        this.timer = setTimeout(() => {
          this.peek = true;
          this.fit();
        }, 350);
    };
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (this.peek && !this.root.contains(event.target as Node)) {
          this.peek = false;
          this.fit();
        }
      },
      { capture: true, signal: this.abort.signal },
    );
    this.root.onpointerleave = (event) => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(this.timer);
      if (this.peek) {
        this.peek = false;
        this.fit();
      }
    };
  }
  open() {
    if (this.small) this.peek = true;
    else if (this.closed) {
      this.closed = false;
      remember(`${this.side}Closed`, false);
    }
    this.fit();
  }
  private toggle() {
    if (this.small) this.peek = !this.peek;
    else {
      this.closed = !this.closed;
      this.peek = false;
      remember(`${this.side}Closed`, this.closed);
    }
    this.fit();
  }
  fit() {
    const small = this.app.clientWidth < 760;
    if (small !== this.small) this.peek = false;
    this.small = small;
    const pinned = !small && !this.closed;
    const width =
      pinned || this.peek
        ? Math.min(Math.max(186, this.width), this.app.clientWidth * (small ? 0.72 : 0.36))
        : 10;
    this.root.classList.toggle("closed", !pinned && !this.peek);
    this.rail.setAttribute("aria-expanded", String(pinned || this.peek));
    this.root.style.width = `${width}px`;
    this.app.dispatchEvent(new Event("pane-layout"));
    this.app.style.setProperty(`--pane-${this.side}`, `${pinned ? width : 10}px`);
  }
  dispose() {
    this.abort.abort();
    clearTimeout(this.timer);
    this.root.remove();
  }
}
