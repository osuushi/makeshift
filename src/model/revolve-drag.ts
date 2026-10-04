import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { Point } from "../sketch/planes.js";
import { projectedAxis } from "./extrude-axis.js";
import { angleAt, revolutionPoint } from "./revolve-axis.js";
import type { RevolveControls } from "./revolve-controls.js";
import { widgetPointerOffset } from "./widget-viewport.js";

interface RevolveDragState {
  offset: Point;
  id: number;
  key: "angle" | "height";
  start: Point;
  angle: number | null;
  value: number;
  direction: ReturnType<typeof projectedAxis>;
  moved: boolean;
}

export function installRevolveDrag(tool: RevolveControls, signal: AbortSignal): void {
  let drag: RevolveDragState | null = null;
  for (const key of ["angle", "height"] as const) {
    const handle = key === "angle" ? tool.widget.angleHandle : tool.widget.heightHandle;
    handle.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || !tool.axis || !tool.frame || tool.editor.blocked) return;
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
        const start = { x: event.clientX, y: event.clientY };
        const offset = widgetPointerOffset(handle);
        drag = {
          offset,
          id: event.pointerId,
          key,
          start,
          value: tool[key],
          moved: false,
          angle: angleAt(
            tool.editor,
            tool.axis,
            tool.frame.center,
            { x: start.x - offset.x, y: start.y - offset.y },
            tool.height,
          ),
          direction: projectedAxis(
            tool.editor,
            revolutionPoint(tool.axis, tool.frame.center, tool.angle, tool.height),
            tool.axis.direction,
          ),
        };
        tool.lease?.capture(handle, event.pointerId);
        event.preventDefault();
        tool.editor.refresh();
      },
      { signal },
    );
  }
  const move = (event: PointerEvent) => {
    if (
      !drag ||
      drag.id !== event.pointerId ||
      tool.lease?.phase !== "editing" ||
      !tool.axis ||
      !tool.frame
    )
      return;
    const point = { x: event.clientX, y: event.clientY };
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 3) drag.moved = true;
    if (!drag.moved) return;
    tool[drag.key] = dragValue(tool, drag, event, point);
    tool.queue();
  };
  window.addEventListener("pointermove", move, { signal });
  replayPointerModifiers(signal, () => !!drag, move);
  window.addEventListener(
    "pointerup",
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const { moved, key } = drag;
      drag = null;
      tool.lease?.releaseCapture();
      if (!moved) {
        tool.widget[key].focus();
        tool.widget[key].select();
      }
      tool.editor.refresh();
    },
    { signal },
  );
}

function dragValue(
  tool: RevolveControls,
  drag: RevolveDragState,
  event: PointerEvent,
  point: Point,
): number {
  if (!tool.axis || !tool.frame) return drag.value;
  let value: number;
  if (drag.key === "height") {
    const d = drag.direction;
    value =
      drag.value + ((point.x - drag.start.x) * d.x + (point.y - drag.start.y) * d.y) / d.scale;
    if (tool.editor.gridSnap)
      value = Math.round(value / tool.editor.world.spacing) * tool.editor.world.spacing;
  } else {
    const next = angleAt(
      tool.editor,
      tool.axis,
      tool.frame.center,
      { x: point.x - drag.offset.x, y: point.y - drag.offset.y },
      tool.height,
    );
    if (next !== null && drag.angle !== null) {
      let delta = next - drag.angle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      drag.value += delta;
      drag.angle = next;
      value = drag.value;
    } else value = drag.value + point.x - drag.start.x;
    if (tool.height === 0) value = Math.max(-360, Math.min(360, value));
    if (!event.shiftKey) value = Math.round(value);
  }
  return value;
}
