import assert from "node:assert/strict";
import test from "node:test";
import type * as THREE from "three";
import { projectPreviewNormals } from "../src/decorators/normal-projection.js";
import {
  decoratorAppearance,
  decoratorDisplay,
  decoratorKind,
  resetDecoratorDisplay,
  setDecoratorDisplay,
} from "../src/preferences/decorator-display.js";
import { hasForegroundContent } from "../src/sketch/world-foreground.js";
import { documentAt, previewScene, signature, vertices } from "./decorator-display-fixtures.js";

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

test("texture switches retain support silhouettes, ignore stale replies and dispose normal maps", () => {
  const { overlay, group } = previewScene();
  try {
    const document = documentAt();
    const next = decoratorDisplay();
    next.mode = "texture";
    setDecoratorDisplay(next);
    assert.equal(decoratorDisplay().mode, "texture");
    overlay.sync(signature("current"), document);
    const mesh = {
      id: "decorator",
      body: "a",
      faces: [{ body: "a", face: "face" }],
      positions: new Float32Array(vertices.map((v, i) => (i % 3 === 2 ? v + 0.2 : v))),
      indices: new Uint32Array([0, 1, 2]),
    };
    const projections = projectPreviewNormals(document, mesh, 16);
    overlay.replace(
      [{ ...mesh, projections }],
      ["decorator"],
      signature("current"),
      signature("current"),
    );
    const projected = group.children.find((child) => child.userData.previewTexture) as THREE.Mesh;
    assert.ok(projected.visible);
    assert.deepEqual([...projected.geometry.attributes.position.array], vertices);
    const map = (projected.material as THREE.MeshStandardMaterial).normalMap;
    assert.ok(map);
    let disposed = false;
    map.addEventListener("dispose", () => {
      disposed = true;
    });
    for (const mode of ["color-only", "detailed", "texture"] as const) {
      setDecoratorDisplay({ ...next, mode });
      overlay.updateVisibility();
      assert.equal(projected.visible, mode === "texture");
      assert.equal(
        group.children.filter((child) => child.visible && !child.userData.previewFallback).length,
        mode === "color-only" ? 0 : 1,
      );
    }
    overlay.sync(signature("moved"), documentAt(5));
    assert.ok(disposed);
    overlay.replace(
      [{ ...mesh, projections }],
      ["decorator"],
      signature("current"),
      signature("moved"),
    );
    assert.ok(group.children.every((child) => child.userData.previewFallback));
  } finally {
    overlay.dispose();
    resetDecoratorDisplay();
  }
});

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
        gearColor: "#de3489",
      })),
    });
    assert.deepEqual(group.children, initialMeshes);
    assert.equal(
      (
        (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
      ).color.getHexString(),
      "de3489",
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

test("gear group colors update generated and fallback surfaces independently", () => {
  const { overlay, group } = previewScene();
  const initial = documentAt();
  const template = initial.decorators?.[0];
  assert.ok(template);
  const gears = ["a", "b"].map((body, i) => ({
    ...template,
    id: body,
    definition: "freac.gear",
    gearGroup: body,
    gearColor: ["#de3489", "#3682ca"][i],
    faces: [{ body, face: "face" }],
  }));
  const signatures = new Map([
    ["a", "first"],
    ["b", "second"],
  ]);
  try {
    overlay.sync(signatures, { ...initial, decorators: gears });
    overlay.replace(
      gears.map((d) => ({
        id: d.id,
        body: d.id,
        faces: [...d.faces],
        positions: new Float32Array(vertices),
        indices: new Uint32Array([0, 1, 2]),
      })),
      ["a", "b"],
      signatures,
      signatures,
    );
    const meshes = [...group.children];
    overlay.sync(signatures, {
      ...initial,
      decorators: gears.map((d) => (d.id === "a" ? { ...d, gearColor: "#12abcd" } : d)),
    });
    assert.deepEqual(group.children, meshes, "A color refresh does not replace surface geometry");
    for (const mode of ["detailed", "color-only"] as const) {
      setDecoratorDisplay({ ...decoratorDisplay(), mode });
      overlay.updateVisibility();
      const visible = group.children.filter((m) => m.visible);
      assert.equal(visible.length, 2);
      for (const mesh of visible) {
        const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
        assert.equal(
          material.color.getHexString(),
          mesh.userData.body === "a" ? "12abcd" : "3682ca",
        );
      }
    }
  } finally {
    overlay.dispose();
    resetDecoratorDisplay();
  }
});
