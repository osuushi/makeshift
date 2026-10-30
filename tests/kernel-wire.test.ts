import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { readKernelReply } from "../src/backend/kernel-reply-validation.js";
import type { KernelResult } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body, Face } from "../src/model/body.js";
import { documentArchive } from "../src/model/document-archive.js";
import { exactBodies } from "../src/model/exact-body.js";
import { planes } from "../src/sketch/planes.js";
import { prism, square } from "./body-edge-fixtures.js";
import { kernelWireFixture } from "./kernel-wire-fixture.js";

async function verifyQueries(kernel: SolidCalculator, body: Body, face: Face) {
  const bodies = [body];
  const query = await kernel.calculate({ kind: "topology", bodies, body: body.id });
  assert.equal(query.topology.faces.length, body.faces.length);
  // @ts-expect-error A topology query has no solid-operation result envelope.
  assert.equal(query.results, undefined);
  const measured = await kernel.calculate({
    kind: "measure",
    bodies,
    curves: [],
    profiles: [],
    planes: [],
    targets: [{ kind: "face", body: body.id, face: face.id }],
  });
  assert.ok(Math.abs(measured.measurement.properties[0].value - 400) < 1e-6);
  const sections = await kernel.calculate({
    kind: "sections",
    bodies,
    frame: { ...planes.XY, origin: [0, 0, 5] },
  });
  assert.equal(sections.sections[0].curves.length, 4);
  const horizontal = body.edges.find(
    (edge) => edge.curve?.kind === "line" && edge.curve.a[2] === edge.curve.b[2],
  );
  assert.ok(horizontal);
  const projected = await kernel.calculate({
    kind: "project",
    bodies,
    frame: planes.XY,
    curves: [],
    edges: [{ kind: "edge", body: body.id, edge: horizontal.id }],
  });
  assert.ok(projected.curves.length);
  await kernel.calculate({
    kind: "edge-finish-selection",
    bodies,
    mode: "fillet",
    edges: [{ body: body.id, edge: body.edges[0].id }],
  });
}

test("all real native body edits and queries send the exact envelope without display coordinates", async () => {
  const owner = new DocumentOwner(),
    wire = await kernelWireFixture();
  const kernel = new SolidCalculator(wire.executable);
  try {
    const body = await prism(owner, square),
      bodies = [body];
    const face = body.faces.find((face) => face.plane?.origin[2] === 10);
    assert.ok(face);
    const inspected = await kernel.calculate({ kind: "inspect", bodies });
    assert.equal(inspected.mode, "inspect");
    const offset = await kernel.calculate({
      kind: "offset-faces",
      bodies,
      faces: [{ body: body.id, face: face.id }],
      distance: 1,
    });
    assert.ok(Math.abs(offset.results[0].volume - 4400) < 1e-6);
    const transformed = await kernel.calculate({
      kind: "transform",
      bodies,
      ids: [body.id],
      pivot: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 0,
      translation: [1, 2, 3],
      duplicate: false,
    });
    assert.ok(
      transformed.results[0].center.every((value, i) => Math.abs(value - [11, 12, 8][i]) < 1e-7),
    );
    const hollow = await kernel.calculate({
      kind: "shell",
      bodies,
      selection: [{ body: body.id, faces: [face.id] }],
      thickness: -1,
    });
    assert.ok(hollow.results[0].volume < body.volume);
    await verifyQueries(kernel, body, face);
    const inputs = await wire.inputs();
    assert.equal(inputs.length, 9);
    for (const input of inputs) {
      assert.deepEqual(input.bodies, exactBodies(bodies));
      const bytes = Buffer.byteLength(JSON.stringify(input.bodies));
      assert.ok(
        bytes < Buffer.byteLength(JSON.stringify(bodies)),
        "wire payload removes real presentation bytes",
      );
      assert.deepEqual(Object.keys(input.bodies[0]).sort(), ["brep", "edges", "faces", "id"]);
      assert.deepEqual(Object.keys(input.bodies[0].faces[0]).sort(), ["id", "signature"]);
    }
    assert.deepEqual(
      JSON.parse(documentArchive(owner.view.data)).document.bodies,
      inputs[0].bodies,
    );
    console.log(
      `native prism body payload: ${Buffer.byteLength(JSON.stringify(bodies))} → ${Buffer.byteLength(JSON.stringify(inputs[0].bodies))} bytes`,
    );
  } finally {
    owner.close();
    kernel.close();
    await kernel.cancel();
    await wire.close();
  }
});

test("damaged real native replies cannot change accepted geometry or query state", async () => {
  const wire = await kernelWireFixture(),
    owner = new DocumentOwner(undefined, wire.executable);
  try {
    const body = await prism(owner, square),
      before = owner.view;
    await wire.damage("center");
    const reply = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [body.id],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        translation: [1, 0, 0],
        duplicate: false,
      },
    });
    assert.match(reply.error ?? "", /Invalid solid kernel reply: finite number/);
    assert.equal(owner.view.data, before.data);
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.canUndo, before.canUndo);
    assert.equal(owner.view.canRedo, before.canRedo);
    await wire.damage("measurement");
    const caps = body.faces.filter(
      (face) => face.plane && Math.abs(face.plane.u[2]) + Math.abs(face.plane.v[2]) < 1e-7,
    );
    const measured = await owner.call({
      kind: "measure",
      targets: caps.map((face) => ({ kind: "face", body: body.id, face: face.id })),
    });
    assert.match(measured.error ?? "", /Invalid solid kernel reply: finite number/);
    assert.equal(measured.measurement, undefined);
    assert.equal(owner.view.data, before.data);
  } finally {
    owner.close();
    await wire.close();
  }
});

