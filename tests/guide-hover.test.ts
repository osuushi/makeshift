import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { type GuideCandidate, guideCandidates } from "../src/guides/candidates.js";
import { near } from "../src/guides/geometry.js";
import { hoverGuides, spacedGuides } from "../src/guides/hover.js";
import { exposedSpan, parentClearance } from "../src/guides/parent-clearance.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { pickModel } from "../src/sketch/model-selection.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { SelectedTargets } from "../src/sketch/selected-targets.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { pickingEditor } from "./body-picking-fixtures.js";

const candidate = (x: number, y = 0): GuideCandidate => ({
  anchor: { kind: "body-center", body: `${x}:${y}`, feature: "bounds-center" },
  point: [x, y, 0],
  label: "test",
});
const project = ([x, y]: Vector) => ({ x, y });

test("spacing removes both sides and whole collision chains, independent of order", () => {
  const points = [candidate(0), candidate(30), candidate(60), candidate(150)];
  assert.deepEqual(spacedGuides(points, [], project), [points[3]]);
  assert.deepEqual(spacedGuides([...points].reverse(), [], project), [points[3]]);
  assert.equal(spacedGuides([candidate(0), candidate(32)], [], project).length, 2);
  const coincident = [candidate(0), candidate(0)];
  assert.deepEqual(spacedGuides(coincident, [], project), coincident);
  assert.deepEqual(spacedGuides([...coincident, candidate(20)], [], project), []);
  assert.deepEqual(spacedGuides(coincident, [candidate(0)], project), []);
  const behind = { ...candidate(0), point: [0, 0, -10] as Vector };
  assert.deepEqual(spacedGuides([candidate(0), behind], [], project), []);
  assert.deepEqual(spacedGuides([candidate(0)], [candidate(31)], project), []);
});

test("parent clearance uses its largest projected dimension and every marker footprint", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 148, y: 0 },
  ];
  assert.equal(exposedSpan(line, [{ x: 74, y: 0 }]), 64);
  assert.equal(
    exposedSpan(line, [
      { x: 74, y: 0 },
      { x: 0, y: 0 },
    ]),
    64,
  );
  assert.equal(
    exposedSpan(line, [
      { x: 74, y: 0 },
      { x: 0, y: 0 },
      { x: 148, y: 0 },
    ]),
    54,
  );
  assert.equal(
    exposedSpan(
      [
        { x: 0, y: 0 },
        { x: 5, y: 60 },
      ],
      [],
    ),
    60,
  );
  assert.equal(exposedSpan(line, [{ x: 74, y: 11 }]), 148);
});

function sketchEditor() {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "line", kind: "segment", construction: false, a: { x: 0, y: 0 }, b: { x: 60, y: 0 } },
    ],
  };
  const editor = pickingEditor([]);
  Object.assign(editor, {
    sketch,
    selected: new SelectedTargets(),
    selectedCurves: new Set<string>(),
    selectionOwners: new Set<string>(),
    hover: { kind: "curve", curve: "line", point: { x: 30, y: 0 } },
  });
  Object.assign(editor.world.canvas, { clientHeight: 800 });
  Object.assign(editor.world, {
    active: true,
    activeFrame: planes.XY,
    height: 80,
    projectLocal: (_plane: unknown, point: { x: number; y: number }) =>
      editor.world.project([point.x, point.y, 0]),
    pointAt: (_plane: unknown, x: number, y: number) => ({ x: (x - 600) / 10, y: (400 - y) / 10 }),
  });
  Object.assign(editor.display, { sketches: [sketch] });
  return { editor, sketch };
}

test("hover requires a parent and includes the 256 px boundary, not just the closest guide", () => {
  const { editor } = sketchEditor();
  const screen = editor.world.project([30, 0, 0]);
  assert.equal(hoverGuides(editor, { x: screen.x + 256, y: screen.y }).length, 2);
  assert.equal(hoverGuides(editor, { x: screen.x + 256.1, y: screen.y }).length, 1);
  editor.hover = null;
  assert.deepEqual(hoverGuides(editor, screen), []);
});

test("saved guides on other parents block hover even outside the pointer radius; hidden guides do not", () => {
  const { editor, sketch } = sketchEditor();
  const other: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", construction: false, center: { x: 31, y: 0 }, radius: 10 },
    ],
  };
  const guide = {
    id: "saved",
    name: "Saved",
    hidden: false,
    anchor: {
      kind: "sketch-curve" as const,
      sketch: other.id,
      curve: "circle",
      feature: "circle-center" as const,
    },
  };
  Object.assign(editor.display, { sketches: [sketch, other], guidePoints: [guide] });
  const pointer = editor.world.project([4.4, 0, 0]);
  assert.equal(
    hoverGuides(editor, pointer).length,
    1,
    "only the start remains; midpoint blocked by saved guide 266 px from pointer",
  );
  Object.assign(editor.display, { guidePoints: [{ ...guide, hidden: true }] });
  assert.equal(hoverGuides(editor, pointer).length, 2);
  Object.assign(editor.display, { guidePoints: [guide] });
  Object.assign(editor.visibility, { visible: (id: string) => id !== other.id });
  assert.equal(hoverGuides(editor, pointer).length, 2);
});

