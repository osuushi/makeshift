import { planeNormal, type Vector } from "../sketch/planes.js";
import type { Body, Edge, Extrusion, Face } from "./body.js";
import type { VisualBody, VisualPreview } from "./visual-preview.js";

type Bounds = VisualBody["bounds"];
interface Cap {
  face: Face;
  rim: Edge & { curve: Extract<NonNullable<Edge["curve"]>, { kind: "circle" }> };
  normal: Vector;
  stationary: VisualBody;
}
const prepared = new WeakMap<Body, Cap>();
const slack = 2e-7;

function translate(values: number[], delta: Vector): number[] {
  return values.map((value, i) => value + delta[i % 3]);
}
function disjoint(a: readonly number[], b: Bounds): boolean {
  return [0, 1, 2].some((i) => a[i + 3] < b[i] - slack || a[i] > b[i + 3] + slack);
}
function behind(bounds: readonly number[], center: Vector, normal: Vector): boolean {
  return (
    normal.reduce((total, n, i) => total + n * (bounds[i + (n > 0 ? 3 : 0)] - center[i]), 0) <=
    slack
  );
}
function capOf(body: Body, face: Face): Cap | undefined {
  const cached = prepared.get(body);
  if (cached?.face === face) return cached;
  if (!face.plane || face.edges.length !== 1 || !face.bounds) return;
  const rim = body.edges.find((edge) => edge.id === face.edges[0]);
  if (rim?.curve?.kind !== "circle" || !rim.landmarks?.closed || rim.points.length < 12) return;
  const neighbors = body.faces.filter((f) => f !== face && f.edges.includes(rim.id));
  // Continuing a cylinder can also remove the original seam. Let the exact
  // Boolean determine the drawing when existing and swept supports coincide.
  if (neighbors.length !== 1 || neighbors[0].cylinder || neighbors[0].plane) return;
  const normal = planeNormal(face.plane);
  const rest = body.faces.filter((f) => f !== face);
  const cap: Cap = {
    face,
    rim: { ...rim, curve: rim.curve },
    normal,
    stationary: {
      sourceBodies: [body.id],
      bounds: body.bounds.slice() as Bounds,
      sourceFaces: rest.map((f) => [f.id]),
      faces: rest.map((f) => f.vertices),
      normals: rest.map((f) => f.normals ?? []),
      planes: rest.map((f) => f.plane),
      sourceEdges: body.edges.map((e) => [e.id]),
      edges: body.edges.map((e) => e.points),
    },
  };
  prepared.set(body, cap);
  return cap;
}
function cylinderWall(cap: Cap, delta: Vector) {
  const points = cap.rim.points,
    center = cap.rim.curve.center;
  const vertices: number[] = [],
    normals: number[] = [];
  for (let i = 3; i < points.length; i += 3) {
    const a = points.slice(i - 3, i),
      b = points.slice(i, i + 3);
    const radial = a.map((x, j) => (x - center[j]) / cap.rim.curve.radius);
    const next = b.map((x, j) => (x - center[j]) / cap.rim.curve.radius);
    const tangent = b.map((x, j) => x - a[j]);
    const n = cap.normal;
    const winding =
      radial[0] * (tangent[1] * n[2] - tangent[2] * n[1]) +
      radial[1] * (tangent[2] * n[0] - tangent[0] * n[2]) +
      radial[2] * (tangent[0] * n[1] - tangent[1] * n[0]);
    const [p, q, np, nq] = winding >= 0 ? [a, b, radial, next] : [b, a, next, radial];
    const highP = translate(p, delta),
      highQ = translate(q, delta);
    vertices.push(...p, ...q, ...highQ, ...p, ...highQ, ...highP);
    normals.push(...np, ...nq, ...nq, ...np, ...nq, ...np);
  }
  return { vertices, normals };
}

/** Draw only the new cylinder and translated disk while the exact edit runs. */
export function outwardCapDrawing(bodies: readonly Body[], edit: Extrusion): VisualPreview | null {
  const [source] = edit.sources;
  if (
    edit.sources.length !== 1 ||
    !source ||
    !("face" in source) ||
    !Number.isFinite(edit.distance) ||
    edit.distance <= slack ||
    edit.symmetric ||
    edit.draft?.value ||
    edit.twist?.angle ||
    (edit.mode !== "auto" && edit.mode !== "union")
  )
    return null;
  const body = bodies.find((b) => b.faces.some((f) => f.id === source.face));
  const face = body?.faces.find((f) => f.id === source.face);
  if (
    !body ||
    !face?.plane ||
    !face.bounds ||
    (edit.eligibleTargets && !edit.eligibleTargets.includes(body.id)) ||
    (edit.targets && (edit.targets.length !== 1 || edit.targets[0] !== body.id))
  )
    return null;
  const cap = capOf(body, face);
  if (!cap) return null;
  const delta = cap.normal.map((n) => n * edit.distance) as Vector;
  const swept = face.bounds.map(
    (x, i) => x + (i < 3 ? Math.min : Math.max)(0, delta[i % 3]),
  ) as Bounds;
  const center = cap.rim.curve.center;
  // The face normal points into air. No other boundary can enter the swept
  // volume if its exact bounds lie behind the base plane or outside the sweep.
  if (
    !behind(body.bounds, center, cap.normal) &&
    body.faces.some(
      (f) =>
        f !== face &&
        (!f.bounds || (!behind(f.bounds, center, cap.normal) && !disjoint(f.bounds, swept))),
    )
  )
    return null;
  if (
    !edit.targets &&
    bodies.some(
      (other) =>
        other !== body &&
        (!edit.eligibleTargets || edit.eligibleTargets.includes(other.id)) &&
        !disjoint(other.bounds, swept),
    )
  )
    return null;
  const wall = cylinderWall(cap, delta),
    seam = cap.rim.points.slice(0, 3);
  const bounds = body.bounds.map((x, i) => (i < 3 ? Math.min : Math.max)(x, swept[i])) as Bounds;
  return {
    replaces: [body.id],
    bodies: [
      {
        stationary: cap.stationary,
        sourceBodies: [body.id],
        bounds,
        faces: [translate(face.vertices, delta), wall.vertices],
        normals: [face.normals ?? [], wall.normals],
        sourceFaces: [[face.id], []],
        planes: [{ ...face.plane, origin: translate(face.plane.origin, delta) as Vector }, null],
        edges: [translate(cap.rim.points, delta), [...seam, ...translate(seam, delta)]],
        sourceEdges: [[], []],
      },
    ],
  };
}
