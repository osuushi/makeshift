import * as THREE from "three";

/** World coordinates remain visible independently of plane-grid fading and opacity. */
export function createWorldAxes(scene: THREE.Scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(18);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const colors = ["#ca6470", "#43916b", "#5983c8"].flatMap((hex) => {
    const color = new THREE.Color(hex);
    return [...color.toArray(), ...color.toArray()];
  });
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  // Coordinate references stay independent of sketch and section clipping.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <clipping_planes_pars_vertex>", "")
      .replace("#include <clipping_planes_vertex>", "");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <clipping_planes_pars_fragment>", "")
      .replace("#include <clipping_planes_fragment>", "");
  };
  const axes = new THREE.LineSegments(geometry, material);
  axes.name = "world-coordinate-axes";
  axes.renderOrder = -9;
  scene.add(axes);
  return {
    update(camera: THREE.Camera, target: THREE.Vector3, height: number) {
      const aspect =
        camera instanceof THREE.OrthographicCamera
          ? (camera.right - camera.left) / (camera.top - camera.bottom)
          : 1;
      const direction = camera.getWorldDirection(new THREE.Vector3());
      for (let axis = 0; axis < 3; axis++) {
        const projectedLength = Math.sqrt(Math.max(0, 1 - direction.getComponent(axis) ** 2));
        const extent =
          target.length() + (height * Math.max(1, aspect) * 4) / Math.max(0.001, projectedLength);
        positions[axis * 6 + axis] = -extent;
        positions[axis * 6 + 3 + axis] = extent;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeBoundingSphere();
    },
    dispose() {
      scene.remove(axes);
      geometry.dispose();
      material.dispose();
    },
  };
}