test("small parents cannot be hidden by a lone guide and saved definitions do not reappear as ghosts", () => {
  const { editor, sketch } = sketchEditor();
  const small = {
    ...sketch,
    curves: [
      {
        id: "small",
        kind: "circle" as const,
        construction: false,
        center: { x: 0, y: 0 },
        radius: 3,
      },
    ],
  };
  Object.assign(editor, {
    sketch: small,
    hover: { kind: "circleBody", curve: "small", point: { x: 3, y: 0 } },
  });
  Object.assign(editor.display, { sketches: [small] });
  assert.deepEqual(hoverGuides(editor, editor.world.project([3, 0, 0])), []);
  const large = { ...small, curves: [{ ...small.curves[0], radius: 10 }] };
  Object.assign(editor, { sketch: large });
  Object.assign(editor.display, { sketches: [large] });
  const pointer = editor.world.project([10, 0, 0]);
  const [point] = hoverGuides(editor, pointer);
  assert.ok(point);
  Object.assign(editor.display, {
    guidePoints: [{ id: "kept", name: "Kept", hidden: false, anchor: point.anchor }],
  });
  assert.deepEqual(hoverGuides(editor, pointer), []);
});

test("native face hover exposes boundary-edge neighbors and every junction parent has clearance", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const editor = pickingEditor([body], [70, 60, 100]);
    Object.assign(editor, { modeling: new ModelSelection() });
    const probe = (point: Vector) => {
      const screen = editor.world.project(point);
      editor.modeling.hover = pickModel(editor, screen);
      return { guides: hoverGuides(editor, screen), hit: editor.modeling.hover };
    };
    const face = probe([10, 10, 10]);
    assert.equal(face.hit?.kind, "face");
    assert.ok(face.hit?.kind === "face");
    const hoveredFace = face.hit.face;
    const boundary = body.faces.find((f) => f.id === hoveredFace)?.edges ?? [];
    const edgeGuides = face.guides.filter((p) => p.anchor.kind === "body-edge");
    assert.ok(edgeGuides.length > 0, "hovering the face exposes off-pointer edge guides");
    assert.ok(
      edgeGuides.every((p) => p.anchor.kind === "body-edge" && boundary.includes(p.anchor.edge)),
    );
    const edge = probe([20, 10, 10]);
    assert.ok(edge.hit?.kind === "edge");
    const hoveredEdge = edge.hit.edge;
    assert.ok(
      edge.guides.every((p) => p.anchor.kind !== "body-edge" || p.anchor.edge === hoveredEdge),
      "do not traverse through the neighboring face to its other edges",
    );
    assert.ok(guideCandidates(editor.display, [{ kind: "body", body: body.id }]).length > 20);
    const junction = guideCandidates(editor.display, [{ kind: "body", body: body.id }]).find(
      (p) => p.anchor.kind === "body-junction",
    );
    assert.ok(junction);
    const topDown = pickingEditor([body]);
    assert.equal(
      parentClearance(topDown, junction.anchor, []),
      false,
      "vertical incident edge is collapsed on screen",
    );
    assert.deepEqual(probe([50, 50, 10]), { hit: null, guides: [] });
  } finally {
    owner.close();
  }
});

test("coincident native cylinder cap definitions remain discoverable from the cap and side", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "rim", kind: "circle", center: { x: 0, y: 0 }, radius: 20, construction: false },
      ],
    });
    const editor = pickingEditor([body], [0, -100, 70]);
    Object.assign(editor, { modeling: new ModelSelection() });
    const cap = body.faces.find((face) => face.plane && Math.abs(face.signature[5] - 10) < 1e-6);
    const side = body.faces.find((face) => !face.plane);
    assert.ok(cap && side);
    const center = [0, 0, 10] as Vector;
    const centers = (face: string) => {
      editor.modeling.hover = { kind: "face", body: body.id, face };
      return hoverGuides(editor, editor.world.project(center)).filter((p) => near(p.point, center));
    };
    const top = centers(cap.id);
    assert.equal(top.length, 4, "rim center plus all three face centers share one marker");
    assert.equal(centers(side.id).length, 1, "side exposes the same circular rim center");
  } finally {
    owner.close();
  }
});

test("selected sketch curves keep candidates away from the pointer with existing spacing and clearance", () => {
  const { editor } = sketchEditor();
  editor.selectionOwners.add("line");
  editor.hover = null;
  const candidates = hoverGuides(editor, null);
  assert.equal(candidates.length, 3);
  assert.deepEqual(hoverGuides(editor, { x: -1000, y: -1000 }), candidates);
  Object.assign(editor.world, { project: ([x, y]: Vector) => ({ x, y }) });
  assert.equal(
    hoverGuides(editor, null).length,
    0,
    "all three guides collide on a small projected line",
  );
  editor.selectionOwners.clear();
  assert.equal(hoverGuides(editor, null).length, 0);
});

test("hover candidates also satisfy spacing at their destination, beyond the current radius", () => {
  const { editor, sketch } = sketchEditor();
  const arc: Sketch = {
    ...sketch,
    curves: [
      {
        id: "arc",
        kind: "arc",
        a: { x: 0, y: 0 },
        b: { x: 2, y: 0 },
        bulge: 10,
        construction: false,
      },
    ],
  };
  Object.assign(editor, {
    sketch: arc,
    hover: { kind: "curve", curve: "arc", point: { x: 2, y: 0 } },
  });
  Object.assign(editor.display, { sketches: [arc] });
  const endpoint = editor.world.project([2, 0, 0]);
  const pointer = { x: endpoint.x + 256, y: endpoint.y };
  const raw = guideCandidates(editor.display, [], { sketch: arc.id, curves: ["arc"] }).filter(
    (p) => {
      const q = editor.world.project(p.point);
      return Math.hypot(q.x - pointer.x, q.y - pointer.y) <= 256;
    },
  );
  assert.equal(raw.length, 1, "only the far endpoint is within the original hover radius");
  assert.ok(parentClearance(editor, raw[0].anchor, [endpoint]));
  assert.equal(
    hoverGuides(editor, pointer).length,
    0,
    "the other endpoint blocks it at its destination",
  );
});
