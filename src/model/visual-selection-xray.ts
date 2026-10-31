import type * as THREE from "three";
import { previewFaceKey } from "../decorators/preview-compositor.js";
import type { SelectionReveal } from "./selection-xray.js";

interface Part {
  key: string;
  count: number;
}

/** Per-corner render flags preserve batching in the mesh-first preview. */
export function visualSelectionXray(
  object: THREE.Mesh | THREE.LineSegments,
  parts: Part[],
  kind: "faces" | "edges",
): void {
  object.userData.selectionXrayParts = { parts, kind };
}

export function installVisualSelectionXray(material: THREE.Material): void {
  const previous = material.onBeforeCompile;
  const enabled = { value: false };
  material.userData.selectionXrayEnabled = enabled;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.selectionXrayEnabled = enabled;
    shader.vertexShader =
      `attribute float selectionXrayHidden; varying float xrayHidden;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nxrayHidden = selectionXrayHidden;",
      );
    shader.fragmentShader =
      `uniform bool selectionXrayEnabled; varying float xrayHidden;\n${shader.fragmentShader}`.replace(
        "#include <alphatest_fragment>",
        "#include <alphatest_fragment>\nif (selectionXrayEnabled && xrayHidden > 0.5) discard;",
      );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}-selection-xray`;
}

/** Attributes change only with occlusion; the uniform distinguishes the two captures. */
export function enableVisualSelectionXray(
  object: THREE.Object3D,
  reveal: SelectionReveal,
): (() => void) | null {
  const input = object.userData.selectionXrayParts as
    | { parts: Part[]; kind: "faces" | "edges" }
    | undefined;
  if (!input) return null;
  const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  const enabled = mesh.material.userData.selectionXrayEnabled;
  if (!enabled) return null;
  const hidden = reveal[input.kind];
  if (object.userData.selectionXrayHidden !== hidden) {
    const attribute = mesh.geometry.getAttribute("selectionXrayHidden");
    const flags = attribute.array as Float32Array;
    let offset = 0;
    for (const part of input.parts) {
      flags.fill(Number(hidden.has(part.key)), offset, offset + part.count);
      offset += part.count;
    }
    attribute.needsUpdate = true;
    object.userData.selectionXrayHidden = hidden;
  }
  const previous = enabled.value;
  enabled.value = true;
  return () => {
    enabled.value = previous;
  };
}

export const visualPartKey = (body: string, index: number) => previewFaceKey(body, `${index}`);
