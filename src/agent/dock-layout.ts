export function dockLayout(panel: HTMLElement, app: HTMLElement) {
  app.classList.add("agent-open");
  let side = localStorage.getItem("freac.agent.side") === "bottom" ? "bottom" : "right";
  let size = Number(localStorage.getItem("freac.agent.size")) || 440;
  let collapsed = true;
  const splitter = document.createElement("div");
  splitter.className = "agent-splitter";
  splitter.tabIndex = 0;
  splitter.setAttribute("role", "separator");
  splitter.setAttribute("aria-label", "Resize agent pane");
  panel.append(splitter);
  const viewport = window.makeshiftRemote ? window.visualViewport : null;
  const apply = () => {
    const { width, height } = fitVisibleViewport(panel, viewport);
    const available = side === "right" ? width : height;
    size = Math.max(200, Math.min(size, available * 0.65));
    panel.dataset.side = side;
    panel.classList.toggle("collapsed", collapsed);
    panel.style.setProperty("--agent-size", `${size}px`);
    app.style.right = side === "right" ? `${collapsed ? 42 : size}px` : "0px";
    app.style.bottom = side === "bottom" ? `${collapsed ? 42 : size}px` : "0px";
    splitter.setAttribute("aria-orientation", side === "right" ? "vertical" : "horizontal");
    splitter.setAttribute("aria-valuenow", String(Math.round(size)));
  };
  const persist = () => {
    localStorage.setItem("freac.agent.side", side);
    localStorage.setItem("freac.agent.size", String(size));
  };
  splitter.onpointerdown = (event) => {
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
  };
  splitter.onpointermove = (event) => {
    if (!splitter.hasPointerCapture(event.pointerId)) return;
    const right = viewport ? viewport.offsetLeft + viewport.width : innerWidth;
    const bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
    size = side === "right" ? right - event.clientX : bottom - event.clientY;
    apply();
  };
  splitter.onpointerup = (event) => {
    splitter.releasePointerCapture(event.pointerId);
    persist();
  };
  splitter.onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    size += ["ArrowLeft", "ArrowUp"].includes(event.key) ? 20 : -20;
    apply();
    persist();
  };
  window.addEventListener("resize", apply);
  viewport?.addEventListener("resize", apply);
  viewport?.addEventListener("scroll", apply);
  apply();
  return {
    toggleSide() {
      side = side === "right" ? "bottom" : "right";
      apply();
      persist();
    },
    collapse(value: boolean) {
      collapsed = value;
      apply();
    },
    dispose() {
      app.classList.remove("agent-open");
      window.removeEventListener("resize", apply);
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      app.style.right = app.style.bottom = "0px";
    },
  };
}

function fitVisibleViewport(panel: HTMLElement, viewport: VisualViewport | null) {
  const width = viewport?.width ?? innerWidth;
  const height = viewport?.height ?? innerHeight;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  panel.style.setProperty("--agent-viewport-top", `${top}px`);
  panel.style.setProperty("--agent-viewport-left", `${left}px`);
  panel.style.setProperty("--agent-viewport-right", `${innerWidth - left - width}px`);
  panel.style.setProperty("--agent-viewport-bottom", `${innerHeight - top - height}px`);
  return { width, height };
}
