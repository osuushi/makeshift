import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { stableClipping } from "../sketch/stable-clipping.js";

export function faceGeometry(vertices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  // Weld inside each face before computing normals; retain sharp boundaries between faces.
  const smooth = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  smooth.computeVertexNormals();
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
