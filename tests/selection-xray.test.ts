import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { previewFaceKey } from "../src/decorators/preview-compositor.js";
import type { Body, Face } from "../src/model/body.js";
import { BodyPickProbe } from "../src/model/body-picking.js";
import { selectionOccluders } from "../src/model/selection-occlusion.js";
import { SelectionXray } from "../src/model/selection-xray.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { pickingEditor } from "./body-picking-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/internal-selection-xray.json", "utf8")) as {
  document: { bodies: Body[] };
  modelingSelection: ModelingTarget[];
  camera: { position: Vector; up: Vector; target: Vector };
};

function harness() {
  const editor = pickingEditor(fixture.document.bodies, fixture.camera.position);
  Object.assign(editor, {
    modeling: { targets: fixture.modelingSelection },
    interactions: { current: null },
  });
  editor.world.camera.up.fromArray(fixture.camera.up);
  editor.world.camera.lookAt(new THREE.Vector3(...fixture.camera.target));
  editor.world.camera.updateMatrixWorld();
  const xray = new SelectionXray();
  editor.world.selectionXray = () => xray.read(editor);
  editor.world.selectionRevealed = () => true;
  return { editor, xray, body: fixture.document.bodies[0] };
}

test("captured closed-end hole reveals its wall and keeps rear cavity structure", () => {
  const { editor, xray, body } = harness();
  const original = JSON.stringify(editor.display);
  const reveal = xray.read(editor);
  assert.ok(reveal);
  assert.deepEqual(
    [...reveal.faces],
    [body.faces[0], body.faces[2], body.faces[4]].map((f) => previewFaceKey(body.id, f.id)),
  );
  assert.equal(
    reveal.faces.has(previewFaceKey(body.id, body.faces[3].id)),
    false,
    "Selected wall stays shaded",
  );
  assert.equal(
    reveal.faces.has(previewFaceKey(body.id, body.faces[1].id)),
    false,
    "Rear annulus stays depth-tested",
  );
  assert.equal(
    reveal.edges.has(previewFaceKey(body.id, body.edges[3].id)),
    false,
    "Cavity rim stays visible",
  );
  assert.equal(
    xray.read(editor),
    reveal,
    "Stationary hover/paint reuses occlusion and aperture geometry",
  );
  const point = editor.world.project([-4.5355, -3.0355, -6]);
  const probe = new BodyPickProbe(editor, point);
  assert.equal(probe.faces()[0]?.face, body.faces[3].id, "Revealed wall receives ordinary clicks");
  assert.notEqual(
    probe.faces(point, true)[0]?.face,
    body.faces[3].id,
    "Chooser keeps faded foreground faces",
  );
  editor.world.selectionRevealed = () => false;
  assert.notEqual(
    new BodyPickProbe(editor, point).faces()[0]?.face,
    body.faces[3].id,
    "Exterior keeps ordinary picking",
  );
  assert.equal(JSON.stringify(editor.display), original);
  editor.modeling.targets = [3, 4].map((index) => ({
    kind: "face",
    body: body.id,
    face: body.faces[index].id,
  }));
  assert.equal(
    xray.read(editor)?.masks.length,
    2,
    "Separate selected faces retain separate apertures",
  );
});

test("selection reveal follows orbit, visible exterior selection, hiding and explicit sections", () => {
  const { editor, xray, body } = harness();
  const first = xray.read(editor);
  editor.world.camera.position.set(0, 0, -100);
  editor.world.camera.up.set(0, 1, 0);
  editor.world.camera.lookAt(0, 0, 0);
  editor.world.camera.updateMatrixWorld();
  assert.equal(xray.read(editor), null, "Looking into the open hole needs no reveal");
  editor.modeling.targets = [{ kind: "face", body: body.id, face: body.faces[1].id }];
  assert.equal(xray.read(editor), null, "Visible exterior faces keep their normal presentation");
  editor.modeling.targets = fixture.modelingSelection;
  editor.world.camera.position.fromArray(fixture.camera.position);
  editor.world.camera.lookAt(new THREE.Vector3(...fixture.camera.target));
  editor.world.camera.updateMatrixWorld();
  assert.notEqual(xray.read(editor), first, "Orbit invalidates cached occlusion");
  assert.equal(
    xray.read(editor)?.masks[0].geometry,
    first?.masks[0].geometry,
    "Orbit reuses the selected geometry's ellipsoid fit",
  );
  editor.world.crossSection = planes.XY;
  assert.equal(xray.read(editor), null);
  editor.world.crossSection = null;
  editor.visibility.visible = () => false;
  assert.equal(xray.read(editor), null, "Hidden selections never reveal geometry");
  editor.visibility.visible = () => true;
  editor.modeling.targets = [];
  assert.equal(xray.read(editor), null, "Deselect restores the ordinary view");
});

test("projected overlap detects a tiny blocker between selected triangle vertices and centroid", () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.z = 20;
  camera.updateMatrixWorld();
  const face = (id: string, vertices: number[]): Face => ({
    id,
    vertices,
    edges: [],
    signature: [],
    plane: null,
  });
  const target = face("target", [-8, -8, 0, 8, -8, 0, 0, 8, 0]);
  const blocker = face("tiny", [1, 0, 1, 1.01, 0, 1, 1, 0.01, 1]);
  const behind = face("behind", [1, 0, -1, 1.01, 0, -1, 1, 0.01, -1]);
  const coplanar = face("coplanar", [1, 0, 0, 1.01, 0, 0, 1, 0.01, 0]);
  const body = { ...fixture.document.bodies[0], faces: [target, blocker, behind, coplanar] };
  assert.deepEqual(
    [...selectionOccluders([body], [{ body, faces: [target] }], camera)],
    [previewFaceKey(body.id, "tiny")],
  );
});
