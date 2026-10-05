import {
  fitWidgets,
  measuredRect,
  type WidgetRect,
  widgetRectClear,
  widgetViewport,
} from "../model/widget-viewport.js";
import type { SketchEditor } from "./editor.js";
import type { Point } from "./planes.js";

export interface SketchWidgetTarget {
  key: string;
  point: Point;
  screen: Point;
  offset: Point;
  width: number;
  height: number;
  radius: number;
  limited: boolean;
}
interface Registration {
  root: HTMLElement;
  targets: Map<string, SketchWidgetTarget>;
  pointer: Point | null;
  pressed: boolean;
  redraw: () => void;
}
const registrations = new WeakMap<SketchEditor, Registration>();

export function registerSketchWidgets(
  editor: SketchEditor,
  root: HTMLElement,
  redraw: () => void,
): () => void {
  const registration: Registration = {
    root,
    targets: new Map(),
    pointer: null,
    pressed: false,
    redraw,
  };
  const controller = new AbortController(),
    options = { signal: controller.signal, capture: true };
  const remember = (event: PointerEvent) => {
    registration.pointer = { x: event.clientX, y: event.clientY };
  };
  window.addEventListener("pointermove", remember, options);
  window.addEventListener(
    "pointerdown",
    (event) => {
      remember(event);
      registration.pressed = hovering(editor, registration);
    },
    options,
  );
  for (const type of ["pointerup", "pointercancel", "blur"])
    window.addEventListener(
      type,
      () => {
        registration.pressed = false;
        if (type === "blur") registration.pointer = null;
      },
      options,
    );
  document.documentElement.addEventListener(
    "pointerleave",
    () => {
      registration.pointer = null;
    },
    options,
  );
  registrations.set(editor, registration);
  return () => {
    controller.abort();
    if (registrations.get(editor) === registration) registrations.delete(editor);
  };
}

function hovering(editor: SketchEditor, registration: Registration): boolean {
  const point = registration.pointer;
  return (
    !!point &&
    document.elementFromPoint(point.x, point.y) === editor.world.canvas &&
    [...registration.targets.values()].some(
      (target) => Math.hypot(point.x - target.screen.x, point.y - target.screen.y) <= target.radius,
    )
  );
}

/** Rendering writes the current display map once; mathematical picking reads that same map. */
export function updateSketchWidgets(
  editor: SketchEditor,
  entries: { key: string; point: Point }[],
): void {
  const registration = registrations.get(editor),
    plane = editor.sketch?.plane;
  if (!registration || !plane || !entries.length) {
    registration?.targets.clear();
    return;
  }
  const { viewport, obstacles } = widgetViewport(registration.root);
  for (const control of registration.root.querySelectorAll(
    ".move-control, .pivot-control, .move-anchor",
  )) {
    const rect = measuredRect(control);
    if (rect.width && rect.height) obstacles.push(rect);
  }
  for (const control of registration.root.ownerDocument.querySelectorAll(
    ".scale-widget .transform-box-handle, .scale-widget .scale-card",
  )) {
    const rect = measuredRect(control);
    if (rect.width && rect.height) obstacles.push(rect);
  }
  const nominal = entries.map((entry) => {
    const glyph = registration.root.querySelector<SVGSVGElement>(
      `[data-move-marker="${entry.key}"] svg`,
    );
    const matrix = glyph?.getScreenCTM(),
      viewBox = glyph?.viewBox.baseVal;
    // SVG bounds describe the path silhouette, not the viewport containing its hit area.
    const width = matrix && viewBox ? viewBox.width * Math.hypot(matrix.a, matrix.b) : 48;
    const height = matrix && viewBox ? viewBox.height * Math.hypot(matrix.c, matrix.d) : 48;
    const screen = editor.world.projectLocal(plane, entry.point);
    return { x: screen.x, y: screen.y, width, height };
  });
  const fitted = fitWidgets(nominal, obstacles, viewport);
  const frozen =
    editor.isDragging ||
    registration.pressed ||
    (hovering(editor, registration) &&
      displayedWidgetsClear(registration, entries, nominal, obstacles, viewport));
  const next = new Map<string, SketchWidgetTarget>();
  entries.forEach((entry, i) => {
    const previous = registration.targets.get(entry.key);
    const offset =
      frozen && previous
        ? previous.offset
        : { x: fitted[i].x - nominal[i].x, y: fitted[i].y - nominal[i].y };
    next.set(entry.key, {
      ...entry,
      ...nominal[i],
      screen: { x: nominal[i].x + offset.x, y: nominal[i].y + offset.y },
      offset,
      limited: !!fitted[i].limited,
      radius:
        (Math.max(nominal[i].width, nominal[i].height) / 48) * (entry.key === "rotation" ? 17 : 22),
    });
  });
  registration.targets = next;
}

/** Idle hover holds its correction only while normal projection tracking remains safe. */
function displayedWidgetsClear(
  registration: Registration,
  entries: { key: string; point: Point }[],
  nominal: WidgetRect[],
  obstacles: WidgetRect[],
  viewport: WidgetRect,
): boolean {
  const current = nominal.map((rect, i) => {
    const offset = registration.targets.get(entries[i].key)?.offset;
    return { ...rect, x: rect.x + (offset?.x ?? 0), y: rect.y + (offset?.y ?? 0) };
  });
  return current.every((rect, i) =>
    widgetRectClear(rect, [...obstacles, ...current.filter((_, j) => i !== j)], viewport),
  );
}

export function sketchWidgetTarget(editor: SketchEditor, key: string): SketchWidgetTarget | null {
  return registrations.get(editor)?.targets.get(key) ?? null;
}

/** Scale has priority; its completed DOM placement asks the registered renderer to redraw. */
export function redrawSketchWidgets(editor: SketchEditor): void {
  registrations.get(editor)?.redraw();
}
