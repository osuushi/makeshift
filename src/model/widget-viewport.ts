export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectsOverlap(a: WidgetRect, b: WidgetRect, gap = 6): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap
  );
}

/** Preserve a nominal position when possible, otherwise choose the nearest free contact. */
export function fitWidgets(
  targets: readonly WidgetRect[],
  obstacles: readonly WidgetRect[],
  viewport: WidgetRect,
): (WidgetRect & { limited?: true })[] {
  const placed = [...obstacles];
  return targets.map((target) => {
    if (target.width + 0.02 > viewport.width || target.height + 0.02 > viewport.height) {
      const result = { ...target, x: viewport.x, y: viewport.y, limited: true as const };
      placed.push(result);
      return result;
    }
    const left = viewport.x - viewport.width / 2 + target.width / 2 + 0.01;
    const right = viewport.x + viewport.width / 2 - target.width / 2 - 0.01;
    const top = viewport.y - viewport.height / 2 + target.height / 2 + 0.01;
    const bottom = viewport.y + viewport.height / 2 - target.height / 2 - 0.01;
    const x = Math.max(left, Math.min(right, target.x));
    const y = Math.max(top, Math.min(bottom, target.y));
    const xs = [x, left, right],
      ys = [y, top, bottom];
    for (const other of placed) {
      xs.push(
        other.x - (target.width + other.width) / 2 - 6.01,
        other.x + (target.width + other.width) / 2 + 6.01,
      );
      ys.push(
        other.y - (target.height + other.height) / 2 - 6.01,
        other.y + (target.height + other.height) / 2 + 6.01,
      );
    }
    const candidates = xs
      .filter((v) => v >= left && v <= right)
      .flatMap((x) => ys.filter((v) => v >= top && v <= bottom).map((y) => ({ ...target, x, y })));
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
    );
    const best = candidates.find(
      (candidate) => !placed.some((other) => rectsOverlap(candidate, other)),
    );
    // Very small viewports may not fit every control. Keep the target in view;
    // tool numeric cards remain scrollable rather than disappearing offscreen.
    const result = best ?? { ...target, x, y, limited: true as const };
    placed.push(result);
    return result;
  });
}

/** Newly revealed or disclosed controls yield to currently frozen hit footprints. */
export function fitFrozenWidgets(
  desired: WidgetRect[],
  current: WidgetRect[],
  held: boolean[],
  obstacles: WidgetRect[],
  viewport: WidgetRect,
): ReturnType<typeof fitWidgets> {
  const reserved = current.filter((_, i) => held[i]);
  const movable = fitWidgets(
    desired.filter((_, i) => !held[i]),
    [...obstacles, ...reserved],
    viewport,
  );
  let next = 0;
  return current.map((rect, i) => {
    if (!held[i]) return movable[next++];
    const clear = widgetRectClear(
      rect,
      [...obstacles, ...reserved.filter((other) => other !== rect)],
      viewport,
    );
    return clear ? rect : { ...rect, limited: true as const };
  });
}

export function widgetRectClear(
  rect: WidgetRect,
  obstacles: WidgetRect[],
  viewport: WidgetRect,
): boolean {
  return (
    rect.x - rect.width / 2 >= viewport.x - viewport.width / 2 &&
    rect.x + rect.width / 2 <= viewport.x + viewport.width / 2 &&
    rect.y - rect.height / 2 >= viewport.y - viewport.height / 2 &&
    rect.y + rect.height / 2 <= viewport.y + viewport.height / 2 &&
    !obstacles.some((other) => rectsOverlap(rect, other))
  );
}

/** A scrollable card may use an unobstructed strip when its full footprint cannot fit. */
export function freeCardSpace(
  target: WidgetRect,
  obstacles: WidgetRect[],
  viewport: WidgetRect,
): WidgetRect | null {
  const left = viewport.x - viewport.width / 2,
    right = viewport.x + viewport.width / 2;
  const top = viewport.y - viewport.height / 2,
    bottom = viewport.y + viewport.height / 2;
  const ys = [
    ...new Set([
      top,
      bottom,
      ...obstacles.flatMap((r) => [r.y - r.height / 2 - 6, r.y + r.height / 2 + 6]),
    ]),
  ]
    .filter((y) => y >= top && y <= bottom)
    .sort((a, b) => a - b);
  let best: WidgetRect | null = null;
  for (let i = 0; i < ys.length; i++)
    for (let j = i + 1; j < ys.length; j++) {
      if (ys[j] - ys[i] < 32) continue;
      const blocked = obstacles
        .filter((r) => r.y + r.height / 2 + 6 > ys[i] && r.y - r.height / 2 - 6 < ys[j])
        .map((r) => [Math.max(left, r.x - r.width / 2 - 6), Math.min(right, r.x + r.width / 2 + 6)])
        .filter(([a, b]) => a < b)
        .sort((a, b) => a[0] - b[0]);
      let cursor = left;
      const gaps: number[][] = [];
      for (const [a, b] of blocked) {
        if (a > cursor) gaps.push([cursor, a]);
        cursor = Math.max(cursor, b);
      }
      if (cursor < right) gaps.push([cursor, right]);
      for (const [a, b] of gaps) {
        const width = Math.min(target.width, b - a),
          height = Math.min(target.height, ys[j] - ys[i]);
        if (width < 64 || height < 32) continue;
        const candidate = {
          width,
          height,
          x: Math.max(a + width / 2, Math.min(b - width / 2, target.x)),
          y: Math.max(ys[i] + height / 2, Math.min(ys[j] - height / 2, target.y)),
        };
        const area = width * height,
          distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
        if (
          !best ||
          area > best.width * best.height ||
          (area === best.width * best.height &&
            distance < Math.hypot(best.x - target.x, best.y - target.y))
        )
          best = candidate;
      }
    }
  return best;
}

