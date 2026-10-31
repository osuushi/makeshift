import * as THREE from "three";
import type { Body } from "../src/model/body.js";
import { BodyDrawable } from "../src/model/body-drawable.js";
import { SelectionXray } from "../src/model/selection-xray.js";
import { setViewDisplay, viewDisplay } from "../src/preferences/view-display.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { SelectionXrayComposite } from "../src/sketch/selection-xray-composite.js";
import type { World } from "../src/sketch/world.js";

interface Fixture {
  document: { bodies: Body[] };
  modelingSelection: ModelingTarget[];
}

/** Face colors identify the two real cavity caps. GPU checks also straddle the
 * former whole-face switch, which a CPU neighborhood assertion cannot observe. */
function renderHarness(fixture: Fixture) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: true });
  renderer.setSize(256, 256);
  Object.assign(renderer.domElement.style, { position: "fixed", left: "-1000px", top: "0" });
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");
  const camera = new THREE.OrthographicCamera(-25, 25, 25, -25, 0.1, 1000);
  const body = fixture.document.bodies[0];
  const drawing = new BodyDrawable(body, { created: 0, disposed: 0 });
  const colors = ["#999999", "#999999", "#999999", "#2277cc", "#cc2211", "#11cc22"];
  for (const object of drawing.group.children) {
    const face = object.userData.bodyFace;
    if (face)
      (object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.set(
        colors[body.faces.findIndex((f) => f.id === face.face)],
      );
  }
  scene.add(drawing.group, new THREE.AmbientLight("white", 3));
  const world = { scene, camera, renderer, canvas: renderer.domElement } as World;
  const editor = {
    world,
    bodiesVisible: true,
    display: fixture.document,
    visibility: { visible: () => true, xray: new Set() },
    modeling: { targets: fixture.modelingSelection },
    interactions: { current: null },
  } as unknown as SketchEditor;
  const xray = new SelectionXray();
  world.selectionXray = () => xray.read(editor);
  const composite = new SelectionXrayComposite();
  const draw = (degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    camera.position.set(
      (100 * Math.sin(angle)) / Math.SQRT2,
      (-100 * Math.sin(angle)) / Math.SQRT2,
      100 * Math.cos(angle),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    composite.render(world, () => renderer.render(scene, camera));
  };
  const pixel = (point: number[]) => {
    const p = new THREE.Vector3().fromArray(point).project(camera),
      bytes = new Uint8Array(4);
    renderer
      .getContext()
      .readPixels(
        Math.floor((p.x + 1) * 128),
        Math.floor((p.y + 1) * 128),
        1,
        1,
        renderer.getContext().RGBA,
        renderer.getContext().UNSIGNED_BYTE,
        bytes,
      );
    return [...bytes].slice(0, 3);
  };
  return {
    draw,
    pixel,
    dispose: () => {
      composite.dispose();
      drawing.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function selectionXrayRenderChecks(fixture: Fixture) {
  const original = viewDisplay();
  const body = fixture.document.bodies[0];
  const { draw, pixel, dispose } = renderHarness(fixture);
  try {
    setViewDisplay({ ...original, bodyXrayOpacity: 0, xrayBleed: 50, xrayRadius: 20 });
    draw(0);
    const top = pixel([0.5, 0, 11.5]);
    if (top[1] < top[0] + 40) throw new Error(`Upper cavity cap is missing: ${top}`);
    draw(180);
    const bottom = pixel([0.5, 0, -11.5]);
    if (bottom[0] < bottom[1] + 40) throw new Error(`Lower cavity cap is missing: ${bottom}`);
    setViewDisplay({ ...viewDisplay(), bodyXrayOpacity: 0.25 });
    const radius = body.faces[0].cylinder?.radius ?? 15;
    const probe = [radius / Math.SQRT2, -radius / Math.SQRT2, 0];
    draw(27);
    const before = pixel(probe);
    draw(29);
    const after = pixel(probe);
    if (Math.max(...before.map((value, i) => Math.abs(value - after[i]))) > 5)
      throw new Error(`Shell X-ray jumps across the old threshold: ${before}; ${after}`);
    if (Math.min(...before) < 200)
      throw new Error(`The surrounding shell stayed opaque: ${before}`);
    return { top, bottom, before, after };
  } finally {
    setViewDisplay(original);
    dispose();
  }
}
