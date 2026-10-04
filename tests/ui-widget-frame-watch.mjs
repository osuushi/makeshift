export async function watchWidgetFrames(page, selector) {
  await page.evaluate((selector) => {
    const state = { active: true, samples: 0, failures: [] };
    window.widgetFrameWatch = state;
    const sample = () => {
      if (!state.active) return;
      const canvas = document.querySelector("#world canvas").getBoundingClientRect();
      state.samples++;
      for (const element of document.querySelectorAll(selector)) {
        const r = element.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const controls = element.matches("button,input,select")
          ? [element]
          : [...element.querySelectorAll("button,input,select")].filter((control) => {
              const r = control.getBoundingClientRect();
              return r.width && r.height;
            });
        const occluded = controls.some((control) => {
          const r = control.getBoundingClientRect();
          return !control.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        });
        if (
          (occluded ||
            r.left < canvas.left + 7.9 ||
            r.top < canvas.top + 7.9 ||
            r.right > canvas.right - 7.9 ||
            r.bottom > canvas.bottom - 7.9) &&
          state.failures.length < 5
        )
          state.failures.push({
            occluded,
            name: element.getAttribute("aria-label") || element.tagName,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            cover: document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.outerHTML.slice(0, 200),
            plans: [...document.querySelectorAll(".body-axis-handle, .transform-box-handle")]
              .filter((e) => e.getBoundingClientRect().width)
              .map((e) => {
                const b = e.getBoundingClientRect();
                return {
                  name: e.getAttribute("aria-label"),
                  x: b.x,
                  y: b.y,
                  width: b.width,
                  height: b.height,
                  actual: getComputedStyle(e).translate,
                  target: e.style.translate,
                };
              }),
          });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, selector);
}

export async function watchWidgetGesture(page, start, delta) {
  await page.evaluate(
    ({ start, delta }) => {
      window.widgetGestureTrace = [];
      for (const type of ["pointerdown", "pointerup"])
        window.addEventListener(
          type,
          (event) => {
            const state = window.makeshiftInspect();
            window.widgetGestureTrace.push({
              type,
              requested:
                type === "pointerdown" ? start : { x: start.x + delta.x, y: start.y + delta.y },
              x: event.clientX,
              y: event.clientY,
              interaction: state.interaction,
              busy: state.busy,
              tool: state.tool,
              moveMode: state.moveMode,
              shift: event.shiftKey,
              grid: state.gridSnap,
              hover: state.hover,
              camera: state.camera,
              selection: state.selectionTargets,
              fields: [...document.querySelectorAll(".dimension input")].map((input) => ({
                label: input.getAttribute("aria-label"),
                value: input.value,
              })),
              markers: [...document.querySelectorAll("[data-move-marker]")].map((element) => {
                const svg = element.querySelector("svg"),
                  r = svg.getBoundingClientRect();
                const matrix = svg.getScreenCTM(),
                  box = svg.viewBox.baseVal;
                const corners = [
                  [box.x, box.y],
                  [box.x + box.width, box.y],
                  [box.x, box.y + box.height],
                  [box.x + box.width, box.y + box.height],
                ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
                const viewport = {
                  left: Math.min(...corners.map((p) => p.x)),
                  right: Math.max(...corners.map((p) => p.x)),
                  top: Math.min(...corners.map((p) => p.y)),
                  bottom: Math.max(...corners.map((p) => p.y)),
                };
                return {
                  viewport,
                  key: element.dataset.moveMarker,
                  ...element.dataset,
                  center: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
                };
              }),
            });
          },
          { once: true, capture: true },
        );
    },
    { start, delta },
  );
}
