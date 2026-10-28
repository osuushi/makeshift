import type { PreviewLayout } from "./preview-protocol.js";
import "./preview-pane.css";

declare global {
  interface Window {
    makeshiftPreview?: {
      layout(value: PreviewLayout | null): Promise<void>;
      subscribe(callback: (title: string | null) => void): () => void;
    };
  }
}

export function installPreviewPane(): () => void {
  const host = window.makeshiftPreview;
  if (!host) return () => {};
  const pane = document.createElement("section");
  pane.className = "preview-pane";
  pane.hidden = true;
  pane.setAttribute("aria-label", "Interactive preview");
  pane.innerHTML = `<header><strong></strong><button aria-label="Collapse preview">−</button><button aria-label="Close preview">×</button></header><div class="preview-content"></div>`;
  document.body.append(pane);
  const header = pane.querySelector("header");
  const content = pane.querySelector<HTMLElement>(".preview-content");
  const titleElement = pane.querySelector("strong");
  if (!header || !content || !titleElement) throw new Error("Missing preview controls.");
  const [collapse, close] = pane.querySelectorAll("button");
  let collapsed = false;
  let size = { width: 640, height: 480 };
  const sync = () => {
    if (pane.hidden) return;
    const rect = content.getBoundingClientRect();
    if (!collapsed) size = { width: rect.width, height: rect.height };
    void host.layout({ x: rect.x, y: rect.y, ...size, collapsed }).catch(console.error);
  };
  const observer = new ResizeObserver(sync);
  observer.observe(pane);
  const unsubscribe = host.subscribe((title) => {
    pane.hidden = title === null;
    if (title === null) return;
    titleElement.textContent = title;
    collapsed = false;
    pane.classList.remove("collapsed");
    pane.style.width = "640px";
    pane.style.height = "524px";
    collapse.textContent = "−";
    collapse.setAttribute("aria-label", "Collapse preview");
    sync();
  });
  collapse.onclick = () => {
    collapsed = !collapsed;
    pane.classList.toggle("collapsed", collapsed);
    pane.style.height = collapsed ? "36px" : `${size.height + 44}px`;
    collapse.textContent = collapsed ? "+" : "−";
    collapse.setAttribute("aria-label", collapsed ? "Expand preview" : "Collapse preview");
    sync();
  };
  close.onclick = () => {
    pane.hidden = true;
    void host.layout(null).catch(console.error);
  };
  header.onpointerdown = (event) => {
    if ((event.target as Element).closest("button")) return;
    const rect = pane.getBoundingClientRect();
    const dx = event.clientX - rect.x,
      dy = event.clientY - rect.y;
    header.setPointerCapture(event.pointerId);
    header.onpointermove = (move) => {
      pane.style.left = `${Math.max(0, Math.min(innerWidth - 100, move.clientX - dx))}px`;
      pane.style.top = `${Math.max(0, Math.min(innerHeight - 36, move.clientY - dy))}px`;
      sync();
    };
    header.onpointerup = header.onpointercancel = () => {
      header.onpointermove = null;
    };
  };
  pane.addEventListener("keydown", (event) => event.stopPropagation());
  window.addEventListener("resize", sync);
  return () => {
    unsubscribe();
    observer.disconnect();
    window.removeEventListener("resize", sync);
    pane.remove();
  };
}
