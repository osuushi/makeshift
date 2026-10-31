import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { previewFaceKey } from "../src/decorators/preview-compositor.js";
import type { Body } from "../src/model/body.js";
import { BodyPickProbe } from "../src/model/body-picking.js";
import { edgeFacesCamera } from "../src/model/body-ray-hits.js";
import { pickBodyEdge } from "../src/model/edge-selection.js";
import { SelectionXray } from "../src/model/selection-xray.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { pickingEditor } from "./body-picking-fixtures.js";

type Fixture = {
  document: { bodies: Body[] };
  modelingSelection: ModelingTarget[];
  camera: { position: Vector; up: Vector; target: Vector };
};
const fixture = JSON.parse(
  readFileSync("tests/fixtures/internal-selection-xray.json", "utf8"),
) as Fixture;
const enclosed = JSON.parse(
  readFileSync("tests/fixtures/enclosed-selection-xray.json", "utf8"),
) as Fixture;

function harness(source = fixture) {
  const editor = pickingEditor(source.document.bodies, source.camera.position);
  Object.assign(editor, {
    modeling: { targets: source.modelingSelection },
    interactions: { current: null },
  });
  editor.world.camera.up.fromArray(source.camera.up);
  editor.world.camera.lookAt(new THREE.Vector3(...source.camera.target));
  editor.world.camera.updateMatrixWorld();
  const xray = new SelectionXray();
  editor.world.selectionXray = () => xray.read(editor);
  editor.world.selectionRevealed = () => true;
  return { editor, xray, body: source.document.bodies[0] };
}

test("blind hole keeps its wall, end cap and opening annulus in one shaded neighborhood", () => {
  const { editor, xray, body } = harness();
  const original = JSON.stringify(editor.display);
  const reveal = xray.read(editor);
  assert.ok(reveal);
  assert.deepEqual(
    [...reveal.faces],
    [0, 2].map((index) => previewFaceKey(body.id, body.faces[index].id)),
  );
  for (const index of [1, 3, 4])
    assert.equal(
      reveal.faces.has(previewFaceKey(body.id, body.faces[index].id)),
      false,
      "Wall and its bordering faces stay shaded",
    );
  assert.equal(
    reveal.edges.has(previewFaceKey(body.id, body.edges[3].id)),
    false,
    "Cavity rim stays visible",
  );
  assert.equal(
    xray.read(editor),
    reveal,
    "Stationary paint reuses neighborhood and aperture geometry",
  );
  const point = editor.world.project([-4.5355, -3.0355, -10.1]);
  const probe = new BodyPickProbe(editor, point);
  assert.equal(
    probe.faces()[0]?.face,
    body.faces[3].id,
    "Visible revealed wall receives ordinary clicks",
  );
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

test("orbit keeps one stable X-ray layer rather than switching whole faces at overlap thresholds", () => {
  const { editor, xray, body } = harness(enclosed);
  const reveal = xray.read(editor);
  assert.ok(reveal);
  const expected = [0, 1, 2].map((index) => previewFaceKey(body.id, body.faces[index].id));
  assert.deepEqual(
    [...reveal.faces],
    expected,
    "Only the enclosing shell fades; both cavity caps remain",
  );
  const rim = body.edges.find((edge) => body.faces[5].edges.includes(edge.id));
  assert.ok(rim);
  const radius = body.faces[3].cylinder?.radius ?? 0;
  const rimPoint: Vector = [0.5 + radius / Math.SQRT2, -radius / Math.SQRT2, 11.5];
  assert.equal(
    edgeFacesCamera(
      body,
      rim.id,
      rimPoint,
      editor.world.camera.getWorldDirection(new THREE.Vector3()),
    ),
    false,
  );
  assert.equal(
    pickBodyEdge(editor, editor.world.project(rimPoint))?.edge,
    rim.id,
    "The displayed cap rim is pickable on its revealed back side",
  );
  for (const degrees of [0, 0.1, 27.9, 28.1, 81.9, 82.1, 90, 180, 270]) {
    const angle = (degrees * Math.PI) / 180;
    editor.world.camera.position.set(
      (100 * Math.sin(angle)) / Math.SQRT2,
      (-100 * Math.sin(angle)) / Math.SQRT2,
      100 * Math.cos(angle),
    );
    editor.world.camera.lookAt(0, 0, 0);
    editor.world.camera.updateMatrixWorld();
    assert.equal(xray.read(editor), reveal, `No membership threshold at ${degrees} degrees`);
    assert.deepEqual([...reveal.faces], expected);
    for (const index of [3, 4, 5])
      assert.equal(reveal.faces.has(previewFaceKey(body.id, body.faces[index].id)), false);
  }
  editor.world.camera.zoom = 2;
  editor.world.camera.updateProjectionMatrix();
  assert.equal(xray.read(editor), reveal, "Zoom only reprojects the aperture");
  for (const [direction, cap] of [
    [1, 5],
    [-1, 4],
  ]) {
    editor.world.camera.position.set(0, 0, direction * 100);
    editor.world.camera.lookAt(0, 0, 0);
    editor.world.camera.updateMatrixWorld();
    const point = editor.world.project([0.5, 0, direction * 11.5]);
    assert.equal(
      new BodyPickProbe(editor, point).faces()[0]?.face,
      body.faces[cap].id,
      "Revealed end caps are clickable from outside the cavity as well as from inside",
    );
    editor.world.selectionRevealed = () => false;
    assert.equal(
      new BodyPickProbe(editor, point).faces()[0]?.face,
      body.faces[direction === 1 ? 2 : 1].id,
      "Outside the aperture retains normal exterior picking",
    );
    editor.world.selectionRevealed = () => true;
  }
});

test("neighborhood stays local to the actual selection and respects visibility and explicit sections", () => {
  const { editor, xray, body } = harness();
  editor.modeling.targets = [{ kind: "face", body: body.id, face: body.faces[4].id }];
  const cap = xray.read(editor);
  assert.ok(cap);
  assert.equal(
    cap.faces.has(previewFaceKey(body.id, body.faces[3].id)),
    false,
    "The directly bordering wall remains",
  );
  assert.equal(
    cap.faces.has(previewFaceKey(body.id, body.faces[1].id)),
    true,
    "Adjacency does not flood through the whole body",
  );
  editor.world.crossSection = planes.XY;
  assert.equal(xray.read(editor), null);
  editor.world.crossSection = null;
  editor.visibility.visible = () => false;
  assert.equal(xray.read(editor), null, "Hidden selections never reveal geometry");
  editor.visibility.visible = () => true;
  editor.modeling.targets = [{ kind: "body", body: body.id }];
  assert.equal(xray.read(editor), null, "Whole-body selection does not start a subgeometry reveal");
  editor.modeling.targets = [];
  assert.equal(xray.read(editor), null, "Deselect restores the ordinary view");
});
