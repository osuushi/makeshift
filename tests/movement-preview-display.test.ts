import assert from "node:assert/strict";
import test from "node:test";
import { documentAt, previewScene, signature, vertices } from "./decorator-display-fixtures.js";

test("early movement hides generated and fallback decorators only on replaced operands", () => {
  const { editor, group, overlay } = previewScene();
  try {
    overlay.sync(signature("current"), documentAt());
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
      signature("current"),
      signature("current"),
    );
    assert.ok(group.children.some((mesh) => mesh.visible && mesh.userData.body === "a"));
    assert.ok(editor.interactions.current);
    editor.interactions.current.visualPreview = { replaces: ["a"], bodies: [] };
    overlay.updateVisibility();
    assert.ok(
      group.children.filter((mesh) => mesh.userData.body === "a").every((mesh) => !mesh.visible),
    );
    assert.ok(group.children.some((mesh) => mesh.visible && mesh.userData.body === "b"));
    editor.interactions.current.visualPreview = null;
    overlay.updateVisibility();
    assert.ok(group.children.some((mesh) => mesh.visible && mesh.userData.body === "a"));
  } finally {
    overlay.dispose();
  }
});
