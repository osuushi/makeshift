import type * as THREE from "three";

/** Screen-space warning stripes stay legible at any model scale and need no face UVs. */
export function decoratorErrorMaterial(material: THREE.MeshStandardMaterial): void {
  const warning = { value: 0 };
  material.userData.decoratorWarning = warning;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.decoratorWarning = warning;
    shader.fragmentShader = `uniform float decoratorWarning;\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
if (decoratorWarning > 0.5) {
  float stripe = step(0.76, fract((gl_FragCoord.x + gl_FragCoord.y) / 24.0));
  vec3 red = mix(vec3(0.78, 0.08, 0.07), vec3(1.0, 0.32, 0.22), decoratorWarning - 1.0);
  diffuseColor.rgb = mix(red, vec3(1.0, 0.82, 0.55), stripe);
}`,
    );
  };
  material.customProgramCacheKey = () => `${key}-decorator-warning`;
}

export function setDecoratorError(
  material: THREE.MeshStandardMaterial,
  invalid: boolean,
  selected: boolean,
): void {
  material.userData.decoratorWarning.value = invalid ? (selected ? 2 : 1) : 0;
}
