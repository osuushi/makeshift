import * as THREE from "three";
import { threadRadius } from "../src/decorators/thread-mesh.js";
import { threadNormalGLSL } from "../src/decorators/thread-normal-glsl.js";
import { threadNormalUniforms } from "../src/decorators/thread-normal-surface.js";
import { threadDefaults, threadSettings } from "../src/decorators/thread-settings.js";
import type { ThreadNormalParameters } from "../src/decorators/thread-texture.js";

// Execute the actual GLSL and compare against finite differences of export geometry.
export function threadNormalChecks() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(1, 1);
  const target = new THREE.WebGLRenderTarget(1, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  const material = new THREE.ShaderMaterial({
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `${threadNormalGLSL}\nuniform vec3 samplePoint;
      void main() { gl_FragColor = vec4(threadNormal(samplePoint) * 0.5 + 0.5, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);
  let samples = 0;
  try {
    for (const profile of ["triangle", "metric", "rounded"] as const)
      for (const cut of ["rod", "hole"] as const)
        for (const hand of ["right", "left"] as const)
          for (const outward of [1, -1] as const) {
            const parameters: ThreadNormalParameters = {
              frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
              radius: 8,
              outward,
              bounds: [0, 10],
              settings: threadSettings({
                ...threadDefaults(16),
                profile,
                cut,
                hand,
                pitch: 1,
                tipTruncation: 0.1,
                clearance: 0.15,
                startTaper: 0.5,
                endTaper: 0.5,
              }),
            };
            for (const z of [0.07, 0.27, 2.137, 5.381, 9.71, 9.93])
              for (const angle of [-3.13, -1.17, 0.23, 2.51]) {
                const point = new THREE.Vector3(8 * Math.cos(angle), 8 * Math.sin(angle), z);
                const uniforms = {
                  ...threadNormalUniforms(parameters),
                  samplePoint: { value: point },
                };
                for (const [key, uniform] of Object.entries(uniforms)) {
                  if (material.uniforms[key]) material.uniforms[key].value = uniform.value;
                  else material.uniforms[key] = uniform;
                }
                renderer.setRenderTarget(target);
                renderer.render(scene, camera);
                const bytes = new Uint8Array(4);
                renderer.readRenderTargetPixels(target, 0, 0, 1, 1, bytes);
                const expected = numericalNormal(parameters, angle, z);
                const actual = Array.from(bytes.slice(0, 3), (x) => (2 * x) / 255 - 1);
                if (actual.some((x, i) => Math.abs(x - expected[i]) > 0.012))
                  throw new Error(
                    `Thread normal mismatch ${profile}/${cut}/${hand}/${outward} at ${angle},${z}: ${actual} vs ${expected}`,
                  );
                samples++;
              }
          }
    return { samples };
  } finally {
    mesh.geometry.dispose();
    material.dispose();
    target.dispose();
    renderer.dispose();
  }
}

function numericalNormal(p: ThreadNormalParameters, angle: number, z: number) {
  const radius = (a: number, h: number) =>
    threadRadius(p.radius, a, h, p.settings, p.outward, p.bounds);
  const epsilon = 1e-5;
  const r = radius(angle, z);
  const da = (radius(angle + epsilon, z) - radius(angle - epsilon, z)) / (2 * epsilon);
  const dz = (radius(angle, z + epsilon) - radius(angle, z - epsilon)) / (2 * epsilon);
  return new THREE.Vector3(
    Math.cos(angle) + (da / r) * Math.sin(angle),
    Math.sin(angle) - (da / r) * Math.cos(angle),
    -dz,
  )
    .normalize()
    .multiplyScalar(p.outward)
    .toArray();
}
