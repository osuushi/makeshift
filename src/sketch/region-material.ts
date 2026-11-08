import * as THREE from "three";
import { stableClipping } from "./stable-clipping.js";

// Keep grid spacing in a readable range while anchoring lines to the sketch plane.
export const regionGridSpacing = (unitsPerPixel: number): number =>
  2 ** Math.round(Math.log2(unitsPerPixel * 16));

/** Plane-local grid, clipped by the same triangles and depth as the sketch fill. */
export function regionMaterial(
  baseOpacity: number,
  options: THREE.MeshBasicMaterialParameters,
): THREE.MeshBasicMaterial {
  const material = stableClipping(
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      ...options,
    }),
  );
  const clip = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    clip.call(material, shader, renderer);
    shader.uniforms.regionBaseOpacity = { value: baseOpacity };
    shader.vertexShader = `varying vec2 regionPoint;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      // Separate the region pattern visually from the workspace coordinate grid.
      regionPoint = vec2(uv.x + uv.y, uv.y - uv.x) * 0.70710678;`,
    );
    shader.fragmentShader = `varying vec2 regionPoint;
      uniform float regionBaseOpacity;
      ${shader.fragmentShader}`.replace(
      "#include <opaque_fragment>",
      `vec2 cell = regionPoint;
      vec2 pixel = max(fwidth(cell), vec2(0.00001));
      vec2 distanceToLine = abs(fract(cell + 0.5) - 0.5) / pixel;
      vec2 grid = (1.0 - smoothstep(vec2(0.0), vec2(1.0), distanceToLine))
        * (1.0 - smoothstep(vec2(0.2), vec2(0.45), pixel));
      diffuseColor.a = mix(regionBaseOpacity, diffuseColor.a, max(grid.x, grid.y));
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => "sketch-region-grid";
  return material;
}
