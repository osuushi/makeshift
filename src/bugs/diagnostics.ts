import type { BugTimeline } from "./timeline.js";

export function bugDiagnostics(timeline: BugTimeline, enabled: () => boolean): () => void {
  const abort = new AbortController();
  const options = { capture: true, signal: abort.signal };
  const record = (kind: string, detail: Record<string, unknown>) => {
    if (enabled()) timeline.add(kind, detail);
  };
  for (const kind of ["pointerdown", "pointerup", "pointercancel"] as const)
    window.addEventListener(
      kind,
      (event) =>
        record(kind, {
          ...target(event),
          x: event.clientX,
          y: event.clientY,
          button: event.button,
          pointer: event.pointerType,
          shift: event.shiftKey,
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        }),
      options,
    );
  let motion = 0;
  window.addEventListener(
    "pointermove",
    (event) => {
      if (Date.now() - motion < 100) return;
      motion = Date.now();
      record("pointermove", { x: event.clientX, y: event.clientY, buttons: event.buttons });
    },
    options,
  );
  let wheel = 0;
  window.addEventListener(
    "wheel",
    (event) => {
      if (Date.now() - wheel < 100) return;
      wheel = Date.now();
      record("wheel", {
        x: event.clientX,
        y: event.clientY,
        dx: event.deltaX,
        dy: event.deltaY,
        mode: event.deltaMode,
        ctrl: event.ctrlKey,
      });
    },
    { ...options, passive: true },
  );
  for (const kind of ["keydown", "keyup"] as const)
    window.addEventListener(
      kind,
      (event) => {
        const privateField =
          event.target instanceof Element &&
          event.target.closest('input[type="password"], .agent-dock');
        record(kind, {
          ...target(event),
          key: privateField ? "[redacted]" : event.key,
          code: privateField ? undefined : event.code,
          repeat: event.repeat,
          shift: event.shiftKey,
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        });
      },
      options,
    );
  window.addEventListener(
    "error",
    (event) =>
      record("error", { message: event.message, file: event.filename, line: event.lineno }),
    options,
  );
  window.addEventListener(
    "unhandledrejection",
    (event) => record("unhandledrejection", { message: String(event.reason) }),
    options,
  );
  for (const kind of ["focus", "blur", "resize"])
    window.addEventListener(
      kind,
      () => record(kind, { width: innerWidth, height: innerHeight, scale: devicePixelRatio }),
      options,
    );
  return () => abort.abort();
}

function target(event: Event) {
  const node = event.target instanceof Element ? event.target : null;
  return { tag: node?.tagName, id: node?.id, label: node?.getAttribute("aria-label") };
}
