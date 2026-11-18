import type { DockColumn } from "./column.js";
import { gesture } from "./gesture.js";
import type { Place, Side } from "./layout.js";
import type { Pane } from "./pane.js";

function contains(rect: DOMRect, event: PointerEvent) {
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function slot(column: DockColumn, panes: Pane[], moving: Pane, event: PointerEvent) {
  const available = panes.filter((pane) => pane !== moving && !pane.root.hidden);
  const next = available.find(({ root }) => {
    const rect = root.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });
  const stack = column.stack.getBoundingClientRect();
  const y =
    next?.root.getBoundingClientRect().top ??
    available.at(-1)?.root.getBoundingClientRect().bottom ??
    stack.top;
  return { before: next?.root, y: Math.min(stack.bottom - 2, Math.max(stack.top + 2, y)) };
}

export function bindPaneDrag(
  app: HTMLElement,
  pane: Pane,
  columns: Record<Side, DockColumn>,
  items: (side: Side) => Pane[],
  fold: () => void,
  dock: (place: Place, before?: Element) => void,
) {
  const docks = Object.values(columns);
  const { root, title, state } = pane;
  gesture(title, (down) => {
    const rect = root.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "pane-drag-label";
    ghost.textContent = pane.options.title;
    const marker = document.createElement("div");
    marker.className = "pane-drop-marker";
    const target = (event: PointerEvent) => {
      for (const column of docks) {
        const tab = column.root.classList.contains("closed")
          ? (column.root.querySelector(".pane-tab") ?? column.root)
          : column.root;
        const bounds = tab.getBoundingClientRect();
        if (contains(bounds, event)) return { column, bounds, closed: tab !== column.root };
      }
      return null;
    };
    const clear = () => {
      ghost.remove();
      marker.remove();
      root.classList.remove("moving");
      for (const column of docks) column.root.classList.remove("pane-drop-available");
      app.dispatchEvent(new Event("pane-layout"));
    };
    return {
      move: (_dx, _dy, event) => {
        if (!ghost.isConnected) {
          root.classList.add("moving");
          document.body.append(ghost, marker);
          for (const column of docks) column.root.classList.add("pane-drop-available");
          app.dispatchEvent(new Event("pane-layout"));
        }
        ghost.style.left = `${event.clientX + 10}px`;
        ghost.style.top = `${event.clientY + 10}px`;
        const hit = target(event);
        marker.hidden = !hit;
        if (!hit) return;
        const { column, bounds, closed } = hit;
        const y = closed
          ? bounds.top + bounds.height / 2
          : slot(column, items(column.side), pane, event).y;
        marker.classList.toggle("tab", closed);
        marker.style.left = `${bounds.left + (closed ? 1 : 3)}px`;
        marker.style.width = `${bounds.width - (closed ? 2 : 6)}px`;
        marker.style.top = `${closed ? bounds.top + 1 : y - 2}px`;
        marker.style.height = `${closed ? bounds.height - 2 : 4}px`;
      },
      cancel: clear,
      end: (dragged, event) => {
        const hit = target(event);
        clear();
        if (!dragged) return fold();
        if (hit) {
          const { column, closed } = hit;
          const before = closed ? undefined : slot(column, items(column.side), pane, event).before;
          column.open();
          dock(column.side, before);
        } else {
          const area = app.getBoundingClientRect();
          state.x = rect.left - area.left + event.clientX - down.clientX;
          state.y = rect.top - area.top + event.clientY - down.clientY;
          dock("floating");
        }
      },
    };
  });
}
