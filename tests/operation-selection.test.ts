import assert from "node:assert/strict";
import test from "node:test";
import type { Body } from "../src/model/body.js";
import { type Operation, resolveOperation } from "../src/model/operation-selection.js";
import { selectionContext } from "../src/model/selection-context.js";
import { refineSelection } from "../src/model/selection-refinement.js";
import { defaultModelingTool } from "../src/model/tool-policy.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { type ModelingTarget, ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";

const body = (id: string): Body => ({
  id,
  brep: "",
  volume: 1,
  center: [0, 0, 0],
  bounds: [0, 0, 0, 1, 1, 1],
  faces: ["a", "b"].map((suffix) => ({
    id: `${id}/${suffix}`,
    edges: [`${id}/edge`],
    signature: [],
    vertices: [],
    plane: planes.XY,
  })),
  edges: [{ id: `${id}/edge`, curve: null, signature: [], points: [] }],
});
const a = body("one"),
  b = body("two");
const document: SketchDocument = { units: "mm", sketches: [], bodies: [a, b] };
const whole = (b: Body): ModelingTarget => ({ kind: "body", body: b.id });
const faces = (b: Body): ModelingTarget[] =>
  b.faces.map((f) => ({ kind: "face", body: b.id, face: f.id }));
const edge = (b: Body): ModelingTarget => ({ kind: "edge", body: b.id, edge: b.edges[0].id });
const operations: Operation[] = [
  "move",
  "duplicate",
  "mirror",
  "boolean",
  "offset",
  "shell",
  "extrude",
  "revolve",
  "fillet",
  "chamfer",
  "delete",
  "cleanup",
];

test("complete face coverage and body tokens have identical operation inputs and defaults", () => {
  for (const operation of operations.filter(
    (operation) => operation !== "fillet" && operation !== "chamfer",
  ))
    assert.deepEqual(
      resolveOperation(operation, faces(a), document),
      resolveOperation(operation, [whole(a)], document),
      operation,
    );
  assert.equal(defaultModelingTool(faces(a), document), "move");
  assert.equal(defaultModelingTool([whole(a)], document), "move");
  assert.equal(defaultModelingTool([faces(a)[0]], document), "offset");
});

test("overlap is deduplicated while first selected body order controls Boolean inputs", () => {
  const targets = [faces(b)[1], whole(a), whole(b), faces(a)[0], whole(a)];
  const result = resolveOperation("boolean", targets, document);
  assert.ok(result.available);
  assert.deepEqual(
    result.inputs.map((b) => b.id),
    [b.id, a.id],
  );
  assert.deepEqual(
    selectionContext(targets, document).faces.map((f) => f.face),
    [b.faces[1].id, ...a.faces.map((f) => f.id), b.faces[0].id],
  );
});

test("body-only operations expand faces and edges without changing topology-specific selection", () => {
  const targets = [edge(b), faces(a)[0], faces(b)[1], edge(a), edge(b)];
  const original = structuredClone(targets);
  for (const operation of ["duplicate", "mirror", "erode", "boolean"] as const) {
    assert.deepEqual(resolveOperation(operation, targets, document), {
      available: true,
      inputs: [b, a],
    });
    assert.equal(
      resolveOperation(operation, [...targets, { kind: "sketch", sketch: "sketch" }], {
        ...document,
        sketches: [{ id: "sketch", plane: planes.XY, curves: [], constraints: [], groups: [] }],
      }).available,
      false,
    );
    assert.equal(
      resolveOperation(
        operation,
        [...targets, { kind: "edge", body: a.id, edge: "missing" }],
        document,
      ).available,
      false,
    );
  }
  assert.deepEqual(targets, original);
  assert.equal(resolveOperation("boolean", [edge(a), faces(a)[0]], document).available, false);
  assert.deepEqual(resolveOperation("offset", [faces(a)[0]], document), {
    available: true,
    inputs: { targets: [{ body: a.id, face: a.faces[0].id }], faces: [a.faces[0]] },
  });
});

test("mixed movement retains partial targets while body-only actions expand them", () => {
  const targets = [whole(a), faces(b)[0]];
  const result = resolveOperation("move", targets, document);
  assert.ok(result.available);
  assert.deepEqual(result.inputs, {
    bodies: [a],
    faces: [{ body: b.id, face: b.faces[0].id }],
    edges: [],
  });
  assert.deepEqual(resolveOperation("duplicate", targets, document), {
    available: true,
    inputs: [a, b],
  });
  assert.equal(defaultModelingTool(targets, document), null);
  assert.equal(resolveOperation("move", [...targets, edge(b)], document).available, false);
  assert.equal(resolveOperation("move", [whole(a), edge(b)], document).available, true);
  for (const operation of operations)
    assert.equal(
      resolveOperation(
        operation,
        [...targets, { kind: "face", body: b.id, face: "missing" }],
        document,
      ).available,
      false,
    );
});

