import * as THREE from "three";

/** Keep camera translation out of clipping arithmetic. A distant camera loses
 * the coplanar tolerance even when distances are computed at vertices. */
export function stableClipping<T extends THREE.Material>(material: T): T {
  const planes = { value: [] as THREE.Vector4[] };
  material.onBeforeRender = (renderer) => {
    const clipping = [
      ...renderer.clippingPlanes,
      ...(renderer.localClippingEnabled ? (material.clippingPlanes ?? []) : []),
    ];
    planes.value.length = clipping.length;
    clipping.forEach((plane, i) => {
      planes.value[i] ??= new THREE.Vector4();
      const value = planes.value[i];
      value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    });
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.worldClippingPlanes = planes;
    const point =
      "isLineMaterial" in material
        ? "( position.y < 0.5 ? instanceStart : instanceEnd )"
        : "transformed";
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <clipping_planes_pars_vertex>",
        `
#if NUM_CLIPPING_PLANES > 0
uniform vec4 worldClippingPlanes[ NUM_CLIPPING_PLANES ];
varying float vClipDistance[ NUM_CLIPPING_PLANES ];
#endif`,
      )
      .replace(
        "#include <clipping_planes_vertex>",
        `
#if NUM_CLIPPING_PLANES > 0
vec3 clippingWorldPosition = ( modelMatrix * vec4( ${point}, 1.0 ) ).xyz;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_CLIPPING_PLANES; i ++ ) {
  vClipDistance[ i ] = -dot( clippingWorldPosition, worldClippingPlanes[ i ].xyz ) - worldClippingPlanes[ i ].w;
}
#pragma unroll_loop_end
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <clipping_planes_pars_fragment>",
        THREE.ShaderChunk.clipping_planes_pars_fragment.replace(
          "varying vec3 vClipPosition;",
          "varying float vClipDistance[ NUM_CLIPPING_PLANES ];",
        ),
      )
      .replace(
        "#include <clipping_planes_fragment>",
        THREE.ShaderChunk.clipping_planes_fragment
          .replaceAll("- dot( vClipPosition, plane.xyz ) + plane.w", "-vClipDistance[ i ]")
          .replaceAll("dot( vClipPosition, plane.xyz ) > plane.w", "vClipDistance[ i ] > 0.0"),
      );
  };
  material.customProgramCacheKey = () => "world-clip-distance";
  return material;
}