export function measuredRect(element: Element): WidgetRect {
  const r = element.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
}

/** Include a rotation silhouette which deliberately extends beyond its smaller hit rectangle. */
export function measuredControlRect(element: HTMLElement): WidgetRect {
  const rects = [element.getBoundingClientRect()];
  if (element.matches("button")) {
    const glyph = element.querySelector("svg")?.getBoundingClientRect();
    if (glyph?.width && glyph.height) rects.push(glyph);
  }
  // A visible-overflow card is one assembly with its interactive descendants.
  // WebKit can shrink the flex parent below a minimum-width child's footprint.
  // Scroll/clipped cards instead reserve their viewport, not hidden scroll content.
  const style = getComputedStyle(element);
  if (style.overflowX === "visible" && style.overflowY === "visible")
    for (const control of element.querySelectorAll(
      ".extrude-targets, button, input, select, button svg",
    )) {
      const rect = control.getBoundingClientRect();
      if (rect.width && rect.height) rects.push(rect);
    }
  const left = Math.min(...rects.map((r) => r.left)),
    right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top)),
    bottom = Math.max(...rects.map((r) => r.bottom));
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

export function widgetViewport(root: HTMLElement): {
  viewport: WidgetRect;
  obstacles: WidgetRect[];
} {
  const canvas =
    root.ownerDocument.querySelector("#world canvas") ?? root.ownerDocument.querySelector("canvas");
  const r = canvas?.getBoundingClientRect() ?? {
    x: 0,
    y: 0,
    width: innerWidth,
    height: innerHeight,
  };
  const viewport = {
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
    width: Math.max(0, r.width - 16),
    height: Math.max(0, r.height - 16),
  };
  const chrome =
    "header, .tools-trigger, .entity-viewer, .orientation-cube, .exit-isolation, .agent-dock, .agent-toggle, .workspace-footer, .selection-readouts, .calculation-progress, [data-modal-plane]";
  const controls = ".body-axis-handle, .move-control, .pivot-control, .move-anchor";
  const scale = root.classList.contains("scale-widget");
  const selector = scale ? `${chrome}, ${controls}` : chrome;
  const obstacles = [...root.ownerDocument.querySelectorAll(selector)]
    .filter((element) => !root.contains(element))
    .map((element) =>
      scale && element instanceof HTMLElement && element.matches(controls)
        ? measuredTransportRect(element)
        : measuredRect(element),
    )
    .filter((rect) => rect.width && rect.height);
  return { viewport, obstacles };
}

/** Reserve the full body-priority corridor while its CSS correction is animating. */
function measuredTransportRect(element: HTMLElement): WidgetRect {
  const current = measuredControlRect(element),
    actual = widgetPointerOffset(element);
  const target = element.style.translate.split(" ").map(Number.parseFloat);
  return widgetSweptRect(current, {
    ...current,
    x: current.x + (target[0] || 0) - actual.x,
    y: current.y + (target[1] || 0) - actual.y,
  });
}

export function widgetSweptRect(current: WidgetRect, desired: WidgetRect): WidgetRect {
  const left = Math.min(current.x - current.width / 2, desired.x - desired.width / 2);
  const right = Math.max(current.x + current.width / 2, desired.x + desired.width / 2);
  const top = Math.min(current.y - current.height / 2, desired.y - desired.height / 2);
  const bottom = Math.max(current.y + current.height / 2, desired.y + desired.height / 2);
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

/** Frozen at press: a docked control still addresses its original projected plane. */
export function widgetPointerOffset(target: EventTarget | null): { x: number; y: number } {
  if (!(target instanceof HTMLElement)) return { x: 0, y: 0 };
  const values = getComputedStyle(target).translate.split(" ").map(Number.parseFloat);
  return { x: values[0] || 0, y: values[1] || 0 };
}

/** Animate only when the complete swept footprints remain reachable and clear. */
export function widgetPathsSafe(
  current: WidgetRect[],
  desired: WidgetRect[],
  obstacles: WidgetRect[],
  viewport: WidgetRect,
): boolean {
  const paths = current.map((rect, i) => widgetSweptRect(rect, desired[i]));
  return paths.every(
    (path, i) =>
      path.x - path.width / 2 >= viewport.x - viewport.width / 2 &&
      path.x + path.width / 2 <= viewport.x + viewport.width / 2 &&
      path.y - path.height / 2 >= viewport.y - viewport.height / 2 &&
      path.y + path.height / 2 <= viewport.y + viewport.height / 2 &&
      !obstacles.some((other) => rectsOverlap(path, other, 0)) &&
      !paths.slice(0, i).some((other) => rectsOverlap(path, other, 0)),
  );
}
