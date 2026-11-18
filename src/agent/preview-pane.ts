import type { Placement } from "../panes/layout.js";
import type { WorkspacePanes } from "../panes/workspace.js";
import type { PreviewLayout } from "./preview-protocol.js";

interface PreviewEvent {
  id: string;
  title: string | null;
  saved?: unknown;
}
declare global {
  interface Window {
    makeshiftPreview?: {
      layout(id: string, value: PreviewLayout | null): Promise<string | undefined>;
      save(id: string, state: Placement): Promise<void>;
      subscribe(callback: (event: PreviewEvent) => void): () => void;
    };
  }
}

/** Native views always composite above HTML. Keep an image underneath overlapping panes. */
function covered(pane: HTMLElement, rect: PreviewLayout, floats: HTMLElement[]) {
  for (const other of floats) {
    if (other === pane) continue;
    const bounds = other.getBoundingClientRect();
    const left = Math.max(rect.x, bounds.left),
      right = Math.min(rect.x + rect.width, bounds.right);
    const top = Math.max(rect.y, bounds.top),
      bottom = Math.min(rect.y + rect.height, bounds.bottom);
    if (left >= right || top >= bottom) continue;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    if (hit && !pane.contains(hit)) return true;
  }
  return false;
}

/** Native child views need screen bounds even when a sibling moves without resizing them. */
export function installPreviewPane(panes: WorkspacePanes): () => void {
  const host = window.makeshiftPreview;
  if (!host) return () => {};
  const active = new Map<
    string,
    { pane: ReturnType<WorkspacePanes["register"]>; previous: string; covered: boolean }
  >();
  let frame = 0;
  const sync = () => {
    frame = 0;
    const floats = Array.from(
      panes.app.querySelectorAll<HTMLElement>(".workspace-pane.floating:not([hidden])"),
    );
    for (const [id, item] of active) {
      const rect = item.pane.body.getBoundingClientRect();
      const stack = item.pane.element.closest(".pane-stack")?.getBoundingClientRect();
      const layout: PreviewLayout = {
        x: rect.x,
        y: Math.max(rect.y, stack?.top ?? rect.y),
        width: rect.width,
        height: Math.max(
          0,
          Math.min(rect.bottom, stack?.bottom ?? rect.bottom) -
            Math.max(rect.top, stack?.top ?? rect.top),
        ),
        collapsed: false,
      };
      layout.collapsed =
        layout.width < 1 || layout.height < 1 || item.pane.element.classList.contains("moving");
      layout.covered = !layout.collapsed && covered(item.pane.element, layout, floats);
      const signature = JSON.stringify(layout);
      if (signature !== item.previous) {
        item.previous = signature;
        item.covered = !!layout.covered;
        if (!layout.covered) item.pane.body.style.backgroundImage = "";
        void host
          .layout(id, layout)
          .then((image) => {
            if (image && item.covered) item.pane.body.style.backgroundImage = `url("${image}")`;
          })
          .catch(console.error);
      }
    }
  };
  const schedule = () => {
    if (active.size && !frame) frame = requestAnimationFrame(sync);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(panes.app);
  const abort = new AbortController();
  panes.app.addEventListener("pane-layout", schedule, { signal: abort.signal });
  window.addEventListener("scroll", schedule, { capture: true, signal: abort.signal });
  const unsubscribe = host.subscribe(({ id, title, saved }) => {
    const old = active.get(id);
    if (old) {
      observer.unobserve(old.pane.body);
      old.pane.remove();
    }
    active.delete(id);
    if (title === null) return;
    const close = () => void host.layout(id, null).catch(console.error);
    const pane = panes.register({
      id: `preview/${id}`,
      title,
      place: "floating",
      height: 518,
      width: 642,
      saved: saved ?? { x: 24 + 24 * (active.size % 8), y: 64 + 24 * (active.size % 8) },
      persist: (state) => void host.save(id, state).catch(console.error),
      close,
    });
    pane.element.classList.add("preview-pane");
    pane.header.classList.add("preview-header");
    active.set(id, { pane, previous: "", covered: false });
    observer.observe(pane.body);
    schedule();
  });
  return () => {
    unsubscribe();
    observer.disconnect();
    abort.abort();
    cancelAnimationFrame(frame);
    for (const item of active.values()) item.pane.remove();
    active.clear();
  };
}
