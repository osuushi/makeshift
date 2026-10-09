import { drawingAttachment } from "./creation-links.js";
import type { Constraint, Curve, Endpoint, Sketch } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, scale, subtract } from "./point-math.js";

export interface PenAnchor {
  point: Point;
  incoming: Point | null;
  outgoing: Point | null;
  smooth: boolean;
  attached: boolean;
  endpoint?: Endpoint;
}

export function penDirection(origin: Point, point: Point, gridStep = 0): Point {
  const delta = subtract(point, origin);
  const angle = Math.round(Math.atan2(delta.y, delta.x) / (Math.PI / 4)) * (Math.PI / 4);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const gridLength = gridStep / Math.max(Math.abs(direction.x), Math.abs(direction.y));
  const rawLength = Math.hypot(delta.x, delta.y);
  const length = gridStep > 0 ? Math.round(rawLength / gridLength) * gridLength : rawLength;
  return add(origin, scale(direction, length));
}

export function penHandles(anchor: PenAnchor, handle: Point, corner: boolean): PenAnchor {
  const delta = subtract(handle, anchor.point);
  if (Math.hypot(delta.x, delta.y) < 1e-8)
    return { ...anchor, incoming: null, outgoing: null, smooth: false };
  return {
    ...anchor,
    incoming: corner ? null : add(anchor.point, scale(delta, -1)),
    outgoing: handle,
    smooth: !corner,
  };
}

export function penSegment(sketch: Sketch, start: PenAnchor, end: PenAnchor, id: string): Sketch {
  if (distance(start.point, end.point) < 1e-8) throw new Error("Place the next anchor elsewhere");
  const curve: Curve =
    start.outgoing || end.incoming
      ? {
          id,
          kind: "bezier",
          a: start.point,
          b: end.point,
          c1: start.outgoing ?? start.point,
          c2: end.incoming ?? end.point,
          construction: false,
        }
      : { id, kind: "segment", a: start.point, b: end.point, construction: false };
  const constraints: Constraint[] = [];
  for (const [anchor, own] of [
    [start, { curve: id, end: "a" }],
    [end, { curve: id, end: "b" }],
  ] as const) {
    if (anchor.endpoint) {
      constraints.push({
        id: `${id}-${own.end}-join`,
        kind: "coincident",
        a: own,
        b: anchor.endpoint,
      });
      const peer = sketch.curves.find((c) => c.id === anchor.endpoint?.curve);
      const peerHandle =
        peer?.kind === "bezier" ? peer[anchor.endpoint.end === "a" ? "c1" : "c2"] : null;
      const ownHandle = own.end === "a" ? start.outgoing : end.incoming;
      if (
        anchor.smooth &&
        ownHandle &&
        peer &&
        peerHandle &&
        distance(peerHandle, anchor.point) > 1e-8
      )
        constraints.push({
          id: `${id}-${own.end}-tangent`,
          kind: "tangent",
          a: peer.id,
          b: id,
          side: 1,
          junction: { aEnd: anchor.endpoint.end, bEnd: own.end },
        });
    } else if (anchor.attached) {
      const attachment = drawingAttachment(sketch, anchor.point);
      if (attachment)
        constraints.push(
          attachment.kind === "coincident"
            ? { id: `${id}-${own.end}-attachment`, kind: "coincident", a: own, b: attachment.peer }
            : {
                id: `${id}-${own.end}-attachment`,
                kind: "point-on-edge",
                point: own,
                edge: attachment.edge,
              },
        );
    }
  }
  return {
    ...sketch,
    curves: [...sketch.curves, curve],
    constraints: [...sketch.constraints, ...constraints],
  };
}
