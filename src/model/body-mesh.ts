import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { stableClipping } from "../sketch/stable-clipping.js";

export function faceGeometry(vertices: number[], normals?: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  if (normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  // Weld matching corners, including supplied normals, without smoothing sharp boundaries.
  const smooth = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  if (!normals) smooth.computeVertexNormals();
  return smooth;
}
export function faceMaterial(): THREE.MeshStandardMaterial {
  return stableClipping(
    new THREE.MeshStandardMaterial({
      color: "#cad4df",
      roughness: 0.75,
      metalness: 0,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilRef: 2,
      stencilWriteMask: 6,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
}
