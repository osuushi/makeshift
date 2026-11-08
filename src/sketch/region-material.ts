import * as THREE from "three";
import { type PlaneFrame, planeNormal, type Vector } from "./planes.js";
import { stableClipping } from "./stable-clipping.js";

const hexRadiusPixels = 13; // CSS pixels on a face-on plane, from center to corner

/** Project world positions into a shared lattice for each unoriented plane normal. */
export function regionGridCoordinates(
  plane: PlaneFrame,
  unitsPerPixel: number,
): (point: Vector) => [number, number] {
  const normal = new THREE.Vector3(...planeNormal(plane)).normalize();
  const alignment = normal.toArray().map(Math.abs);
  // Treat near ties alike so rotating a sketch frame in its own plane cannot
  // change which world axis wins due to floating-point roundoff.
  const major = alignment.findIndex((value) => value >= Math.max(...alignment) - 1e-7);
  if (normal.getComponent(major) < 0) normal.negate();
  const minor = alignment.findIndex((value) => value <= Math.min(...alignment) + 1e-7);
  const u = new THREE.Vector3().setComponent(minor, 1);
  u.addScaledVector(normal, -u.dot(normal))
    .normalize()
    .divideScalar(hexRadiusPixels * unitsPerPixel);
  const v = new THREE.Vector3().crossVectors(normal, u);
  const position = new THREE.Vector3();
  // Dotting world positions with the axes anchors the pattern to the projected
  // world origin, even when the sketch lies on an offset plane.
  return (point) => {
    position.fromArray(point);
    return [position.dot(u), position.dot(v)];
  };
}

/** Hex grid clipped by the same triangles and depth as the sketch fill. */
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
      regionPoint = uv;`,
    );
    shader.fragmentShader = `varying vec2 regionPoint;
      uniform float regionBaseOpacity;
      ${shader.fragmentShader}`.replace(
      "#include <opaque_fragment>",
      `// Hex centers are two staggered rectangular lattices.
      const float root3 = 1.7320508;
      const vec2 period = vec2(root3, 3.0);
      vec2 a = mod(regionPoint + period * 0.5, period) - period * 0.5;
      vec2 b = mod(regionPoint, period) - period * 0.5;
      vec2 nearest = abs(dot(a, a) < dot(b, b) ? a : b);
      float edge = root3 * 0.5 - max(nearest.x, dot(nearest, vec2(0.5, root3 * 0.5)));
      vec2 footprint = fwidth(regionPoint);
      float pixel = max(max(footprint.x, footprint.y), 0.00001);
      float line = (1.0 - smoothstep(0.0, pixel, edge))
        * (1.0 - smoothstep(0.2, 0.65, pixel));
      diffuseColor.a = mix(regionBaseOpacity, diffuseColor.a, line);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => "sketch-region-hex-grid";
  return material;
}
