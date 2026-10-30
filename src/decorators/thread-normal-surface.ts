import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";
import { decoratorPreviewLayer } from "./preview-compositor.js";
import { threadNormalGLSL } from "./thread-normal-glsl.js";
import { threadDepth } from "./thread-settings.js";
import type { PackedThreadTexture, ThreadNormalParameters } from "./thread-texture.js";

export function threadNormalUniforms(parameters: ThreadNormalParameters) {
  const { radius, outward, settings, bounds } = parameters;
  const depth = threadDepth(settings);
  return {
    threadDimensions: {
      value: new THREE.Vector4(radius, settings.pitch, depth, outward < 0 ? settings.clearance : 0),
    },
    threadShape: {
      value: new THREE.Vector4(
        settings.profile === "triangle" ? 0 : settings.profile === "metric" ? 1 : 2,
        settings.cut === "rod" ? -1 : 1,
        settings.hand === "right" ? 1 : -1,
        outward,
      ),
    },
    threadEnds: { value: new THREE.Vector4(...bounds, settings.startTaper, settings.endTaper) },
    threadTip: { value: settings.tipTruncation / depth },
  };
}

export function threadNormalSurface(
  texture: PackedThreadTexture,
  material: THREE.MeshStandardMaterial,
  id: string,
) {
  const { frame } = texture.parameters;
  const axis = cross(frame.u, frame.v);
  const coordinates = new Float32Array(texture.positions.length);
  for (let i = 0; i < texture.positions.length; i += 3) {
    const point = subtract(Array.from(texture.positions.slice(i, i + 3)) as Vector, frame.origin);
    coordinates.set([dot(point, frame.u), dot(point, frame.v), dot(point, axis)], i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(texture.positions, 3));
  geometry.setAttribute("threadPoint", new THREE.BufferAttribute(coordinates, 3));
  geometry.computeVertexNormals();
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    Object.assign(shader.uniforms, threadNormalUniforms(texture.parameters), {
      threadBasis: {
        value: new THREE.Matrix3().set(
          ...([
            frame.u[0],
            frame.v[0],
            axis[0],
            frame.u[1],
            frame.v[1],
            axis[1],
            frame.u[2],
            frame.v[2],
            axis[2],
          ] as [number, number, number, number, number, number, number, number, number]),
        ),
      },
    });
    shader.vertexShader =
      `attribute vec3 threadPoint; varying vec3 vThreadPoint;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvThreadPoint = threadPoint;",
      );
    shader.fragmentShader =
      `varying vec3 vThreadPoint; uniform mat3 threadBasis; uniform mat3 normalMatrix;\n${threadNormalGLSL}\n${shader.fragmentShader}`.replace(
        "#include <normal_fragment_maps>",
        "normal = normalize(normalMatrix * threadBasis * filteredThreadNormal(vThreadPoint)) * faceDirection;",
      );
  };
  material.customProgramCacheKey = () => `${cacheKey}/analytic-thread-normal-v1`;
  material.roughness = 0.28;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.body = texture.body;
  mesh.userData.decorator = id;
  mesh.userData.previewCurrent = true;
  mesh.userData.previewTexture = true;
  mesh.raycast = () => {};
  mesh.layers.set(decoratorPreviewLayer);
  return mesh;
}
