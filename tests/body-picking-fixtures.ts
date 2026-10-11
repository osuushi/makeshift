import * as THREE from "three";
import type { Body } from "../src/model/body.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import type { Point, Vector } from "../src/sketch/planes.js";

/** A camera/projector for model-space picking probes; UI acceptance uses the real World. */
export function pickingEditor(
  bodies: readonly Body[],
  position: Vector = [0, 0, 100],
  clipping: THREE.Plane[] = [],
  hidden: string[] = [],
): SketchEditor {
  const camera = new THREE.OrthographicCamera(-60, 60, 40, -40, 0.1, 1000);
  camera.position.fromArray(position);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const rect = { left: 0, top: 0, width: 1200, height: 800 };
  const project = (point: Vector): Point => {
    const p = new THREE.Vector3(...point).project(camera);
    return { x: ((p.x + 1) * rect.width) / 2, y: ((1 - p.y) * rect.height) / 2 };
  };
  return {
    bodiesVisible: true,
    display: { units: "mm", sketches: [], bodies },
    visibility: { visible: (id: string) => !hidden.includes(id) },
    world: {
      camera,
      project,
      canvas: { getBoundingClientRect: () => rect },
      renderer: { clippingPlanes: clipping },
      clippingAt: () => clipping,
      sectionEnabled: () => true,
      visiblePoint: (point: THREE.Vector3) =>
        clipping.every((plane) => plane.distanceToPoint(point) >= 0),
    },
  } as unknown as SketchEditor;
}
