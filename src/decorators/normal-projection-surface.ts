import * as THREE from "three";
import type { PackedNormalProjection } from "./normal-projection.js";
import { decoratorPreviewLayer } from "./preview-compositor.js";

export function normalProjectionSurface(
  projection: PackedNormalProjection,
  material: THREE.MeshStandardMaterial,
  id: string,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(projection.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(projection.uv, 2));
  geometry.computeVertexNormals();
  const texture = new THREE.DataTexture(projection.normals, projection.size, projection.size);
  texture.wrapS = projection.wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = projection.mipmaps;
  texture.minFilter = projection.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.needsUpdate = true;
  material.normalMap = texture;
  material.normalMapType = THREE.ObjectSpaceNormalMap;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.body = projection.body;
  mesh.userData.decorator = id;
  mesh.userData.previewCurrent = true;
  mesh.userData.previewTexture = true;
  mesh.raycast = () => {};
  mesh.layers.set(decoratorPreviewLayer);
  return mesh;
}
