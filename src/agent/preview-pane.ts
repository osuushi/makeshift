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

const icon = (path: string) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="${path}"/></svg>`;

export function installPreviewPane(): () => void {
  const host = window.makeshiftPreview;
  if (!host) return () => {};
  const pane = document.createElement("section");
  pane.className = "preview-pane";
  pane.hidden = true;
  pane.setAttribute("aria-label", "Interactive preview");
  pane.innerHTML = `<div class="preview-header"><strong></strong><button aria-label="Collapse preview">${icon("M5 12h14")}</button><button aria-label="Close preview">${icon("m6 6 12 12M6 18 18 6")}</button></div><div class="preview-content"></div>`;
  document.body.append(pane);
  const header = pane.querySelector<HTMLElement>(".preview-header");
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
    collapse.innerHTML = icon("M5 12h14");
    collapse.setAttribute("aria-label", "Collapse preview");
    sync();
  });
  collapse.onclick = () => {
    collapsed = !collapsed;
    pane.classList.toggle("collapsed", collapsed);
    pane.style.height = collapsed ? "36px" : `${size.height + 44}px`;
    collapse.innerHTML = icon(collapsed ? "M5 12h14M12 5v14" : "M5 12h14");
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
