import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { type GuideCandidate, guideCandidates } from "../src/guides/candidates.js";
import { hoverGuides, spacedGuides } from "../src/guides/hover.js";
import { exposedSpan, parentClearance } from "../src/guides/parent-clearance.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { pickModel } from "../src/sketch/model-selection.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { prism, square } from "./body-edge-fixtures.js";
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
  assert.deepEqual(spacedGuides([candidate(0), candidate(0)], [], project), []);
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
    hover: { kind: "curve", curve: "line", point: { x: 30, y: 0 } },
  });
  Object.assign(editor.world, { active: true, activeFrame: planes.XY, height: 80 });
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

test("native edge/face hover follows actual parent membership and every junction parent has clearance", async () => {
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
    assert.ok(
      face.guides.every((p) => p.anchor.kind === "body-faces" || p.anchor.kind === "body-center"),
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
