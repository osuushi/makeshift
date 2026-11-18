import { DockColumn } from "./column.js";
import { gesture } from "./gesture.js";
import { type Place, preference, remember, type Side } from "./layout.js";
import {
  createPane,
  nextDockPane,
  type Pane,
  type PaneOptions,
  paintPane,
  populatePaneMenu,
} from "./pane.js";
import "./workspace.css";

export class WorkspacePanes {
  private panes = new Map<string, Pane>();
  protected readonly columns: Record<Side, DockColumn>;
  private observer: ResizeObserver;
  private order = preference<string[]>("order", []);
  constructor(readonly app: HTMLElement) {
    if (!Array.isArray(this.order)) this.order = [];
    const column = (side: Side) => new DockColumn(app, side, (id) => this.showInDock(id, side));
    this.columns = { left: column("left"), right: column("right") };
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(app);
    this.fit();
  }
  private showInDock(id: string, side: Side) {
    const pane = this.panes.get(id);
    if (!pane) return;
    pane.state.folded = false;
    pane.state.hidden = false;
    if (pane.empty) pane.state.autoHide = false;
    this.dock(pane, side);
  }
  private fit() {
    for (const column of Object.values(this.columns)) column.fit();
    for (const pane of this.panes.values()) paintPane(pane, this.app);
  }
  register(options: PaneOptions) {
    if (this.panes.has(options.id)) throw new Error(`Duplicate pane ${options.id}`);
    const p = createPane(options);
    this.panes.set(options.id, p);
    this.mount(p);
    p.root.addEventListener(
      "pointerdown",
      () => {
        if (p.state.place !== "floating") return;
        for (const item of this.panes.values()) item.root.classList.toggle("front", item === p);
        this.app.dispatchEvent(new Event("pane-layout"));
      },
      true,
    );
    this.bind(p);
    this.choices();
    return {
      element: p.root,
      body: p.body,
      header: p.bar,
      setEmpty: (empty: boolean) => {
        if (p.empty === empty) return;
        p.empty = empty;
        paintPane(p, this.app);
      },
      remove: () => {
        this.panes.delete(options.id);
        p.root.remove();
        this.app.dispatchEvent(new Event("pane-layout"));
        this.choices();
      },
    };
  }
  reveal(id: string) {
    const pane = this.panes.get(id);
    if (!pane) return;
    const { state } = pane;
    state.hidden = state.folded = false;
    if (state.place === "floating") this.float(pane);
    else this.columns[state.place].open();
    paintPane(pane, this.app);
    this.save(pane);
    if (state.place !== "floating") {
      const stack = this.columns[state.place].stack;
      stack.scrollTop += pane.root.getBoundingClientRect().top - stack.getBoundingClientRect().top;
    }
    pane.title.focus({ preventScroll: true });
  }
  private mount(p: Pane) {
    const side = p.state.place;
    if (side === "floating") this.float(p);
    else {
      const stack = this.columns[side].stack;
      const next = nextDockPane(p, this.items(side), this.order);
      stack.insertBefore(p.root, next?.root ?? null);
    }
    paintPane(p, this.app);
  }
  private float(p: Pane) {
    for (const item of this.panes.values()) item.root.classList.toggle("front", item === p);
    this.app.append(p.root);
  }
  private items(side: Side) {
    return Array.from(this.columns[side].stack.children, (el) => {
      const pane = this.panes.get((el as HTMLElement).dataset.pane ?? "");
      if (!pane) throw new Error("Unregistered dock child");
      return pane;
    });
  }
  private choices() {
    const options = () =>
      Array.from(this.panes.values(), (p) => new Option(p.options.title, p.options.id));
    for (const p of this.panes.values()) populatePaneMenu(p, options());
    for (const col of Object.values(this.columns))
      col.chooser.replaceChildren(new Option("+ Add pane", ""), ...options());
  }
  private save(p: Pane) {
    if (p.options.persist) p.options.persist({ ...p.state });
    else remember(`item.${p.options.id}`, p.state);
  }
  private dock(p: Pane, place: Place, before?: Element) {
    p.state.place = place;
    if (place === "floating") this.float(p);
    else this.columns[place].stack.insertBefore(p.root, before ?? null);
    const order: string[] = [];
    for (const side of ["left", "right"] as const) {
      const items = this.items(side);
      for (const [i, item] of items.entries()) {
        if (!item.options.persist) {
          order.push(item.options.id);
          continue;
        }
        item.state.rank = i;
        item.state.before = items
          .slice(0, i)
          .reverse()
          .find((q) => !q.options.persist)?.options.id;
        item.state.after = items.slice(i + 1).find((q) => !q.options.persist)?.options.id;
        this.save(item);
      }
    }
    this.order = order;
    remember("order", order);
    this.choices();
    paintPane(p, this.app);
    this.save(p);
  }
  private bind(p: Pane) {
    const { state, title, menu } = p;
    const fold = () => {
      state.folded = !state.folded;
      paintPane(p, this.app);
      this.save(p);
    };
    title.onclick = (e) => {
      if (e.detail === 0) fold();
    };
    menu.onchange = () => {
      const action = menu.value;
      menu.selectedIndex = 0;
      if (action.startsWith("show/") && state.place !== "floating") {
        this.showInDock(action.slice(5), state.place);
        return;
      }
      if (action === "hide" && p.options.close) return p.options.close();
      if (action === "hide") state.hidden = true;
      else if (action === "auto") state.autoHide = !state.autoHide;
      else return this.dock(p, action as Place);
      paintPane(p, this.app);
      this.save(p);
    };
    this.bindMove(p, fold);
    this.bindResize(p);
  }
  private bindMove(p: Pane, fold: () => void) {
    const { root, title, state } = p;
    gesture(title, (down) => {
      const rect = root.getBoundingClientRect();
      const target = (e: PointerEvent) =>
        Object.values(this.columns).find((c) => {
          const r = c.root.getBoundingClientRect();
          return (
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          );
        });
      const ghost = document.createElement("div");
      ghost.className = "pane-drag-label";
      ghost.textContent = p.options.title;
      const clear = () => {
        ghost.remove();
        root.classList.remove("moving");
        this.app.dispatchEvent(new Event("pane-layout"));
        for (const c of Object.values(this.columns)) c.root.classList.remove("drop-target");
      };
      return {
        move: (_dx, _dy, e) => {
          if (!root.classList.contains("moving")) {
            root.classList.add("moving");
            this.app.dispatchEvent(new Event("pane-layout"));
          }
          if (!ghost.isConnected) document.body.append(ghost);
          ghost.style.left = `${e.clientX + 10}px`;
          ghost.style.top = `${e.clientY + 10}px`;
          const hit = target(e);
          for (const c of Object.values(this.columns))
            c.root.classList.toggle("drop-target", hit === c);
        },
        cancel: clear,
        end: (dragged, e) => {
          clear();
          if (!dragged) return fold();
          const hit = target(e);
          if (hit) {
            const { side } = hit;
            hit.open();
            this.fit();
            const next = this.items(side).find((q) => {
              const r = q.root.getBoundingClientRect();
              return q !== p && !q.root.hidden && e.clientY < r.top + r.height / 2;
            });
            this.dock(p, side, next?.root);
          } else {
            const area = this.app.getBoundingClientRect();
            state.x = rect.left - area.left + e.clientX - down.clientX;
            state.y = rect.top - area.top + e.clientY - down.clientY;
            this.dock(p, "floating");
          }
        },
      };
    });
  }
  private bindResize(p: Pane) {
    const { root, grip, state } = p;
    gesture(grip, () => {
      const { width, height } = root.getBoundingClientRect();
      const docked =
        state.place === "floating"
          ? []
          : this.items(state.place).filter((q) => !q.root.hidden && !q.state.folded);
      const neighbor = docked[docked.indexOf(p) + 1];
      const stack = state.place === "floating" ? null : this.columns[state.place].stack;
      const visible =
        stack && Array.from(stack.children).filter((el) => !(el as HTMLElement).hidden);
      const last = visible?.at(-1);
      const slack =
        stack && last
          ? Math.max(
              0,
              stack.getBoundingClientRect().bottom -
                last.getBoundingClientRect().bottom -
                stack.scrollTop,
            )
          : 0;
      const sizes = docked.map((q) => q.root.getBoundingClientRect().height);
      const neighborHeight = neighbor?.root.getBoundingClientRect().height ?? 0;
      const minimum = (q: Pane) => parseFloat(getComputedStyle(q.root).minHeight) || 72;
      return {
        move: (dx, dy) => {
          if (neighbor) {
            // Freeze the current flex allocation before transferring space across this divider.
            docked.forEach((q, i) => {
              q.state.height = sizes[i];
            });
            const delta = Math.max(
              minimum(p) - height,
              Math.min(slack + neighborHeight - minimum(neighbor), dy),
            );
            state.height = height + delta;
            neighbor.state.height =
              neighborHeight - (delta > 0 ? Math.max(0, delta - slack) : delta);
            for (const q of docked) paintPane(q, this.app);
          } else state.height = Math.max(minimum(p), Math.min(this.app.clientHeight, height + dy));
          if (state.place === "floating") state.width = Math.max(186, width + dx);
          paintPane(p, this.app);
        },
        end: (dragged) => {
          if (dragged) for (const q of neighbor ? docked : [p]) this.save(q);
        },
      };
    });
    grip.onkeydown = (e) => {
      if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      state.height = Math.max(
        parseFloat(getComputedStyle(root).minHeight) || 72,
        root.offsetHeight + (e.key === "ArrowUp" ? -16 : 16),
      );
      paintPane(p, this.app);
      this.save(p);
    };
  }
  dispose() {
    this.observer.disconnect();
    for (const p of this.panes.values()) p.root.remove();
    for (const c of Object.values(this.columns)) c.dispose();
  }
}