test("explicit edges remain distinct for face tools, but body movement subsumes redundant edges", () => {
  const targets = [whole(a), edge(a)];
  const move = resolveOperation("move", targets, document);
  assert.ok(move.available);
  assert.deepEqual(move.inputs, { bodies: [a], faces: [], edges: [] });
  assert.equal(resolveOperation("offset", targets, document).available, false);
  assert.equal(resolveOperation("fillet", [whole(a)], document).available, false);
  assert.equal(resolveOperation("fillet", [edge(a)], document).available, true);
});

test("body refinement and face toggling can remove and restore complete coverage", () => {
  const selection = new ModelSelection();
  selection.sync(document);
  selection.targets = [whole(a)];
  assert.deepEqual(refineSelection(selection.targets, [a, b], "only-faces"), faces(a));
  assert.deepEqual(refineSelection(selection.targets, [a, b], "remove-faces"), []);
  selection.choose(faces(a)[0], false, true);
  assert.deepEqual(selection.targets, [faces(a)[1]]);
  assert.equal(selection.tool, "offset");
  selection.choose(faces(a)[0], false, true);
  assert.equal(selection.tool, "move");
  selection.setTool("offset");
  selection.sync(structuredClone(document));
  assert.equal(selection.tool, "offset");
  selection.choose(whole(a), false, false);
  assert.equal(selection.tool, "move");
});

test("unsupported preferred tools remain unavailable and mixed deletion resolves all inputs", () => {
  const unsupported = {
    ...document,
    bodies: [{ ...a, faces: a.faces.map((f) => ({ ...f, plane: null })) }],
  };
  assert.equal(defaultModelingTool([faces(a)[0]], unsupported), null);
  const deletion = resolveOperation("delete", [whole(a), faces(b)[0]], document);
  assert.ok(deletion.available);
  assert.deepEqual(deletion.inputs, {
    bodyIds: [a.id],
    sketchIds: [],
    topology: [{ body: b.id, whole: false, faces: [b.faces[0].id], edges: [] }],
  });
});

test("shell resolves partial faces as openings and complete coverage as closed hollow", () => {
  assert.deepEqual(resolveOperation("shell", [whole(a), faces(b)[0]], document), {
    available: true,
    inputs: [
      { body: a.id, faces: [] },
      { body: b.id, faces: [b.faces[0].id] },
    ],
  });
  assert.equal(resolveOperation("shell", [whole(a), edge(a)], document).available, false);
});

test("Fillet and Chamfer convert ordered faces to unique boundary edges without expanding body tokens", () => {
  const rich: Body = {
    ...a,
    faces: [
      { ...a.faces[0], edges: ["ab", "shared", "ab"] },
      { ...a.faces[1], edges: ["shared", "bc"] },
    ],
    edges: ["ab", "shared", "bc", "explicit"].map((id) => ({ ...a.edges[0], id })),
  };
  const doc = { ...document, bodies: [rich, b] };
  const targets: ModelingTarget[] = [
    { kind: "edge", body: rich.id, edge: "explicit" },
    ...faces(rich),
    { kind: "edge", body: rich.id, edge: "ab" },
  ];
  for (const mode of ["fillet", "chamfer"] as const) {
    assert.deepEqual(resolveOperation(mode, targets, doc), {
      available: true,
      inputs: ["explicit", "ab", "shared", "bc"].map((edge) => ({ body: rich.id, edge })),
    });
    assert.deepEqual(resolveOperation(mode, faces(rich), doc), {
      available: true,
      inputs: ["ab", "shared", "bc"].map((edge) => ({ body: rich.id, edge })),
    });
    assert.equal(resolveOperation(mode, [whole(rich)], doc).available, false);
    assert.equal(resolveOperation(mode, [whole(rich), ...targets], doc).available, false);
    const broken = { ...rich, faces: [{ ...rich.faces[0], edges: ["missing"] }] };
    assert.equal(
      resolveOperation(mode, faces(broken), { ...doc, bodies: [broken] }).available,
      false,
    );
    assert.equal(
      resolveOperation(mode, [{ kind: "sketch", sketch: "missing" }, ...targets], doc).available,
      false,
    );
  }
});