test("reply validation rejects malformed coordinates, topology indexes and mismatched predecessor kinds", async () => {
  const owner = new DocumentOwner(),
    kernel = new SolidCalculator();
  try {
    const body = await prism(owner, square);
    const input = {
      kind: "transform" as const,
      bodies: [body],
      ids: [body.id],
      pivot: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 0,
      translation: [1, 0, 0] as [number, number, number],
      duplicate: false,
    };
    const reply = await kernel.calculate(input);
    const changes: ((reply: KernelResult) => void)[] = [
      (reply) => {
        reply.results[0].center[0] = Number.NaN;
      },
      (reply) => {
        reply.results[0].faces[0].vertices[0] = Number.POSITIVE_INFINITY;
      },
      (reply) => {
        reply.results[0].faces[0].edgeIndexes[0] = -1;
      },
      (reply) => {
        reply.results[0].faces[0].offsetFaceIndexes = [999];
      },
      (reply) => {
        reply.results[0].faces[0].predecessors = [body.edges[0].id];
      },
      (reply) => {
        reply.results[0].predecessorBodies = ["missing"];
      },
      (reply) => {
        reply.participants = ["missing"];
      },
      (reply) => {
        reply.participants.push(reply.participants[0]);
      },
      (reply) => {
        reply.results[0].bounds[3] = -100;
      },
      (reply) => {
        reply.results[0].edges[0].signature.pop();
      },
    ];
    for (const change of changes) {
      const damaged = structuredClone(reply);
      change(damaged);
      assert.throws(() => readKernelReply(input, damaged), /Invalid solid kernel reply/);
    }
    for (const value of [null, [], {}, { mode: "new", participants: [], results: [{}] }])
      assert.throws(() => readKernelReply(input, value), /Invalid solid kernel reply/);
  } finally {
    owner.close();
    kernel.close();
    await kernel.cancel();
  }
});

test("real query replies validate witnesses, topology references and required output fields", async () => {
  const owner = new DocumentOwner(),
    kernel = new SolidCalculator();
  try {
    const body = await prism(owner, square),
      bodies = [body];
    const topologyInput = { kind: "topology" as const, body: body.id, bodies };
    const topology = await kernel.calculate(topologyInput);
    const missingEdge = structuredClone(topology);
    missingEdge.topology.faces[0].loops[0].edges[0].edge = "missing";
    assert.throws(() => readKernelReply(topologyInput, missingEdge), /wire edge/);
    const wrongBody = structuredClone(topology);
    wrongBody.topology.body = "missing";
    assert.throws(() => readKernelReply(topologyInput, wrongBody), /topology body/);
    const duplicate = structuredClone(topology);
    duplicate.topology.faces[1].id = duplicate.topology.faces[0].id;
    assert.throws(() => readKernelReply(topologyInput, duplicate), /duplicate correspondence/);
    const caps = body.faces.filter(
      (face) => face.plane && Math.abs(face.plane.u[2]) + Math.abs(face.plane.v[2]) < 1e-7,
    );
    const measureInput = {
      kind: "measure" as const,
      bodies,
      curves: [],
      profiles: [],
      planes: [],
      targets: caps.map((face) => ({ kind: "face" as const, body: body.id, face: face.id })),
    };
    const measured = await kernel.calculate(measureInput);
    assert.ok(measured.measurement.distance);
    measured.measurement.distance.points[0][0] = Number.POSITIVE_INFINITY;
    assert.throws(() => readKernelReply(measureInput, measured), /finite number/);
    assert.throws(
      () => readKernelReply(measureInput, { mode: "new", participants: [], results: [] }),
      /object/,
    );
    const sectionInput = {
      kind: "sections" as const,
      bodies,
      frame: { ...planes.XY, origin: [0, 0, 5] as [number, number, number] },
    };
    const sections = await kernel.calculate(sectionInput);
    const foreign = structuredClone(sections);
    foreign.sections[0].body = "missing";
    assert.throws(() => readKernelReply(sectionInput, foreign), /section body/);
    const curve = sections.sections[0].curves[0];
    assert.equal(curve.kind, "segment");
    if (curve.kind !== "segment") throw new Error("Prism section should be linear");
    curve.a.x = Number.NaN;
    assert.throws(() => readKernelReply(sectionInput, sections), /finite number/);
    const selectionInput = {
      kind: "edge-finish-selection" as const,
      mode: "fillet" as const,
      edges: [{ body: body.id, edge: body.edges[0].id }],
      bodies,
    };
    assert.throws(
      () =>
        readKernelReply(selectionInput, {
          edgeSelection: [{ body: body.id, edge: body.faces[0].id }],
        }),
      /selected edge/,
    );
  } finally {
    owner.close();
    kernel.close();
    await kernel.cancel();
  }
});
