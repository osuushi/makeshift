import * as THREE from "three";

/** A modest world-space fade, scaled to the visible world height, independent of camera retreat. */
export function coordinateDepthOpacity(depth: number, viewHeight = 80): number {
  return 0.65 + 0.35 * Math.exp(-Math.max(0, depth) / (viewHeight * 2.5));
}
export const coordinateDepthFragment = `
  uniform float coordinateDepthDistance;
  float coordinateDepthFade(float depth) {
    return 0.65 + 0.35 * exp(-max(0.0, depth) / coordinateDepthDistance);
  }`;

/** Install only on canonical fills; construction/sketch planes keep their material. */
export function coordinatePlaneDepth(
  material: THREE.MeshBasicMaterial,
  camera: THREE.Camera,
  center: THREE.Vector3,
  viewHeight: () => number,
): void {
  const uniforms = {
    coordinateDepthDistance: { value: viewHeight() * 2.5 },
    coordinateViewCenter: { value: center },
    coordinateViewDirection: { value: new THREE.Vector3() },
  };
  const compile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform vec3 coordinateViewCenter;
      uniform vec3 coordinateViewDirection;
      varying float coordinateDepth;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      coordinateDepth = dot((modelMatrix * vec4(transformed, 1.0)).xyz -
        coordinateViewCenter, coordinateViewDirection);`,
    );
    shader.fragmentShader = `varying float coordinateDepth;
      ${coordinateDepthFragment}\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.a *= coordinateDepthFade(coordinateDepth);",
    );
  };
  material.onBeforeRender = () => {
    camera.getWorldDirection(uniforms.coordinateViewDirection.value);
    uniforms.coordinateDepthDistance.value = viewHeight() * 2.5;
  };
  material.customProgramCacheKey = () => "stable-clip-coordinate-depth";
}
