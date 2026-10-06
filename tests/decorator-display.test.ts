import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { PreviewOverlaySurfaces } from "../src/decorators/preview-overlay-surfaces.js";
import type { DisplayDocument } from "../src/model/display-document.js";
import {
  decoratorAppearance,
  decoratorDisplay,
  decoratorKind,
  resetDecoratorDisplay,
  setDecoratorDisplay,
} from "../src/preferences/decorator-display.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { hasForegroundContent } from "../src/sketch/world-foreground.js";

const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0];
function documentAt(x = 0): DisplayDocument {
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

test("display preferences normalize invalid storage independently of document data", () => {
  resetDecoratorDisplay();
  const next = decoratorDisplay();
  next.mode = "color-only";
  next.types.threads = { color: "#123456", opacity: 0.4 };
  next.types.gear = { color: "invalid", opacity: 20 };
  setDecoratorDisplay(next);
  assert.equal(decoratorDisplay().mode, "color-only");
  assert.deepEqual(decoratorAppearance("freac.threads"), { color: "#123456", opacity: 0.4 });
  assert.equal(decoratorAppearance("freac.gear").opacity, 1);
  assert.equal(decoratorKind("other.threads"), "custom");
  next.types.threads.color = "#000000";
  assert.equal(decoratorAppearance("freac.threads").color, "#123456");
  resetDecoratorDisplay();
});

function previewScene() {
  const scene = new THREE.Scene();
  const hidden = new Set<string>();
  const editor = {
    bodiesVisible: true,
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
    hidden,
    overlay,
    group: scene.children[0],
    foreground: editor.world.renderForegroundOverlays,
  };
}
const signature = (value: string) => new Map([["decorator", value]]);

test("parameter drafts reuse trimmed faces and current decorator type controls their appearance", () => {
  const { overlay, group } = previewScene();
  try {
    const initial = documentAt();
    overlay.sync(signature("original"), initial);
    assert.equal(group.children.length, 2);
    const initialMeshes = [...group.children];
    overlay.sync(signature("parameters"), initial);
    assert.deepEqual(
      group.children,
      initialMeshes,
      "Parameter drafts reuse unchanged trimmed-face geometry",
    );
    overlay.sync(signature("type"), {
      ...initial,
      decorators: initial.decorators?.map((instance) => ({
        ...instance,
        definition: "freac.gear",
      })),
    });
    assert.deepEqual(group.children, initialMeshes);
    assert.equal(
      (
        (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
      ).color.getHexString(),
      decoratorAppearance("freac.gear").color.slice(1),
      "Reused support geometry takes the current decorator type's appearance",
    );
  } finally {
    overlay.dispose();
  }
});

test("current-face fallback follows placement, isolates body visibility, and rejects stale meshes", () => {
  const { scene, hidden, overlay, group, foreground } = previewScene();
  try {
    assert.equal(hasForegroundContent(scene, foreground), false);
    overlay.sync(signature("original"), documentAt());
    assert.equal(group.children.length, 2);
    assert.equal(
      hasForegroundContent(scene, foreground),
      true,
      "Fallback faces need foreground rendering without a base body",
    );
    hidden.add("a");
    hidden.add("b");
    overlay.updateVisibility();
    assert.equal(
      hasForegroundContent(scene, foreground),
      false,
      "Hidden attachments need no foreground pass",
    );
    hidden.clear();
    hidden.add("b");
    overlay.sync(signature("original"), documentAt());
    assert.deepEqual(
      group.children.filter((mesh) => mesh.visible).map((mesh) => mesh.userData.body),
      ["a"],
    );
    const old = group.children[0];
    overlay.sync(signature("moved"), documentAt(5));
    assert.ok(!group.children.includes(old));
    const geometry = (group.children[0] as THREE.Mesh).geometry;
    assert.equal(geometry.attributes.position.getX(0), 5);
    overlay.replace(
      [
        {
          id: "decorator",
          body: "a",
          faces: [{ body: "a", face: "face" }],
          positions: new Float32Array(vertices),
          indices: new Uint32Array([0, 1, 2]),
        },
      ],
      ["decorator"],
      signature("original"),
      signature("moved"),
    );
    assert.ok(group.children.every((mesh) => mesh.userData.previewFallback));
    hidden.clear();
    overlay.replace(
      [
        {
          id: "decorator",
          body: "a",
          faces: [{ body: "a", face: "face" }],
          positions: new Float32Array(vertices.map((v, i) => (i % 3 === 0 ? v + 5 : v))),
          indices: new Uint32Array([0, 1, 2]),
        },
      ],
      ["decorator"],
      signature("moved"),
      signature("moved"),
    );
    assert.deepEqual(
      group.children
        .filter((mesh) => mesh.visible && mesh.userData.previewFallback)
        .map((mesh) => mesh.userData.body),
      ["b"],
      "A partial mesh only replaces its own body's fallback",
    );
    overlay.sync(new Map(), { ...documentAt(), decorators: [] });
    assert.equal(group.children.length, 0);
    assert.equal(hasForegroundContent(scene, foreground), false);
  } finally {
    overlay.dispose();
    resetDecoratorDisplay();
  }
  assert.equal(scene.children.length, 0);
});

test("vertex-only generated results retain the attachment marker until drawable triangles arrive", () => {
  const { overlay, group } = previewScene();
  try {
    overlay.sync(signature("current"), documentAt());
    const mesh = {
      id: "decorator",
      body: "a",
      faces: [{ body: "a", face: "face" }],
      positions: new Float32Array(vertices),
      indices: new Uint32Array(),
    };
    overlay.replace([mesh], ["decorator"], signature("current"), signature("current"));
    assert.deepEqual(
      group.children.filter((child) => child.visible).map((child) => child.userData.body),
      ["a", "b"],
      "A custom preview may return vertices without triangles; both markers remain visible",
    );
    assert.ok(
      group.children
        .filter((child) => child.visible)
        .every((child) => child.userData.previewFallback),
    );
    overlay.replace(
      [{ ...mesh, indices: new Uint32Array([0, 1, 2]) }],
      ["decorator"],
      signature("current"),
      signature("current"),
    );
    assert.equal(
      group.children.filter((child) => child.visible && child.userData.previewFallback).length,
      1,
    );
    assert.equal(
      group.children.filter((child) => child.visible && child.userData.previewCurrent).length,
      1,
    );
    overlay.sync(signature("next"), documentAt(2));
    assert.ok(group.children.every((child) => child.userData.previewFallback));
  } finally {
    overlay.dispose();
  }
});
