export function installPlanarHoverExercise() {
  window.exercisePlanarHover = (first) => {
    const { origin, editor, refresh, snapshot } = window.planarLayoutFixture;
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: first.screen.x, clientY: first.screen.y }),
    );
    origin.x += 3;
    refresh();
    const safeHovered = snapshot(),
      safeHoverFootprint = window.measurePlanarFootprint();
    origin.x -= 13;
    refresh();
    const hovered = snapshot(),
      hoverFootprint = window.measurePlanarFootprint();
    window.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: hovered.screen.x, clientY: hovered.screen.y }),
    );
    document.documentElement.dispatchEvent(new PointerEvent("pointerleave"));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 800, clientY: 600 }));
    origin.x -= 100;
    refresh();
    const pressed = snapshot();
    editor.isDragging = true;
    window.dispatchEvent(new PointerEvent("pointerup"));
    refresh();
    const dragging = snapshot();
    editor.isDragging = false;
    refresh();
    const released = snapshot(),
      releasedFootprint = window.measurePlanarFootprint(),
      rotationFootprint = window.measurePlanarFootprint("rotation");
    return {
      safeHovered,
      safeHoverFootprint,
      hovered,
      hoverFootprint,
      pressed,
      dragging,
      released,
      releasedFootprint,
      rotationFootprint,
    };
  };
}

export function installPlanarFootprint() {
  window.measurePlanarFootprint = (key = "x") => {
    const { root, editor, sketchWidgetTarget } = window.planarLayoutFixture;
    const svg = root.querySelector(`[data-move-marker="${key}"] > svg`),
      matrix = svg.getScreenCTM(),
      box = svg.viewBox.baseVal;
    const a = new DOMPoint(box.x, box.y).matrixTransform(matrix),
      b = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
    const rect = {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x),
      bottom: Math.max(a.y, b.y),
    };
    const viewport = editor.world.canvas.getBoundingClientRect(),
      target = sketchWidgetTarget(editor, key);
    const siblings = [...root.querySelectorAll("[data-move-marker] > svg")]
      .filter((other) => other !== svg)
      .map((other) => {
        const m = other.getScreenCTM(),
          b = other.viewBox.baseVal;
        const a = new DOMPoint(b.x, b.y).matrixTransform(m),
          z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
        return { left: a.x, right: z.x, top: a.y, bottom: z.y };
      });
    const obstacles = [
      ...document.querySelectorAll(
        "header,.entity-viewer,.scale-widget .transform-box-handle,.scale-widget .scale-card",
      ),
    ]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width && r.height);
    return {
      rect,
      viewportSafe:
        rect.left >= viewport.left + 8 &&
        rect.top >= viewport.top + 8 &&
        rect.right <= viewport.right - 8 &&
        rect.bottom <= viewport.bottom - 8,
      obstaclesClear: [...obstacles, ...siblings].every(
        (other) =>
          rect.right + 6 <= other.left ||
          other.right + 6 <= rect.left ||
          rect.bottom + 6 <= other.top ||
          other.bottom + 6 <= rect.top,
      ),
      mapMatches:
        Math.hypot((a.x + b.x) / 2 - target.screen.x, (a.y + b.y) / 2 - target.screen.y) < 1e-4,
      radius: target.radius,
      point: target.point,
    };
  };
}
