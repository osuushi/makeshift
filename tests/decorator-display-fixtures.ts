import * as THREE from "three";
import { PreviewOverlaySurfaces } from "../src/decorators/preview-overlay-surfaces.js";
import type { DisplayDocument } from "../src/model/display-document.js";
import type { SketchEditor } from "../src/sketch/editor.js";

export const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0];
export function documentAt(x = 0): DisplayDocument {
  return {
    units: "mm",
    sketches: [],
    bodies: ["a", "b"].map((id) => ({
      id,
      faces: [
        {
          id: "face",
          vertices: vertices.map((v, i) => (i % 3 === 0 ? v + x : v)),
          edges: [],
          signature: [],
          plane: null,
        },
      ],
      edges: [],
      center: [x, 0, 0],
      volume: 1,
      bounds: [x, 0, 0, x + 1, 1, 0],
    })),
    decorators: [
      {
        id: "decorator",
        definition: "example.custom",
        version: 1,
        faces: ["a", "b"].map((body) => ({ body, face: "face" })),
        settings: {},
        frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
      },
    ],
  };
}

export function previewScene() {
  const scene = new THREE.Scene();
  const hidden = new Set<string>();
  const editor = {
    bodiesVisible: true,
    interactions: {
      current: {
        visualPreview: null as import("../src/model/visual-preview.js").VisualPreview | null,
      },
    },
    visibility: { visible: (body: string) => !hidden.has(body) },
    world: {
      scene,
      renderOverlays: new Set(),
      renderForegroundOverlays: new Set(),
      requestDraw() {},
    },
  } as unknown as SketchEditor;
  const overlay = new PreviewOverlaySurfaces(editor);
  return {
    scene,
    editor,
    hidden,
    overlay,
    group: scene.children[0],
    foreground: editor.world.renderForegroundOverlays,
  };
}
export const signature = (value: string) => new Map([["decorator", value]]);
