/** Passive, page-local evidence for the original selection inputs; never changes a route. */
function installRecorder() {
  if (window.makeshiftUiPickTrace) return;
  const records = [];
  Object.defineProperty(window, "makeshiftUiPickTrace", { value: records });
  const describe = (element) =>
    element instanceof Element
      ? {
          tag: element.tagName,
          label: element.getAttribute("aria-label"),
          command: element.getAttribute("data-command"),
          classes: element.getAttribute("class"),
          rect: element.getBoundingClientRect().toJSON(),
        }
      : null;
  const snapshot = (event, phase) => {
    try {
      const state = window.makeshiftInspect?.();
      if (!state) return;
      const pointer = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null;
      records.push(
        structuredClone({
          phase,
          type: event.type,
          trusted: event.isTrusted,
          time: performance.now(),
          pageTimeOrigin: performance.timeOrigin,
          key: event instanceof KeyboardEvent ? event.key : null,
          pointer,
          modifiers: {
            meta: event.metaKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
          },
          target: describe(event.target),
          hitTarget: pointer ? describe(document.elementFromPoint(pointer.x, pointer.y)) : null,
          focused: describe(document.activeElement),
          tool: state.tool,
          busy: state.busy,
          solving: state.solving,
          interaction: state.interaction,
          activePlane: state.activePlane,
          activeSketch: state.activeSketch,
          camera: state.camera,
          projection: state.projection,
          viewport: describe(document.querySelector('[aria-label="Modeling viewport"]')),
          clipping: state.clipping,
          selection: state.modelingSelection,
          curveSelection: state.selectionTargets,
          sketches: state.document.sketches.map(({ id, plane, curves, groups }) => ({
            id,
            plane: { origin: plane.origin, u: plane.u, v: plane.v },
            curves,
            groups,
          })),
        }),
      );
    } catch (error) {
      records.push({ phase, type: event.type, diagnosticError: String(error) });
    }
    if (records.length > 24) records.shift();
  };
  const record = (event) => {
    if (event instanceof KeyboardEvent && !["r", "l"].includes(event.key.toLowerCase())) return;
    snapshot(event, "capture");
    requestAnimationFrame(() => snapshot(event, "frame"));
  };
  for (const type of ["pointerdown", "pointerup", "click", "keydown"])
    window.addEventListener(type, record, { capture: true });
}

export async function installProfilePickTrace(page) {
  await page.addInitScript(installRecorder);
  await page.evaluate(installRecorder);
}
