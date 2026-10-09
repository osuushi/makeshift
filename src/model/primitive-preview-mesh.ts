import * as THREE from "three";

/** Opaque shading and depth-tested contours keep front/back orientation unambiguous. */
export function primitivePreviewMesh(geometry: THREE.BufferGeometry, color = "#a6e8ae") {
  const solid = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  const silhouette = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: "#28643a",
      side: THREE.BackSide,
    }),
  );
  silhouette.scale.setScalar(1.012);
  silhouette.renderOrder = -1;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 25),
    new THREE.LineBasicMaterial({ color: "#28643a" }),
  );
  solid.add(silhouette, edges);
  return {
    solid,
    dispose: () => {
      geometry.dispose();
      solid.material.dispose();
      silhouette.material.dispose();
      edges.geometry.dispose();
      edges.material.dispose();
    },
  };
}
