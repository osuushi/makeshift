import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { BodyPickProbe } from "../src/model/body-picking.js";
import { faceRayHits, screenRay } from "../src/model/body-ray-hits.js";
import { edgeRayHits, pickBodyEdge } from "../src/model/edge-selection.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { pickingEditor } from "./body-picking-fixtures.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("ordinary edge picking excludes a covered support that the all-depth chooser retains", async () => {
  const owner = new DocumentOwner();
  try {
    const front = await prism(owner, square);
    const rear = await lift(owner, {
      ...emptySketch({ ...planes.XY, origin: [0, 0, -20] }),
      curves: structuredClone(owner.view.data.sketches[0].curves),
    });
    const editor = pickingEditor([rear, front]);
    const p = editor.world.project([0, 10, 10]);
    const all = edgeRayHits(editor, p, [rear, front]);
    assert.ok(all.some((hit) => hit.body === front.id));
    assert.ok(all.some((hit) => hit.body === rear.id));
    assert.equal(pickBodyEdge(editor, p)?.body, front.id);
    const clipped = pickingEditor(
      [rear, front],
      [0, 0, 100],
      [new THREE.Plane(new THREE.Vector3(0, 0, -1), -1)],
    );
    assert.equal(pickBodyEdge(clipped, p)?.body, rear.id);
    const cutPlanes = clipped.world.renderer.clippingPlanes;
    clipped.world.clippingAt = (screen) => (screen.x > 700 ? cutPlanes : []);
    assert.equal(
      new BodyPickProbe(clipped, clipped.world.project([5, 10, 10])).faces()[0]?.body,
      front.id,
      "Outside aperture probes ordinary front geometry",
    );
    assert.equal(
      new BodyPickProbe(clipped, clipped.world.project([15, 10, 10])).faces()[0]?.body,
      rear.id,
      "Inside aperture probes clipped rear geometry",
    );
    const hidden = pickingEditor([rear, front], [0, 0, 100], [], [front.id]);
    assert.equal(pickBodyEdge(hidden, p)?.body, rear.id);
  } finally {
    owner.close();
  }
});

test("native cylindrical picking rejects missed bounds and reduces nearby edge intersection work", async (context) => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [10, 6]);
    const editor = pickingEditor([body], [30, -50, 40]);
    const original = THREE.Ray.prototype.intersectTriangle;
    let intersections = 0;
    context.mock.method(
      THREE.Ray.prototype,
      "intersectTriangle",
      function (this: THREE.Ray, ...args: Parameters<typeof original>) {
        intersections++;
        return original.apply(this, args);
      },
    );
    const started = performance.now();
    let selected = 0;
    for (const edge of body.edges) {
      const p = editor.world.project(new THREE.Vector3().fromArray(edge.points).toArray());
      if (pickBodyEdge(editor, p)) selected++;
    }
    const triangles = body.faces.reduce((sum, face) => sum + face.vertices.length / 9, 0);
    console.log({
      triangles,
      probes: body.edges.length,
      intersections,
      selected,
      milliseconds: performance.now() - started,
    });
    assert.ok(selected);
    assert.ok(
      intersections < triangles * body.edges.length,
      "bounded queries avoid repeated whole-body scans",
    );
    intersections = 0;
    assert.deepEqual(
      faceRayHits([body], screenRay(editor, { x: 20, y: 20 }), editor.world.camera.position),
      [],
    );
    console.log({ missIntersections: intersections });
    assert.equal(intersections, 0, "a missed face bound needs no triangle intersection");
    const screen = editor.world.project([0, 0, 10]);
    const probe = new BodyPickProbe(editor, screen);
    const first = probe.faces();
    const once = intersections;
    assert.equal(probe.faces({ ...screen }), first);
    assert.equal(intersections, once, "same screen probe reuses its exact result");
  } finally {
    context.mock.restoreAll();
    owner.close();
  }
});
